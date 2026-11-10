import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Documento, Prisma } from '../../generated/prisma/client.js';
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
    await this.validarDestino(this.prisma, processoId, dto.estagiarioId, usuario);

    const hashSha256 = calcularSha256(arquivo.buffer);
    const storageKey = `processos/${processoId}/${randomUUID()}.pdf`;
    await this.storage.enviar(storageKey, arquivo.buffer, MIME_PDF, hashSha256);

    try {
      const documento = await this.prisma.$transaction(async (tx) => {
        await this.validarDestino(tx, processoId, dto.estagiarioId, usuario);
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
          acao: 'CREATE',
          entidade: 'documento',
          entidadeId: documento.id,
          dadosDepois: documento,
        });
        return documento;
      });
      return semChave(documento);
    } catch (erro) {
      await this.removerObjeto(storageKey);
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
      await this.processos.obterEditavel(tx, processoId, usuario);
      const documento = await this.obter(tx, processoId, id);
      await tx.documento.delete({ where: { id } });
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

  private async validarDestino(
    cliente: Prisma.TransactionClient,
    processoId: string,
    estagiarioId: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    await this.processos.obterEditavel(cliente, processoId, usuario);
    if (!estagiarioId) return;

    const estagiario = await cliente.estagiario.findFirst({
      where: { id: estagiarioId, processoId },
      select: { id: true },
    });
    if (!estagiario) throw new NotFoundException('Estagiário não encontrado');
  }

  private async obter(cliente: Prisma.TransactionClient, processoId: string, id: string) {
    const documento = await cliente.documento.findFirst({
      where: { id, processoId },
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
