import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AnalisarProcessoDto, CriarProcessoDto } from './dto/processo.dto.js';
import { ProcessosService } from './processos.service.js';

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES };
const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB };

function montar(
  processo: {
    status: StatusProcesso;
    observacaoAnalise: string | null;
    criadoPorId?: string;
  } | null,
) {
  const tx = {
    processo: {
      findUnique: vi.fn().mockResolvedValue(processo && { id: 'p1', ...processo }),
      findFirst: vi.fn().mockResolvedValue(processo && { id: 'p1', ...processo }),
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
  it.each([StatusProcesso.enviado, StatusProcesso.em_analise, StatusProcesso.pendencia])(
    'grava a observação em processo %s e registra a auditoria',
    async (status) => {
      const { tx, auditoria, service } = montar({ status, observacaoAnalise: null });

      const processo = await service.analisar(
        'p1',
        { observacaoAnalise: 'Falta o CPF' },
        COORDENACAO,
      );

      expect(processo.observacaoAnalise).toBe('Falta o CPF');
      expect(processo.status).toBe(status);
      expect(tx.processo.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { observacaoAnalise: 'Falta o CPF' },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(tx, COORDENACAO, {
        acao: 'ANALISE',
        entidade: 'processo',
        entidadeId: 'p1',
        dadosAntes: { observacaoAnalise: null },
        dadosDepois: { observacaoAnalise: 'Falta o CPF' },
      });
    },
  );

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

  it.each([
    StatusProcesso.rascunho,
    StatusProcesso.aprovado,
    StatusProcesso.aguardando_assinaturas,
    StatusProcesso.concluido,
  ])('recusa processo em %s', async (status) => {
    const { tx, service } = montar({ status, observacaoAnalise: null });

    await expect(
      service.analisar('p1', { observacaoAnalise: 'x' }, COORDENACAO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.processo.update).not.toHaveBeenCalled();
  });
});

describe('ProcessosService.obterParaRetorno', () => {
  it.each([StatusProcesso.aprovado, StatusProcesso.aguardando_assinaturas])(
    'libera retorno da coordenação em processo %s',
    async (status) => {
      const { tx, service } = montar({ status, observacaoAnalise: null });

      const processo = await service.obterParaRetorno(tx as never, 'p1', COORDENACAO);

      expect(processo.status).toBe(status);
    },
  );

  it('recusa quem não é da coordenação', async () => {
    const { tx, service } = montar({ status: StatusProcesso.aprovado, observacaoAnalise: null });

    await expect(service.obterParaRetorno(tx as never, 'p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.processo.findFirst).not.toHaveBeenCalled();
  });

  it('responde 404 para processo inexistente', async () => {
    const { tx, service } = montar(null);

    await expect(service.obterParaRetorno(tx as never, 'p1', COORDENACAO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    StatusProcesso.rascunho,
    StatusProcesso.enviado,
    StatusProcesso.em_analise,
    StatusProcesso.pendencia,
    StatusProcesso.concluido,
  ])('recusa retorno em processo %s com erro status_invalido', async (status) => {
    const { tx, service } = montar({ status, observacaoAnalise: null });

    const erro = await service
      .obterParaRetorno(tx as never, 'p1', COORDENACAO)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    // O texto continua começando por "Processo em" para a tela que ainda lê o message.
    expect((erro as ConflictException).getResponse()).toMatchObject({
      erro: 'status_invalido',
      message: `Processo em ${status} não recebe documentos de retorno`,
    });
  });
});

describe('ProcessosService.obterEditavel', () => {
  const doRepresentante = (status: StatusProcesso) => ({
    status,
    observacaoAnalise: null,
    criadoPorId: 'rep',
  });

  it.each([StatusProcesso.rascunho, StatusProcesso.pendencia])(
    'libera o criador em processo %s',
    async (status) => {
      const { tx, service } = montar(doRepresentante(status));

      await expect(service.obterEditavel(tx as never, 'p1', REPRESENTANTE)).resolves.toMatchObject({
        status,
      });
    },
  );

  it.each([
    StatusProcesso.enviado,
    StatusProcesso.em_analise,
    StatusProcesso.aprovado,
    StatusProcesso.aguardando_assinaturas,
    StatusProcesso.concluido,
  ])('recusa processo em %s com erro status_invalido', async (status) => {
    const { tx, service } = montar(doRepresentante(status));

    const erro = await service
      .obterEditavel(tx as never, 'p1', REPRESENTANTE)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      erro: 'status_invalido',
      message: `Processo em ${status} não pode ser alterado`,
    });
  });
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

describe('CriarProcessoDto', () => {
  it.each([{}, { tipoEstagio: 'obrigatorio' }])('aceita %j', async (corpo) => {
    expect(await validate(plainToInstance(CriarProcessoDto, corpo))).toEqual([]);
  });

  it('rejeita tipoEstagio desconhecido', async () => {
    const erros = await validate(plainToInstance(CriarProcessoDto, { tipoEstagio: 'outro' }));

    expect(erros).toHaveLength(1);
  });

  it('normaliza nome e e-mail do supervisor', async () => {
    const dto = plainToInstance(CriarProcessoDto, {
      supervisorNome: '  Maria Souza ',
      supervisorEmail: ' Maria@Saude.MA.gov.br ',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      supervisorNome: 'Maria Souza',
      supervisorEmail: 'maria@saude.ma.gov.br',
    });
  });

  it.each([{ supervisorEmail: 'maria@' }, { supervisorNome: '   ' }])(
    'rejeita %j',
    async (corpo) => {
      const erros = await validate(plainToInstance(CriarProcessoDto, corpo));

      expect(erros).toHaveLength(1);
    },
  );
});
