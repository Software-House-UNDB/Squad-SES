import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Perfil, TipoDocumento } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AtualizarEstagiarioDto } from './dto/estagiario.dto.js';
import { EstagiariosService } from './estagiarios.service.js';
import type { ProcessosService } from './processos.service.js';

const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB };

const ESTAGIARIO = {
  id: 'e1',
  processoId: 'p1',
  nome: 'Ana',
  cpf: '52998224725',
  matricula: 'M1',
  curso: 'Enfermagem',
  dataInicio: null,
  dataTermino: null,
  horasPorDia: null,
  diasSemana: [] as string[],
  horarioInicio: null,
  horarioFim: null,
};

type Gravado = Partial<Omit<typeof ESTAGIARIO, 'horasPorDia' | 'horarioInicio' | 'horarioFim'>> & {
  menorIdade?: boolean;
  responsavelNome?: string | null;
  horasPorDia?: number | null;
  horarioInicio?: string | null;
  horarioFim?: string | null;
};

type Doc = { id: string; tipo: TipoDocumento; storageKey: string };

function montar(gravado: Gravado = {}, documentos: Doc[] = []) {
  const antes = { menorIdade: false, responsavelNome: null, ...ESTAGIARIO, ...gravado };
  const tx = {
    estagiario: {
      findFirst: vi.fn().mockResolvedValue(antes),
      update: vi.fn(({ data }) => Promise.resolve({ ...antes, ...data })),
      delete: vi.fn(),
    },
    documento: {
      findMany: vi.fn().mockResolvedValue(documentos),
      delete: vi.fn(),
    },
    signatario: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  } as unknown as PrismaService;
  const processos = { obterEditavel: vi.fn() } as unknown as ProcessosService;
  const auditoria = { registrar: vi.fn() };
  const storage = { remover: vi.fn() };
  const service = new EstagiariosService(
    prisma,
    processos,
    auditoria as unknown as AuditoriaService,
    storage as unknown as StorageService,
  );
  return { tx, auditoria, storage, service };
}

// Passa pelo mesmo caminho do ValidationPipe, para o teste ver o DTO como o controller.
async function patch(corpo: object) {
  const dto = plainToInstance(AtualizarEstagiarioDto, corpo);
  expect(await validate(dto, { whitelist: true })).toEqual([]);
  return dto;
}

describe('EstagiariosService.atualizar (RF-13)', () => {
  it('recusa marcar como menor quem não tem responsável', async () => {
    const { tx, service } = montar({ menorIdade: false, responsavelNome: null });

    await expect(
      service.atualizar('p1', 'e1', await patch({ menorIdade: true }), REPRESENTANTE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.estagiario.update).not.toHaveBeenCalled();
  });

  it('recusa limpar o responsável de um menor', async () => {
    const { tx, service } = montar({ menorIdade: true, responsavelNome: 'Maria Souza' });

    await expect(
      service.atualizar('p1', 'e1', await patch({ responsavelNome: null }), REPRESENTANTE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.estagiario.update).not.toHaveBeenCalled();
  });

  it('mantém o responsável gravado quando o PATCH não o envia', async () => {
    const { service } = montar({ menorIdade: true, responsavelNome: 'Maria Souza' });

    const depois = await service.atualizar(
      'p1',
      'e1',
      await patch({ nome: 'Ana Lima' }),
      REPRESENTANTE,
    );

    expect(depois).toMatchObject({ nome: 'Ana Lima', responsavelNome: 'Maria Souza' });
  });

  it('aceita marcar como menor enviando o responsável', async () => {
    const { service } = montar({ menorIdade: false, responsavelNome: null });

    const depois = await service.atualizar(
      'p1',
      'e1',
      await patch({ menorIdade: true, responsavelNome: 'Maria Souza' }),
      REPRESENTANTE,
    );

    expect(depois).toMatchObject({ menorIdade: true, responsavelNome: 'Maria Souza' });
  });

  it('descarta o responsável de quem deixa de ser menor', async () => {
    const { service } = montar({ menorIdade: true, responsavelNome: 'Maria Souza' });

    const depois = await service.atualizar(
      'p1',
      'e1',
      await patch({ menorIdade: false }),
      REPRESENTANTE,
    );

    expect(depois).toMatchObject({ menorIdade: false, responsavelNome: null });
  });
});

describe('EstagiariosService.atualizar: teto da jornada (#79)', () => {
  const GRAVADA = { horasPorDia: 6, diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex'] };

  it('confere o dia a mais contra as horas já gravadas: 6 h × 6 dias', async () => {
    const { tx, service } = montar(GRAVADA);

    const erro = await service
      .atualizar(
        'p1',
        'e1',
        await patch({ diasSemana: [...GRAVADA.diasSemana, 'sab'] }),
        REPRESENTANTE,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect((erro as BadRequestException).message).toBe(
      'jornada acima do limite legal de 30 horas semanais (36 h)',
    );
    expect(tx.estagiario.update).not.toHaveBeenCalled();
  });

  it('confere o horário novo contra as horas já gravadas', async () => {
    const { tx, service } = montar({ ...GRAVADA, horarioInicio: '07:00', horarioFim: '13:00' });

    await expect(
      service.atualizar('p1', 'e1', await patch({ horarioFim: '12:00' }), REPRESENTANTE),
    ).rejects.toThrow('6 h por dia não cabem no horário de 07:00 a 12:00');
    expect(tx.estagiario.update).not.toHaveBeenCalled();
  });

  it('aceita reduzir os dias e as horas juntos', async () => {
    const { service } = montar({ horasPorDia: 4, diasSemana: ['seg', 'ter'] });

    const depois = await service.atualizar(
      'p1',
      'e1',
      await patch({ horasPorDia: 5, diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'] }),
      REPRESENTANTE,
    );

    expect(depois).toMatchObject({ horasPorDia: 5 });
  });
});

describe('EstagiariosService.remover', () => {
  const TCE = {
    id: 'd1',
    tipo: TipoDocumento.termo_compromisso,
    storageKey: 'processos/p1/tce/x.pdf',
  };
  const PESSOAL = {
    id: 'd2',
    tipo: TipoDocumento.documento_pessoal,
    storageKey: 'processos/p1/y.pdf',
  };

  it('apaga junto o TCE gerado, audita e só depois tira do bucket', async () => {
    const { tx, auditoria, storage, service } = montar({}, [TCE]);

    await service.remover('p1', 'e1', REPRESENTANTE);

    expect(tx.documento.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(tx.estagiario.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(
      auditoria.registrar.mock.calls.map(([, , { acao, entidade }]) => [acao, entidade]),
    ).toEqual([
      ['DELETE', 'documento'],
      ['DELETE', 'estagiario'],
    ]);
    // A chave do bucket não vai para a auditoria.
    expect(auditoria.registrar.mock.calls[0][2].dadosAntes).not.toHaveProperty('storageKey');
    expect(storage.remover).toHaveBeenCalledWith(TCE.storageKey);
    expect(storage.remover.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.estagiario.delete.mock.invocationCallOrder[0],
    );
  });

  it('documento anexado pelo representante continua bloqueando: 409', async () => {
    const { tx, storage, service } = montar({}, [TCE, PESSOAL]);

    await expect(service.remover('p1', 'e1', REPRESENTANTE)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.documento.delete).not.toHaveBeenCalled();
    expect(tx.estagiario.delete).not.toHaveBeenCalled();
    expect(storage.remover).not.toHaveBeenCalled();
  });

  it('TCE já em assinatura: 409 documento_em_assinatura', async () => {
    const { tx, service } = montar({}, [TCE]);
    tx.signatario.count.mockResolvedValue(1);

    await expect(service.remover('p1', 'e1', REPRESENTANTE)).rejects.toMatchObject({
      response: { erro: 'documento_em_assinatura' },
    });
    expect(tx.estagiario.delete).not.toHaveBeenCalled();
  });

  it('falha no bucket não desfaz a remoção', async () => {
    const { tx, storage, service } = montar({}, [TCE]);
    storage.remover.mockRejectedValue(new Error('B2 fora do ar'));

    await expect(service.remover('p1', 'e1', REPRESENTANTE)).resolves.toBeUndefined();
    expect(tx.estagiario.delete).toHaveBeenCalled();
  });
});
