import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ApontarPendenciaDto } from './dto/processo.dto.js';
import { ProcessosService } from './processos.service.js';

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES };
const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB };

type ProcessoFalso = {
  id: string;
  status: StatusProcesso;
  observacaoAnalise: string | null;
  criadoPorId: string;
};

// Banco falso com um processo só: o updateMany respeita a condição de status,
// como o Postgres faria, para os testes seguirem o fluxo real de transições.
function montar(inicial: Partial<ProcessoFalso> | null = {}) {
  let processo: ProcessoFalso | null = inicial && {
    id: 'p1',
    status: StatusProcesso.rascunho,
    observacaoAnalise: null,
    criadoPorId: 'rep',
    ...inicial,
  };
  const tx = {
    processo: {
      findFirst: vi.fn(() => Promise.resolve(processo && { ...processo })),
      updateMany: vi.fn(
        ({ where, data }: { where: { status: StatusProcesso }; data: object }) => {
          if (!processo || processo.status !== where.status) return Promise.resolve({ count: 0 });
          processo = { ...processo, ...data };
          return Promise.resolve({ count: 1 });
        },
      ),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...processo })),
    },
  };
  const prisma = {
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  } as unknown as PrismaService;
  const auditoria = { registrar: vi.fn() } as unknown as AuditoriaService;
  const service = new ProcessosService(prisma, auditoria);
  return { tx, auditoria, service, atual: () => processo };
}

const erroDe = (promessa: Promise<unknown>) => promessa.catch((e: unknown) => e);

// Cada ação, chamada pelo perfil certo.
const ACOES = {
  enviar: (s: ProcessosService) => s.enviar('p1', REPRESENTANTE),
  iniciarAnalise: (s: ProcessosService) => s.iniciarAnalise('p1', COORDENACAO),
  apontarPendencia: (s: ProcessosService) =>
    s.apontarPendencia('p1', { motivo: 'Apólice vencida' }, COORDENACAO),
  aprovar: (s: ProcessosService) => s.aprovar('p1', COORDENACAO),
};

describe('ProcessosService: transições permitidas', () => {
  it.each([
    ['enviar', StatusProcesso.rascunho, StatusProcesso.enviado],
    ['enviar', StatusProcesso.pendencia, StatusProcesso.enviado],
    ['iniciarAnalise', StatusProcesso.enviado, StatusProcesso.em_analise],
    ['apontarPendencia', StatusProcesso.em_analise, StatusProcesso.pendencia],
    ['aprovar', StatusProcesso.em_analise, StatusProcesso.aprovado],
  ] as const)('%s leva de %s a %s e audita', async (acao, de, para) => {
    const { tx, auditoria, service } = montar({ status: de });

    const processo = await ACOES[acao](service);

    expect(processo.status).toBe(para);
    expect(tx.processo.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: de },
      data: expect.objectContaining({ status: para }),
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      expect.objectContaining({
        acao: 'TRANSICAO',
        entidade: 'processo',
        entidadeId: 'p1',
        dadosAntes: expect.objectContaining({ status: de }),
        dadosDepois: expect.objectContaining({ status: para }),
      }),
    );
  });

  it('a pendência grava o motivo e audita a observação anterior', async () => {
    const { auditoria, service, atual } = montar({
      status: StatusProcesso.em_analise,
      observacaoAnalise: 'nota antiga',
    });

    await service.apontarPendencia('p1', { motivo: 'Apólice vencida' }, COORDENACAO);

    expect(atual()?.observacaoAnalise).toBe('Apólice vencida');
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), COORDENACAO, {
      acao: 'TRANSICAO',
      entidade: 'processo',
      entidadeId: 'p1',
      dadosAntes: { status: StatusProcesso.em_analise, observacaoAnalise: 'nota antiga' },
      dadosDepois: { status: StatusProcesso.pendencia, observacaoAnalise: 'Apólice vencida' },
    });
  });

  it('o reenvio mantém o motivo da pendência', async () => {
    const { service, atual } = montar({
      status: StatusProcesso.pendencia,
      observacaoAnalise: 'Apólice vencida',
    });

    await service.enviar('p1', REPRESENTANTE);

    expect(atual()).toMatchObject({
      status: StatusProcesso.enviado,
      observacaoAnalise: 'Apólice vencida',
    });
  });
});

describe('ProcessosService: transições recusadas', () => {
  it.each([
    ['enviar', COORDENACAO],
    ['iniciarAnalise', REPRESENTANTE],
    ['apontarPendencia', REPRESENTANTE],
    ['aprovar', REPRESENTANTE],
  ] as const)('%s com o perfil errado: 403 sem tocar no banco', async (acao, usuario) => {
    const { tx, service } = montar({ status: StatusProcesso.em_analise });
    const chamadas = {
      enviar: () => service.enviar('p1', usuario),
      iniciarAnalise: () => service.iniciarAnalise('p1', usuario),
      apontarPendencia: () => service.apontarPendencia('p1', { motivo: 'x' }, usuario),
      aprovar: () => service.aprovar('p1', usuario),
    };

    expect(await erroDe(chamadas[acao]())).toBeInstanceOf(ForbiddenException);
    expect(tx.processo.findFirst).not.toHaveBeenCalled();
  });

  it('processo inexistente ou fora do escopo: 404', async () => {
    const { service } = montar(null);

    expect(await erroDe(service.enviar('p1', REPRESENTANTE))).toBeInstanceOf(NotFoundException);
  });

  it('o representante só alcança processos do próprio escopo', async () => {
    const { tx, service } = montar();

    await service.enviar('p1', REPRESENTANTE);

    expect(tx.processo.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', criadoPorId: 'rep' },
    });
  });

  it.each([
    ['enviar', StatusProcesso.enviado],
    ['enviar', StatusProcesso.em_analise],
    ['enviar', StatusProcesso.aprovado],
    ['enviar', StatusProcesso.aguardando_assinaturas],
    ['enviar', StatusProcesso.concluido],
    ['iniciarAnalise', StatusProcesso.rascunho],
    ['iniciarAnalise', StatusProcesso.em_analise],
    ['iniciarAnalise', StatusProcesso.pendencia],
    ['iniciarAnalise', StatusProcesso.aprovado],
    ['apontarPendencia', StatusProcesso.enviado],
    ['apontarPendencia', StatusProcesso.pendencia],
    ['apontarPendencia', StatusProcesso.aprovado],
    ['aprovar', StatusProcesso.rascunho],
    ['aprovar', StatusProcesso.enviado],
    ['aprovar', StatusProcesso.pendencia],
    ['aprovar', StatusProcesso.aprovado],
    ['aprovar', StatusProcesso.aguardando_assinaturas],
  ] as const)('%s em %s: 409 transicao_invalida com o status atual', async (acao, status) => {
    const { tx, auditoria, service } = montar({ status });

    const erro = await erroDe(ACOES[acao](service));

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      erro: 'transicao_invalida',
      message: expect.stringContaining(`Processo em ${status}`),
    });
    expect(tx.processo.updateMany).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('status mudou entre a leitura e o UPDATE: 409 e nada é auditado', async () => {
    const { tx, auditoria, service } = montar({ status: StatusProcesso.enviado });
    tx.processo.updateMany.mockResolvedValueOnce({ count: 0 });

    const erro = await erroDe(service.iniciarAnalise('p1', COORDENACAO));

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      erro: 'transicao_invalida',
    });
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});

describe('ProcessosService: fluxo completo com edição', () => {
  const editavel = (service: ProcessosService, tx: unknown) =>
    erroDe(service.obterEditavel(tx as never, 'p1', REPRESENTANTE));

  it('rascunho → enviado → em_analise → pendencia → enviado → em_analise → aprovado', async () => {
    const { tx, service, atual } = montar();

    expect(await editavel(service, tx)).toMatchObject({ status: StatusProcesso.rascunho });

    await service.enviar('p1', REPRESENTANTE);
    expect(await editavel(service, tx)).toBeInstanceOf(ConflictException);

    await service.iniciarAnalise('p1', COORDENACAO);
    expect(await editavel(service, tx)).toBeInstanceOf(ConflictException);

    await service.apontarPendencia('p1', { motivo: 'Apólice vencida' }, COORDENACAO);
    // Na pendência o representante volta a poder corrigir.
    expect(await editavel(service, tx)).toMatchObject({ status: StatusProcesso.pendencia });

    await service.enviar('p1', REPRESENTANTE);
    expect(atual()?.status).toBe(StatusProcesso.enviado);
    expect(await editavel(service, tx)).toBeInstanceOf(ConflictException);

    await service.iniciarAnalise('p1', COORDENACAO);
    await service.aprovar('p1', COORDENACAO);
    expect(atual()?.status).toBe(StatusProcesso.aprovado);
    expect(await editavel(service, tx)).toBeInstanceOf(ConflictException);
  });
});

describe('ApontarPendenciaDto', () => {
  const validar = (corpo: object) =>
    validate(plainToInstance(ApontarPendenciaDto, corpo), { whitelist: true });

  it('apara o motivo', async () => {
    const dto = plainToInstance(ApontarPendenciaDto, { motivo: '  Apólice vencida  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.motivo).toBe('Apólice vencida');
  });

  it.each([{}, { motivo: '' }, { motivo: '   ' }, { motivo: 42 }, { motivo: 'a'.repeat(2001) }])(
    'recusa %j',
    async (corpo) => {
      expect(await validar(corpo)).not.toEqual([]);
    },
  );
});
