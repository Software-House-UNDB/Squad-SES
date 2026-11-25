import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Perfil, StatusProcesso, TipoComentario } from '../../generated/prisma/enums.js';
import { exigirPodeComentar } from './regras-comentario.js';

const TODOS_STATUS = Object.values(StatusProcesso);
const TODOS_TIPOS = Object.values(TipoComentario);

// Mesma regra do ProcessosService.analisar: a coordenação comenta o que já foi
// enviado e ainda não foi aprovado.
const STATUS_DA_COORDENACAO: StatusProcesso[] = ['enviado', 'em_analise', 'pendencia'];
// O representante responde quando o processo voltou com pendência.
const STATUS_DO_REPRESENTANTE: StatusProcesso[] = ['pendencia'];

const fora = (permitidos: StatusProcesso[]) => TODOS_STATUS.filter((s) => !permitidos.includes(s));

describe('exigirPodeComentar', () => {
  describe('coordenação SES', () => {
    it.each(
      (['pendencia', 'observacao'] as const).flatMap((tipo) =>
        STATUS_DA_COORDENACAO.map((status) => [tipo, status] as const),
      ),
    )('pode comentar %s com o processo em %s', (tipo, status) => {
      expect(() => exigirPodeComentar(Perfil.COORDENACAO_SES, tipo, status)).not.toThrow();
    });

    it.each(
      (['pendencia', 'observacao'] as const).flatMap((tipo) =>
        fora(STATUS_DA_COORDENACAO).map((status) => [tipo, status] as const),
      ),
    )('recusa %s com 409 status_invalido quando o processo está em %s', (tipo, status) => {
      const erro = captura(() => exigirPodeComentar(Perfil.COORDENACAO_SES, tipo, status));

      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({
        erro: 'status_invalido',
        message: `Processo em ${status} não aceita comentário do tipo ${tipo}`,
      });
    });

    it.each(TODOS_STATUS)('nunca escreve resposta (processo em %s): 403', (status) => {
      expect(() => exigirPodeComentar(Perfil.COORDENACAO_SES, 'resposta', status)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('representante da UNDB', () => {
    it.each(STATUS_DO_REPRESENTANTE)('pode responder com o processo em %s', (status) => {
      expect(() => exigirPodeComentar(Perfil.REPRESENTANTE_UNDB, 'resposta', status)).not.toThrow();
    });

    it.each(fora(STATUS_DO_REPRESENTANTE))(
      'recusa resposta com 409 status_invalido quando o processo está em %s',
      (status) => {
        const erro = captura(() =>
          exigirPodeComentar(Perfil.REPRESENTANTE_UNDB, 'resposta', status),
        );

        expect(erro).toBeInstanceOf(ConflictException);
        expect((erro as ConflictException).getResponse()).toMatchObject({
          erro: 'status_invalido',
        });
      },
    );

    it.each(
      (['pendencia', 'observacao'] as const).flatMap((tipo) =>
        TODOS_STATUS.map((status) => [tipo, status] as const),
      ),
    )('nunca escreve %s (processo em %s): 403', (tipo, status) => {
      expect(() => exigirPodeComentar(Perfil.REPRESENTANTE_UNDB, tipo, status)).toThrow(
        ForbiddenException,
      );
    });
  });

  it('o 403 de perfil vale antes do 409 de status: não revela o estado do processo', () => {
    // Quem não pode escrever aquele tipo recebe 403 mesmo com status que também seria recusado.
    expect(() => exigirPodeComentar(Perfil.REPRESENTANTE_UNDB, 'pendencia', 'concluido')).toThrow(
      ForbiddenException,
    );
  });

  it('cobre todas as combinações: cada tipo tem exatamente um perfil autorizado', () => {
    for (const tipo of TODOS_TIPOS) {
      const autorizados = Object.values(Perfil).filter((perfil) =>
        TODOS_STATUS.some((status) => !lanca(() => exigirPodeComentar(perfil, tipo, status))),
      );
      expect(autorizados).toHaveLength(1);
    }
  });
});

function captura(fn: () => unknown): unknown {
  try {
    fn();
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava que a função lançasse');
}

function lanca(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
