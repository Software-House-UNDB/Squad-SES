import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ProcessosService } from './processos.service.js';

// Escopo institucional (issue #54): representantes veem processos da própria instituição.

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES, instituicao: 'SES-MA' };
const REP_A = { id: 'repA', perfil: Perfil.REPRESENTANTE_UNDB, instituicao: 'UNDB' };
const REP_B = { id: 'repB', perfil: Perfil.REPRESENTANTE_UNDB, instituicao: 'UNDB' };
const REP_OUTRA_IES = { id: 'repX', perfil: Perfil.REPRESENTANTE_UNDB, instituicao: 'OUTRA' };
const REP_SEM_IES = { id: 'repY', perfil: Perfil.REPRESENTANTE_UNDB, instituicao: null };

type Linha = {
  id: string;
  status: StatusProcesso;
  criadoPorId: string;
  criadoPor: { instituicao: string | null };
  observacaoAnalise: null;
  estagiarios: { id: string }[];
};

// Banco em memória que aplica o where de verdade: sem isso o teste não provaria o escopo.
function bancoCom(linhas: Linha[]) {
  const casa = (linha: Linha, where: Record<string, unknown> = {}) => {
    const id = where.id as string | { in: string[] } | undefined;
    if (typeof id === 'string' && linha.id !== id) return false;
    if (id && typeof id === 'object' && !id.in.includes(linha.id)) return false;
    const criador = where.criadoPor as { instituicao?: string | null } | undefined;
    if (criador && criador.instituicao !== linha.criadoPor.instituicao) return false;
    return true;
  };
  const processo = {
    findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(linhas.find((l) => casa(l, where)) ?? null),
    ),
    findMany: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(linhas.filter((l) => casa(l, where))),
    ),
    count: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(linhas.filter((l) => casa(l, where)).length),
    ),
    update: vi.fn(({ where, data }: { where: { id: string }; data: object }) =>
      Promise.resolve({ ...linhas.find((l) => l.id === where.id), ...data }),
    ),
  };
  const tx = { processo };
  const prisma = {
    processo,
    $transaction: (operacao: unknown) =>
      typeof operacao === 'function' ? operacao(tx) : Promise.all(operacao as Promise<unknown>[]),
  } as unknown as PrismaService;
  const auditoria = { registrar: vi.fn(), registrarAcesso: vi.fn() } as unknown as AuditoriaService;
  return { tx, processo, service: new ProcessosService(prisma, auditoria) };
}

const processoDe = (
  id: string,
  criadoPorId: string,
  instituicao: string | null,
  status: StatusProcesso = StatusProcesso.rascunho,
): Linha => ({
  id,
  status,
  criadoPorId,
  criadoPor: { instituicao },
  observacaoAnalise: null,
  estagiarios: [],
});

const BANCO = [
  processoDe('p-undb-a', 'repA', 'UNDB'),
  processoDe('p-undb-b', 'repB', 'UNDB'),
  processoDe('p-outra', 'repX', 'OUTRA'),
];

describe('escopo institucional: leitura', () => {
  it('representante vê o processo criado por outro representante da mesma IES', async () => {
    const { service } = bancoCom(BANCO);

    await expect(service.buscar('p-undb-b', REP_A)).resolves.toMatchObject({ id: 'p-undb-b' });
  });

  it('representante recebe 404 para processo de outra IES', async () => {
    const { service } = bancoCom(BANCO);

    await expect(service.buscar('p-outra', REP_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('representante sem instituição não vê nenhum processo', async () => {
    const { service, processo } = bancoCom(BANCO);

    await expect(service.buscar('p-undb-a', REP_SEM_IES)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listar({ pagina: 1, limite: 20 } as never, REP_SEM_IES),
    ).resolves.toMatchObject({ itens: [], total: 0 });
    expect(processo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) }),
    );
  });

  it('listagem do representante traz só a própria instituição', async () => {
    const { service } = bancoCom(BANCO);

    const resposta = await service.listar({ pagina: 1, limite: 20 } as never, REP_A);

    expect(resposta.itens.map((p) => p.id).sort()).toEqual(['p-undb-a', 'p-undb-b']);
    expect(resposta.total).toBe(2);
  });

  it('coordenação continua vendo todos os processos, de qualquer IES', async () => {
    const { service } = bancoCom(BANCO);

    await expect(service.buscar('p-outra', COORDENACAO)).resolves.toMatchObject({ id: 'p-outra' });
    const resposta = await service.listar({ pagina: 1, limite: 20 } as never, COORDENACAO);
    expect(resposta.total).toBe(3);
  });
});

describe('escopo institucional: edição (opção A)', () => {
  it('representante B edita rascunho criado pelo representante A da mesma IES', async () => {
    const { service, tx } = bancoCom(BANCO);

    await expect(
      service.atualizar('p-undb-a', { supervisorNome: 'Maria' } as never, REP_B),
    ).resolves.toMatchObject({ id: 'p-undb-a' });
    expect(tx.processo.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-undb-a' } }),
    );
  });

  it('representante B edita pendência criada pelo representante A da mesma IES', async () => {
    const { service } = bancoCom([processoDe('p-pend', 'repA', 'UNDB', StatusProcesso.pendencia)]);

    await expect(
      service.atualizar('p-pend', { supervisorNome: 'Maria' } as never, REP_B),
    ).resolves.toMatchObject({ id: 'p-pend' });
  });

  it('representante de outra IES não consegue editar (404)', async () => {
    const { service, tx } = bancoCom(BANCO);

    await expect(
      service.atualizar('p-undb-a', { supervisorNome: 'x' } as never, REP_OUTRA_IES),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.processo.update).not.toHaveBeenCalled();
  });

  it('coordenação só altera processo que ela mesma criou', async () => {
    const { service, tx } = bancoCom(BANCO);

    await expect(
      service.obterEditavel(tx as never, 'p-undb-a', COORDENACAO),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
