import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type AcaoAuditoria, AuditoriaService } from './auditoria.service.js';

export const AUDITAR_CHAVE = 'auditar';

export type OpcoesAuditar = {
  entidade: string;
  // Padrão: derivada do método HTTP (POST=CREATE, PUT/PATCH=UPDATE, DELETE=DELETE).
  acao?: AcaoAuditoria;
  // Parâmetro de rota com o id da entidade. Padrão: "id". Se a rota não tiver
  // o parâmetro (ex.: POST de criação), usa o "id" da resposta.
  parametroId?: string;
};

const ACAO_POR_METODO: Record<string, AcaoAuditoria> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

type Requisicao = {
  method: string;
  ip?: string;
  params?: Record<string, string>;
  // Preenchido pelo guard de autenticação.
  usuario?: { id?: string };
};

const ehCorpoJson = (resposta: unknown): resposta is object =>
  typeof resposta === 'object' &&
  resposta !== null &&
  !Buffer.isBuffer(resposta) &&
  !(resposta instanceof StreamableFile);

/**
 * Registra na trilha de auditoria as chamadas que terminam com sucesso nos
 * handlers marcados com @Auditar(). Rotas que já gravam a auditoria dentro da
 * própria transação (registrar(tx, ...)) não devem usar o decorator, senão a
 * ação é registrada duas vezes.
 *
 * Não é atômico com a ação: o registro é gravado depois que o handler conclui.
 * Se a gravação falhar, o erro vai para o log e a resposta da API é mantida,
 * porque a ação já foi efetivada e devolver 500 levaria o cliente a repeti-la.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const opcoes = this.reflector.getAllAndOverride<OpcoesAuditar | undefined>(AUDITAR_CHAVE, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!opcoes) return proximo.handle();

    const requisicao = contexto.switchToHttp().getRequest<Requisicao>();
    const acao = opcoes.acao ?? ACAO_POR_METODO[requisicao.method];

    return proximo.handle().pipe(
      mergeMap(async (resposta: unknown) => {
        await this.gravar(opcoes, acao, requisicao, resposta);
        return resposta;
      }),
    );
  }

  private async gravar(
    opcoes: OpcoesAuditar,
    acao: AcaoAuditoria | undefined,
    requisicao: Requisicao,
    resposta: unknown,
  ) {
    try {
      if (!acao) {
        throw new Error(`método ${requisicao.method} sem ação definida em @Auditar`);
      }
      const corpo = ehCorpoJson(resposta) ? resposta : undefined;
      const idDaResposta = (corpo as { id?: unknown } | undefined)?.id;
      const entidadeId =
        requisicao.params?.[opcoes.parametroId ?? 'id'] ??
        (typeof idDaResposta === 'string' ? idDaResposta : undefined);
      if (!entidadeId) {
        throw new Error('id da entidade não encontrado na rota nem na resposta');
      }

      await this.auditoria.registrar(
        this.prisma,
        { id: requisicao.usuario?.id, ip: requisicao.ip },
        { acao, entidade: opcoes.entidade, entidadeId, dadosDepois: corpo },
      );
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar auditoria de ${requisicao.method} em ${opcoes.entidade}`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }
}
