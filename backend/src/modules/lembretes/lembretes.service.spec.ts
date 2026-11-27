import type { ConfigService } from '@nestjs/config';
import { PapelSignatario, StatusProcesso } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AssinaturasService } from '../assinaturas/assinaturas.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { LembretesService } from './lembretes.service.js';

// Quarta-feira, 25/11/2026, 08:30 em São Luís.
const QUARTA = new Date('2026-11-25T11:30:00Z');
// Próximo lembrete: sexta 27/11 (2 dias úteis); o link que vale até o fim dela fica.
const FIM_DA_SEXTA = new Date('2026-11-28T03:00:00Z');

const SUPERVISOR = {
  id: 's1',
  nome: 'Sup Souza',
  email: 'sup@exemplo.com',
  papel: PapelSignatario.SUPERVISOR,
  lembreteEnviadoEm: null as Date | null,
  linkEnviadoEm: new Date('2026-11-23T12:00:00Z') as Date | null,
  tokenExpiraEm: new Date('2026-11-30T12:00:00Z') as Date | null,
  otpExpiraEm: null as Date | null,
  documento: { processoId: 'p1' },
};

function montar(config: Record<string, string> = {}) {
  const tx = {};
  const prisma = {
    signatario: {
      findMany: vi.fn().mockResolvedValue([SUPERVISOR]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  };
  const assinaturas = { enviarLembrete: vi.fn().mockResolvedValue({ linkNovo: false }) };
  const auditoria = { registrar: vi.fn() };
  const service = new LembretesService(
    prisma as unknown as PrismaService,
    assinaturas as unknown as AssinaturasService,
    auditoria as unknown as AuditoriaService,
    { get: (nome: string) => config[nome] } as unknown as ConfigService,
  );
  return { service, prisma, assinaturas, auditoria };
}

describe('LembretesService.executar', () => {
  it('fim de semana e feriado: não consulta nem envia nada', async () => {
    const { service, prisma } = montar();

    for (const instante of ['2026-11-28T11:30:00Z', '2026-11-20T11:30:00Z']) {
      expect(await service.executar(new Date(instante))).toMatchObject({
        executado: false,
        motivo: 'dia_nao_util',
      });
    }
    expect(prisma.signatario.findMany).not.toHaveBeenCalled();
  });

  it('busca quem não assinou, com último contato até 2 dias úteis atrás', async () => {
    const { service, prisma } = montar();

    await service.executar(QUARTA);

    const { where } = prisma.signatario.findMany.mock.calls[0][0];
    // 2 dias úteis antes de quarta 25/11 é segunda 23/11: vale contato até o fim dela.
    const limite = new Date('2026-11-24T03:00:00Z');
    expect(where).toEqual({
      assinatura: { is: null },
      documento: { processo: { status: StatusProcesso.aguardando_assinaturas } },
      lembretesEnviados: { lt: 5 },
      AND: [
        { OR: [{ lembreteEnviadoEm: null }, { lembreteEnviadoEm: { lt: limite } }] },
        {
          OR: [
            { linkEnviadoEm: { lt: limite } },
            { linkEnviadoEm: null, criadoEm: { lt: limite } },
          ],
        },
      ],
    });
  });

  it('o feriado não conta: na segunda 23/11, o limite volta até quarta 18/11', async () => {
    const { service, prisma } = montar();

    await service.executar(new Date('2026-11-23T11:30:00Z'));

    const { where } = prisma.signatario.findMany.mock.calls[0][0];
    expect(where.AND[0].OR[1].lembreteEnviadoEm.lt).toEqual(new Date('2026-11-19T03:00:00Z'));
  });

  it('respeita os dias úteis e o máximo configurados', async () => {
    const { service, prisma } = montar({
      LEMBRETE_ASSINATURA_DIAS_UTEIS: '3',
      LEMBRETE_ASSINATURA_MAXIMO: '2',
    });

    await service.executar(QUARTA);

    const { where } = prisma.signatario.findMany.mock.calls[0][0];
    expect(where.lembretesEnviados).toEqual({ lt: 2 });
    // 3 dias úteis antes de quarta 25/11: quinta 19/11 (sexta 20/11 é feriado).
    expect(where.AND[0].OR[1].lembreteEnviadoEm.lt).toEqual(new Date('2026-11-20T03:00:00Z'));
  });

  it('trava, envia e audita sem usuário', async () => {
    const { service, prisma, assinaturas, auditoria } = montar();

    expect(await service.executar(QUARTA)).toEqual({
      executado: true,
      dia: '2026-11-25',
      enviados: 1,
      falhas: 0,
    });
    expect(prisma.signatario.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', lembreteEnviadoEm: null, assinatura: { is: null } },
      data: { lembreteEnviadoEm: QUARTA, lembretesEnviados: { increment: 1 } },
    });
    expect(assinaturas.enviarLembrete).toHaveBeenCalledWith(SUPERVISOR, FIM_DA_SEXTA, QUARTA);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      {},
      {},
      {
        acao: 'LEMBRETE',
        entidade: 'signatario',
        entidadeId: 's1',
        dadosDepois: { papel: PapelSignatario.SUPERVISOR, processoId: 'p1', linkNovo: false },
      },
    );
    // O e-mail não vai para a auditoria.
    expect(JSON.stringify(auditoria.registrar.mock.calls)).not.toContain('sup@exemplo.com');
  });

  it('o próximo lembrete pula fim de semana e feriado, e a auditoria diz se o link mudou', async () => {
    const { service, assinaturas, auditoria } = montar();
    assinaturas.enviarLembrete.mockResolvedValue({ linkNovo: true });

    // Quinta 19/11 + 2 dias úteis = terça 24/11 (sexta 20/11 é feriado): o link
    // que vale até o fim da terça fica.
    await service.executar(new Date('2026-11-19T11:30:00Z'));

    expect(assinaturas.enviarLembrete.mock.calls[0][1]).toEqual(new Date('2026-11-25T03:00:00Z'));
    expect(auditoria.registrar.mock.calls[0][2].dadosDepois.linkNovo).toBe(true);
  });

  it('outra execução já pegou o signatário (ou ele assinou): não envia', async () => {
    const { service, prisma, assinaturas } = montar();
    prisma.signatario.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.executar(QUARTA)).toMatchObject({ enviados: 0, falhas: 0 });
    expect(assinaturas.enviarLembrete).not.toHaveBeenCalled();
  });

  it('falha no e-mail devolve a vez e não para os outros', async () => {
    const { service, prisma, assinaturas, auditoria } = montar();
    const anterior = new Date('2026-11-20T12:00:00Z');
    prisma.signatario.findMany.mockResolvedValue([
      { ...SUPERVISOR, lembreteEnviadoEm: anterior },
      { ...SUPERVISOR, id: 's2', papel: PapelSignatario.ESTAGIARIO },
    ]);
    assinaturas.enviarLembrete.mockRejectedValueOnce(new Error('SMTP fora do ar'));

    expect(await service.executar(QUARTA)).toMatchObject({ enviados: 1, falhas: 1 });
    expect(prisma.signatario.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 's1', lembreteEnviadoEm: QUARTA },
      data: { lembreteEnviadoEm: anterior, lembretesEnviados: { decrement: 1 } },
    });
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar.mock.calls[0][2].entidadeId).toBe('s2');
  });

  it('FERIADOS_EXTRAS inválido não derruba a API', async () => {
    const { service } = montar({ FERIADOS_EXTRAS: '08/09' });

    expect(await service.executar(QUARTA)).toMatchObject({ executado: true });
  });

  it('feriado extra configurado pula o dia', async () => {
    const { service } = montar({ FERIADOS_EXTRAS: '11-25' });

    expect(await service.executar(QUARTA)).toMatchObject({ executado: false });
  });
});
