import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LembretesAgendador } from './lembretes.agendador.js';
import { LembretesController, tokenConfere } from './lembretes.controller.js';
import type { LembretesService } from './lembretes.service.js';

const config = (valores: Record<string, string>) =>
  ({ get: (nome: string) => valores[nome] }) as unknown as ConfigService;

describe('tokenConfere', () => {
  it('só aceita "Bearer <token>" igual ao esperado', () => {
    expect(tokenConfere('Bearer segredo', 'segredo')).toBe(true);
    expect(tokenConfere('Bearer outro', 'segredo')).toBe(false);
    expect(tokenConfere('segredo', 'segredo')).toBe(false);
    expect(tokenConfere('Bearer ', 'segredo')).toBe(false);
    expect(tokenConfere(undefined, 'segredo')).toBe(false);
  });
});

describe('POST /interno/lembretes', () => {
  const lembretes = { executar: vi.fn().mockResolvedValue({ executado: true }) };
  const controlador = (valores: Record<string, string>) =>
    new LembretesController(lembretes as unknown as LembretesService, config(valores));

  beforeEach(() => lembretes.executar.mockClear());

  it('sem LEMBRETES_TOKEN a rota não existe', () => {
    expect(() => controlador({}).executar('Bearer qualquer')).toThrow(NotFoundException);
    expect(lembretes.executar).not.toHaveBeenCalled();
  });

  it('token errado: 401', () => {
    expect(() => controlador({ LEMBRETES_TOKEN: 'segredo' }).executar('Bearer x')).toThrow(
      UnauthorizedException,
    );
    expect(lembretes.executar).not.toHaveBeenCalled();
  });

  it('token certo executa o job', async () => {
    await expect(
      controlador({ LEMBRETES_TOKEN: 'segredo' }).executar('Bearer segredo'),
    ).resolves.toEqual({ executado: true });
  });
});

describe('LembretesAgendador', () => {
  it('erro no job vai para o log, sem derrubar o processo', async () => {
    const lembretes = { executar: vi.fn().mockRejectedValue(new Error('banco fora')) };
    const agendador = new LembretesAgendador(lembretes as unknown as LembretesService, config({}));

    await expect(agendador.rodar()).resolves.toBeUndefined();
  });

  it('não agenda nada nos testes', async () => {
    const agendador = new LembretesAgendador({} as LembretesService, config({}));

    agendador.onApplicationBootstrap();
    await agendador.onApplicationShutdown();
    expect((agendador as unknown as { tarefa?: unknown }).tarefa).toBeUndefined();
  });
});
