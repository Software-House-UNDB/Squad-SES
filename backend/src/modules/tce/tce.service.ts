import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { conflito } from '../../common/conflito.js';
import { Perfil, StatusProcesso, TipoDocumento } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { calcularSha256, MIME_PDF } from '../documentos/arquivo.js';
import { RenderizadorPdfService } from './renderizador-pdf.service.js';
import {
  garantirDadosTce,
  lerConfiguracaoTce,
  montarDadosTce,
  nomeArquivoTce,
} from './tce-dados.js';

type TceGerado = {
  estagiarioId: string;
  nomeArquivo: string;
  conteudo: Buffer;
  hashSha256: string;
  storageKey: string;
};

/**
 * Geração dos TCEs (Termo de Compromisso de Estágio), um PDF por estagiário,
 * a partir do backend/templates/tce.html.
 *
 * Passo explícito da coordenação SES entre "aprovado" e o /iniciar das
 * assinaturas. Pode ser repetido enquanto o processo estiver em "aprovado":
 * cada geração substitui todos os TCEs do processo, inclusive os enviados
 * por upload (provisórios) e os gerados antes. Depois do /iniciar os
 * signatários ficam presos aos documentos, e o TCE não muda mais.
 */
@Injectable()
export class TceService {
  private readonly logger = new Logger(TceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
    private readonly renderizador: RenderizadorPdfService,
  ) {}

  async gerar(processoId: string, usuario: UsuarioAutenticado) {
    if (usuario.perfil !== Perfil.COORDENACAO_SES) {
      throw new ForbiddenException('Apenas a coordenação SES gera os TCEs');
    }
    const processo = await this.prisma.processo.findUnique({
      where: { id: processoId },
      include: { estagiarios: { orderBy: [{ nome: 'asc' }, { id: 'asc' }] } },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    this.garantirAprovado(processo.status);
    const configuracao = lerConfiguracaoTce((nome) => this.config.get<string>(nome));
    garantirDadosTce(processo);

    // A renderização e o upload ficam fora da transação: levam segundos.
    const emissao = new Date();
    const pdfs = await this.renderizador.renderizarTces(
      processo.estagiarios.map((estagiario) =>
        montarDadosTce(processo, estagiario, configuracao, emissao),
      ),
    );
    const gerados: TceGerado[] = processo.estagiarios.map((estagiario, i) => ({
      estagiarioId: estagiario.id,
      nomeArquivo: nomeArquivoTce(estagiario.nome),
      conteudo: pdfs[i],
      hashSha256: calcularSha256(pdfs[i]),
      storageKey: `processos/${processoId}/tce/${randomUUID()}.pdf`,
    }));

    const enviados: string[] = [];
    let resultado;
    try {
      for (const tce of gerados) {
        await this.storage.enviar(tce.storageKey, tce.conteudo, MIME_PDF, tce.hashSha256);
        enviados.push(tce.storageKey);
      }
      resultado = await this.substituir(processoId, gerados, usuario);
    } catch (erro) {
      await Promise.all(enviados.map((chave) => this.removerObjeto(chave)));
      throw erro;
    }

    // Os PDFs antigos só saem do bucket depois do commit: falhar aqui deixa
    // um órfão, nunca um registro apontando para arquivo inexistente.
    await Promise.all(resultado.substituidos.map((chave) => this.removerObjeto(chave)));
    return {
      processoId,
      substituidos: resultado.substituidos.length,
      tces: resultado.criados,
    };
  }

  private substituir(processoId: string, gerados: TceGerado[], usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      // Trava o processo: o /iniciar e outra geração simultânea esperam o
      // commit, e o status é conferido de novo já com a trava.
      const [travado] = await tx.$queryRaw<{ status: StatusProcesso }[]>`
        SELECT status FROM processos WHERE id = ${processoId}::uuid FOR UPDATE`;
      if (!travado) throw new NotFoundException('Processo não encontrado');
      this.garantirAprovado(travado.status);

      const antigos = await tx.documento.findMany({
        where: { processoId, tipo: TipoDocumento.termo_compromisso },
      });
      // Em "aprovado" ainda não há signatários; a checagem evita o P2003 (500)
      // se um dia a ordem dos passos mudar.
      const emAssinatura = await tx.signatario.count({
        where: { documentoId: { in: antigos.map((documento) => documento.id) } },
      });
      if (emAssinatura > 0) {
        throw conflito(
          'documento_em_assinatura',
          'Há TCE enviado para assinatura; ele não pode mais ser substituído',
        );
      }

      for (const { storageKey: _chave, ...antigo } of antigos) {
        await tx.documento.delete({ where: { id: antigo.id } });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'DELETE',
          entidade: 'documento',
          entidadeId: antigo.id,
          dadosAntes: antigo,
        });
      }

      const criados = [];
      for (const tce of gerados) {
        const { storageKey: _chave, ...documento } = await tx.documento.create({
          data: {
            processoId,
            estagiarioId: tce.estagiarioId,
            tipo: TipoDocumento.termo_compromisso,
            nomeArquivo: tce.nomeArquivo,
            mimeType: MIME_PDF,
            tamanhoBytes: tce.conteudo.length,
            hashSha256: tce.hashSha256,
            storageKey: tce.storageKey,
            enviadoPorId: usuario.id,
          },
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'CREATE',
          entidade: 'documento',
          entidadeId: documento.id,
          dadosDepois: documento,
        });
        criados.push(documento);
      }
      return { criados, substituidos: antigos.map((documento) => documento.storageKey) };
    });
  }

  private garantirAprovado(status: StatusProcesso) {
    if (status !== StatusProcesso.aprovado) {
      throw conflito(
        'status_invalido',
        `Processo em ${status} não pode gerar TCEs, só em ${StatusProcesso.aprovado}`,
      );
    }
  }

  private async removerObjeto(chave: string) {
    try {
      await this.storage.remover(chave);
    } catch (erro) {
      this.logger.error(`Objeto órfão no storage: ${chave}`, erro);
    }
  }
}
