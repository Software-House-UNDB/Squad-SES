import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AnalisarProcessoDto } from './dto/processo.dto.js';
import { ProcessosService } from './processos.service.js';

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES };
const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB };

function montar(processo: { status: StatusProcesso; observacaoAnalise: string | null } | null) {
  const tx = {
    processo: {
      findUnique: vi.fn().mockResolvedValue(processo && { id: 'p1', ...processo }),
      update: vi.fn(({ data }) => Promise.resolve({ id: 'p1', ...processo, ...data })),
    },
  };
  const prisma = {
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  } as unknown as PrismaService;
  const auditoria = { registrar: vi.fn() } as unknown as AuditoriaService;
  return { tx, auditoria, service: new ProcessosService(prisma, auditoria) };
}

describe('ProcessosService.analisar', () => {
  it('grava a observação e registra a auditoria', async () => {
    const { tx, auditoria, service } = montar({
      status: StatusProcesso.em_analise,
      observacaoAnalise: null,
    });

    const processo = await service.analisar(
      'p1',
      { observacaoAnalise: 'Falta o CPF' },
      COORDENACAO,
    );

    expect(processo.observacaoAnalise).toBe('Falta o CPF');
    expect(processo.status).toBe(StatusProcesso.em_analise);
    expect(tx.processo.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { observacaoAnalise: 'Falta o CPF' },
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(tx, COORDENACAO, {
      acao: 'UPDATE',
      entidade: 'processo',
      entidadeId: 'p1',
      dadosAntes: { observacaoAnalise: null },
      dadosDepois: { observacaoAnalise: 'Falta o CPF' },
    });
  });

  it('recusa quem não é da coordenação', async () => {
    const { service } = montar({ status: StatusProcesso.enviado, observacaoAnalise: null });

    await expect(
      service.analisar('p1', { observacaoAnalise: 'x' }, REPRESENTANTE),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 404 para processo inexistente', async () => {
    const { service } = montar(null);

    await expect(
      service.analisar('p1', { observacaoAnalise: 'x' }, COORDENACAO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([StatusProcesso.rascunho, StatusProcesso.aprovado, StatusProcesso.concluido])(
    'recusa processo em %s',
    async (status) => {
      const { tx, service } = montar({ status, observacaoAnalise: null });

      await expect(
        service.analisar('p1', { observacaoAnalise: 'x' }, COORDENACAO),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.processo.update).not.toHaveBeenCalled();
    },
  );
});

describe('AnalisarProcessoDto', () => {
  const ler = async (corpo: Record<string, unknown>) => {
    const dto = plainToInstance(AnalisarProcessoDto, corpo);
    return { dto, erros: await validate(dto) };
  };

  it('apara o texto', async () => {
    const { dto, erros } = await ler({ observacaoAnalise: '  Falta o CPF  ' });

    expect(erros).toEqual([]);
    expect(dto.observacaoAnalise).toBe('Falta o CPF');
  });

  it.each([null, '', '   '])('trata %j como limpar a observação', async (valor) => {
    const { dto, erros } = await ler({ observacaoAnalise: valor });

    expect(erros).toEqual([]);
    expect(dto.observacaoAnalise).toBeNull();
  });

  it.each([{}, { observacaoAnalise: 42 }, { observacaoAnalise: 'a'.repeat(2001) }])(
    'rejeita %j',
    async (corpo) => {
      const { erros } = await ler(corpo);

      expect(erros).toHaveLength(1);
    },
  );
});
