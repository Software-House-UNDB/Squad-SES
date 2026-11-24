import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { conflito } from '../../common/conflito.js';
import type { Documento, Prisma } from '../../generated/prisma/client.js';
import { Perfil, TipoDocumento } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ProcessosService } from '../processos/processos.service.js';
import {
  type ArquivoRecebido,
  calcularSha256,
  garantirPdf,
  MIME_PDF,
  nomeOriginal,
} from './arquivo.js';
import { EnviarDocumentoDto } from './dto/documento.dto.js';

const VALIDADE_URL_SEGUNDOS = 5 * 60;
const MENSAGEM_DUPLICADO = 'Documento já enviado neste processo';

// O que a SES produz e devolve à UNDB. O TCE e os documentos do pacote
// continuam só com o representante.
const TIPOS_RETORNO: TipoDocumento[] = [
  TipoDocumento.oficio,
  TipoDocumento.oficio_alteracao,
  TipoDocumento.kit_estagio,
  TipoDocumento.anexo,
];

// A chave do objeto não sai na API: o acesso é só pela URL assinada.
function semChave({ storageKey: _chave, ...documento }: Documento) {
  return documento;
}

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processos: ProcessosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(processoId: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    return this.prisma.documento.findMany({
      where: { processoId },
      omit: { storageKey: true },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async enviar(
    processoId: string,
    arquivo: ArquivoRecebido,
    dto: EnviarDocumentoDto,
    usuario: UsuarioAutenticado,
  ) {
    garantirPdf(arquivo.buffer);
    // Confere antes de subir o arquivo para não deixar objeto órfão à toa.
    await this.validarDestino(this.prisma, processoId, dto, usuario);
    const hashSha256 = calcularSha256(arquivo.buffer);
    await this.garantirInedito(this.prisma, processoId, hashSha256);

    const storageKey = `processos/${processoId}/${randomUUID()}.pdf`;
    await this.storage.enviar(storageKey, arquivo.buffer, MIME_PDF, hashSha256);

    try {
      const documento = await this.prisma.$transaction(async (tx) => {
        await this.validarDestino(tx, processoId, dto, usuario);
        await this.garantirInedito(tx, processoId, hashSha256);
        const documento = await tx.documento.create({
          data: {
            processoId,
            estagiarioId: dto.estagiarioId,
            tipo: dto.tipo,
            nomeArquivo: nomeOriginal(arquivo.originalname),
            mimeType: MIME_PDF,
            tamanhoBytes: arquivo.buffer.length,
            hashSha256,
            storageKey,
            enviadoPorId: usuario.id,
          },
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: usuario.perfil === Perfil.COORDENACAO_SES ? 'RETORNO_COORDENACAO' : 'CREATE',
          entidade: 'documento',
          entidadeId: documento.id,
          dadosDepois: documento,
        });
        return documento;
      });
      return semChave(documento);
    } catch (erro) {
      await this.removerObjeto(storageKey);
      // Corrida de duplo clique: as duas requisições passaram pelo findFirst,
      // e o índice único (processo_id, hash_sha256) barrou a segunda.
      if ((erro as { code?: string }).code === 'P2002') {
        throw conflito('arquivo_repetido', MENSAGEM_DUPLICADO);
      }
      throw erro;
    }
  }

  async gerarUrl(processoId: string, id: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    const documento = await this.obter(this.prisma, processoId, id);

    const expiraEm = new Date(Date.now() + VALIDADE_URL_SEGUNDOS * 1000);
    const url = await this.storage.urlAssinada(
      documento.storageKey,
      documento.nomeArquivo,
      documento.mimeType,
      VALIDADE_URL_SEGUNDOS,
    );
    return { url, expiraEm };
  }

  async remover(processoId: string, id: string, usuario: UsuarioAutenticado) {
    const documento = await this.prisma.$transaction(async (tx) => {
      await this.obterProcessoGravavel(tx, processoId, usuario);
      const { enviadoPor, ...documento } = await this.obterComAutor(tx, processoId, id);
      // Documento enviado para assinatura (TCE com signatários) não sai mais:
      // a FK com RESTRICT recusaria o delete com P2003, e a API daria 500.
      if (await tx.signatario.count({ where: { documentoId: id } })) {
        throw conflito(
          'documento_em_assinatura',
          'Documento enviado para assinatura não pode ser removido',
        );
      }
      // Cada lado só desfaz o próprio envio: a coordenação não apaga o pacote
      // do representante, e o representante não apaga o retorno da SES. A
      // regra é por perfil, não por pessoa: qualquer usuário da coordenação
      // corrige o retorno enviado por outro colega da SES. Do lado da UNDB
      // dá no mesmo, porque só o criador do processo envia documentos nele.
      if (enviadoPor.perfil !== usuario.perfil) {
        throw new ForbiddenException('Cada lado só remove os documentos que enviou');
      }
      try {
        await tx.documento.delete({ where: { id } });
      } catch (erro) {
        // Duas exclusões simultâneas passam pela leitura; a que perde o delete recebe P2025.
        if ((erro as { code?: string }).code === 'P2025') {
          throw new NotFoundException('Documento não encontrado');
        }
        throw erro;
      }
      await this.auditoria.registrar(tx, usuario, {
        acao: 'DELETE',
        entidade: 'documento',
        entidadeId: id,
        dadosAntes: documento,
      });
      return documento;
    });
    // Só apaga o objeto depois do commit: falhar aqui deixa um órfão no
    // bucket, nunca um registro apontando para arquivo inexistente.
    await this.removerObjeto(documento.storageKey);
  }

  // Representante: o próprio processo, em rascunho ou pendência.
  // Coordenação: documentos de retorno, depois da aprovação (issue #24).
  private obterProcessoGravavel(
    cliente: Prisma.TransactionClient,
    processoId: string,
    usuario: UsuarioAutenticado,
  ) {
    return usuario.perfil === Perfil.COORDENACAO_SES
      ? this.processos.obterParaRetorno(cliente, processoId, usuario)
      : this.processos.obterEditavel(cliente, processoId, usuario);
  }

  private async validarDestino(
    cliente: Prisma.TransactionClient,
    processoId: string,
    { tipo, estagiarioId }: EnviarDocumentoDto,
    usuario: UsuarioAutenticado,
  ) {
    if (usuario.perfil === Perfil.COORDENACAO_SES && !TIPOS_RETORNO.includes(tipo)) {
      throw new ForbiddenException(`A coordenação não envia documentos do tipo ${tipo}`);
    }
    await this.obterProcessoGravavel(cliente, processoId, usuario);
    if (!estagiarioId) return;

    const estagiario = await cliente.estagiario.findFirst({
      where: { id: estagiarioId, processoId },
      select: { id: true },
    });
    if (!estagiario) throw new NotFoundException('Estagiário não encontrado');
  }

  // Mesmo conteúdo no mesmo processo é reenvio (duplo clique em "enviar").
  private async garantirInedito(
    cliente: Prisma.TransactionClient,
    processoId: string,
    hashSha256: string,
  ) {
    const duplicado = await cliente.documento.findFirst({
      where: { processoId, hashSha256 },
      select: { id: true },
    });
    if (duplicado) throw conflito('arquivo_repetido', MENSAGEM_DUPLICADO);
  }

  private async obter(cliente: Prisma.TransactionClient, processoId: string, id: string) {
    const documento = await cliente.documento.findFirst({
      where: { id, processoId },
    });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    return documento;
  }

  private async obterComAutor(
    cliente: Prisma.TransactionClient,
    processoId: string,
    id: string,
  ) {
    const documento = await cliente.documento.findFirst({
      where: { id, processoId },
      include: { enviadoPor: { select: { perfil: true } } },
    });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    return documento;
  }

  private async removerObjeto(chave: string) {
    try {
      await this.storage.remover(chave);
    } catch (erro) {
      this.logger.error(`Objeto órfão no storage: ${chave}`, erro);
    }
  }
}
