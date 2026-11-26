import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Perfil } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
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
};

function montar(gravado: { menorIdade: boolean; responsavelNome: string | null }) {
  const antes = { ...ESTAGIARIO, ...gravado };
  const tx = {
    estagiario: {
      findFirst: vi.fn().mockResolvedValue(antes),
      update: vi.fn(({ data }) => Promise.resolve({ ...antes, ...data })),
    },
  };
  const prisma = {
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  } as unknown as PrismaService;
  const processos = { obterEditavel: vi.fn() } as unknown as ProcessosService;
  const auditoria = { registrar: vi.fn(), registrarAcesso: vi.fn() } as unknown as AuditoriaService;
  return { tx, service: new EstagiariosService(prisma, processos, auditoria) };
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
