import { Logger, NotFoundException } from '@nestjs/common';
import { Perfil } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EstagiariosService } from '../processos/estagiarios.service.js';
import type { ProcessosService } from '../processos/processos.service.js';
import { ProcessosService as ProcessosServiceReal } from '../processos/processos.service.js';
import { registrosDeAcesso } from './acesso-estagiarios.js';
import { AuditoriaService } from './auditoria.service.js';

// Trilha de acesso (RF-23 + LGPD): login, leitura de estagiários e download.

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES, ip: '200.1.2.3' };
const ANA = { id: 'e1', nome: 'Ana', cpf: '52998224725', email: 'ana@exemplo.com' };
const BIA = { id: 'e2', nome: 'Bia', cpf: '11144477735', email: 'bia@exemplo.com' };

describe('AuditoriaService.registrarAcesso', () => {
  const montar = () => {
    const prisma = { auditoria: { createMany: vi.fn() } };
    return { prisma, service: new AuditoriaService(prisma as unknown as PrismaService) };
  };

  it('grava várias linhas de uma vez, com autor e IP', async () => {
    const { prisma, service } = montar();

    await service.registrarAcesso(COORDENACAO, registrosDeAcesso([ANA, BIA], 'p1'));

    expect(prisma.auditoria.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [
        expect.objectContaining({
          usuarioId: 'coord',
          ip: '200.1.2.3',
          acao: 'ACESSO',
          entidade: 'estagiario',
          entidadeId: 'e1',
          dadosDepois: { processoId: 'p1' },
        }),
        expect.objectContaining({ entidadeId: 'e2' }),
      ],
    });
  });

  it('lista vazia não vai ao banco', async () => {
    const { prisma, service } = montar();

    await service.registrarAcesso(COORDENACAO, []);

    expect(prisma.auditoria.createMany).not.toHaveBeenCalled();
  });

  it('falha ao gravar vai para o log e não derruba a leitura', async () => {
    const { prisma, service } = montar();
    prisma.auditoria.createMany.mockRejectedValue(new Error('banco fora'));
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      service.registrarAcesso(COORDENACAO, registrosDeAcesso([ANA], 'p1')),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'Falha ao registrar auditoria de ACESSO em estagiario',
      expect.stringContaining('banco fora'),
    );
    log.mockRestore();
  });
});

describe('registrosDeAcesso', () => {
  it('guarda só ids, nunca o conteúdo lido', () => {
    const registros = registrosDeAcesso([ANA], 'p1');

    expect(registros).toEqual([
      {
        acao: 'ACESSO',
        entidade: 'estagiario',
        entidadeId: 'e1',
        dadosDepois: { processoId: 'p1' },
      },
    ]);
    expect(JSON.stringify(registros)).not.toMatch(/52998224725|ana@exemplo/);
  });
});

describe('leitura de estagiários registra ACESSO', () => {
  const montar = () => {
    const prisma = {
      estagiario: {
        findMany: vi.fn().mockResolvedValue([ANA, BIA]),
        findFirst: vi.fn().mockResolvedValue(ANA),
      },
      processo: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', estagiarios: [ANA, BIA] }) },
    };
    const auditoria = { registrar: vi.fn(), registrarAcesso: vi.fn() };
    const processos = { garantirAcesso: vi.fn() };
    return {
      prisma,
      auditoria,
      processos,
      estagiarios: new EstagiariosService(
        prisma as unknown as PrismaService,
        processos as unknown as ProcessosService,
        auditoria as unknown as AuditoriaService,
      ),
      processosReal: new ProcessosServiceReal(
        prisma as unknown as PrismaService,
        auditoria as unknown as AuditoriaService,
      ),
    };
  };

  it('GET /processos/:id/estagiarios: uma linha por estagiário', async () => {
    const { auditoria, estagiarios } = montar();

    await expect(estagiarios.listar('p1', COORDENACAO)).resolves.toEqual([ANA, BIA]);

    expect(auditoria.registrarAcesso).toHaveBeenCalledExactlyOnceWith(
      COORDENACAO,
      registrosDeAcesso([ANA, BIA], 'p1'),
    );
  });

  it('GET /processos/:id/estagiarios/:id: uma linha', async () => {
    const { auditoria, estagiarios } = montar();

    await estagiarios.buscar('p1', 'e1', COORDENACAO);

    expect(auditoria.registrarAcesso).toHaveBeenCalledExactlyOnceWith(
      COORDENACAO,
      registrosDeAcesso([ANA], 'p1'),
    );
  });

  it('GET /processos/:id: o detalhe traz o lote, então registra cada estagiário', async () => {
    const { auditoria, processosReal } = montar();

    await processosReal.buscar('p1', COORDENACAO);

    expect(auditoria.registrarAcesso).toHaveBeenCalledExactlyOnceWith(
      COORDENACAO,
      registrosDeAcesso([ANA, BIA], 'p1'),
    );
  });

  it('sem acesso ao processo não registra nada', async () => {
    const { auditoria, processos, estagiarios, prisma, processosReal } = montar();
    processos.garantirAcesso.mockRejectedValue(new NotFoundException());
    prisma.processo.findFirst.mockResolvedValue(null);

    await expect(estagiarios.listar('p1', COORDENACAO)).rejects.toBeInstanceOf(NotFoundException);
    await expect(processosReal.buscar('p1', COORDENACAO)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoria.registrarAcesso).not.toHaveBeenCalled();
  });
});
