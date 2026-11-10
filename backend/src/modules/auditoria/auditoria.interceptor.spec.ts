import {
  type CallHandler,
  Controller,
  type ExecutionContext,
  Logger,
  Patch,
  StreamableFile,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Auditar } from './auditar.decorator.js';
import { AuditoriaInterceptor, type OpcoesAuditar } from './auditoria.interceptor.js';
import { AuditoriaService } from './auditoria.service.js';

const USUARIO_ID = '3f0e6c1a-7c1d-4c55-9a53-2f4f2a6b9e10';
const PROCESSO_ID = '9b2d7a40-5e8f-4f0b-8c43-1d6a7e3f5b21';

const prisma = {} as PrismaService;

function montar() {
  const registrar = vi.fn().mockResolvedValue(undefined);
  const interceptor = new AuditoriaInterceptor(new Reflector(), prisma, {
    registrar,
  } as unknown as AuditoriaService);
  return { interceptor, registrar };
}

// Aplica o decorator de verdade num handler para o Reflector ler os metadados.
function handlerCom(opcoes?: OpcoesAuditar) {
  class Controlador {
    metodo() {}
  }
  if (opcoes) {
    const descritor = Object.getOwnPropertyDescriptor(Controlador.prototype, 'metodo')!;
    Auditar(opcoes)(Controlador.prototype, 'metodo', descritor);
  }
  return { classe: Controlador, handler: Controlador.prototype.metodo };
}

function contexto(
  alvo: ReturnType<typeof handlerCom>,
  requisicao: Record<string, unknown>,
): ExecutionContext {
  return {
    getHandler: () => alvo.handler,
    getClass: () => alvo.classe,
    switchToHttp: () => ({ getRequest: () => requisicao }),
  } as unknown as ExecutionContext;
}

const retorna = (valor: unknown): CallHandler => ({ handle: () => of(valor) });

describe('AuditoriaInterceptor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registra a ação depois do sucesso, com usuário, ip, id da rota e resposta', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'processo' });
    const requisicao = {
      method: 'PATCH',
      ip: '10.0.0.7',
      params: { id: PROCESSO_ID },
      usuario: { id: USUARIO_ID },
    };
    const resposta = { id: PROCESSO_ID, status: 'enviado' };

    const resultado = await firstValueFrom(
      interceptor.intercept(contexto(alvo, requisicao), retorna(resposta)),
    );

    expect(resultado).toBe(resposta);
    expect(registrar).toHaveBeenCalledExactlyOnceWith(
      prisma,
      { id: USUARIO_ID, ip: '10.0.0.7' },
      {
        acao: 'UPDATE',
        entidade: 'processo',
        entidadeId: PROCESSO_ID,
        dadosDepois: resposta,
      },
    );
  });

  it.each([
    ['POST', 'CREATE'],
    ['PUT', 'UPDATE'],
    ['PATCH', 'UPDATE'],
    ['DELETE', 'DELETE'],
  ])('deriva a ação de %s como %s', async (metodo, acao) => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'documento' });

    await firstValueFrom(
      interceptor.intercept(
        contexto(alvo, { method: metodo, params: { id: PROCESSO_ID } }),
        retorna(undefined),
      ),
    );

    expect(registrar.mock.calls[0][2]).toMatchObject({ acao });
  });

  it('usa o id da resposta quando a rota não tem o parâmetro (criação)', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'documento' });

    await firstValueFrom(
      interceptor.intercept(
        contexto(alvo, { method: 'POST', params: { processoId: PROCESSO_ID } }),
        retorna({ id: 'doc-1' }),
      ),
    );

    expect(registrar.mock.calls[0][2]).toMatchObject({ acao: 'CREATE', entidadeId: 'doc-1' });
  });

  it('respeita acao e parametroId informados no decorator', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({
      entidade: 'estagiario',
      acao: 'IMPORT_LOTE',
      parametroId: 'processoId',
    });

    await firstValueFrom(
      interceptor.intercept(
        contexto(alvo, { method: 'POST', params: { processoId: PROCESSO_ID } }),
        retorna({ total: 3 }),
      ),
    );

    expect(registrar.mock.calls[0][2]).toMatchObject({
      acao: 'IMPORT_LOTE',
      entidadeId: PROCESSO_ID,
    });
  });

  it('grava usuarioId vazio quando não há usuário autenticado', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'assinatura' });

    await firstValueFrom(
      interceptor.intercept(
        contexto(alvo, { method: 'POST', ip: '10.0.0.9', params: { id: PROCESSO_ID } }),
        retorna({ ok: true }),
      ),
    );

    expect(registrar.mock.calls[0][1]).toEqual({ id: undefined, ip: '10.0.0.9' });
  });

  it('não grava corpo quando a resposta não é JSON (arquivo ou vazia)', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'documento' });
    const requisicao = { method: 'DELETE', params: { id: PROCESSO_ID } };

    for (const resposta of [
      undefined,
      null,
      'texto',
      Buffer.from('x'),
      new StreamableFile(Buffer.from('x')),
    ]) {
      await firstValueFrom(interceptor.intercept(contexto(alvo, requisicao), retorna(resposta)));
    }

    expect(registrar).toHaveBeenCalledTimes(5);
    for (const chamada of registrar.mock.calls) {
      expect(chamada[2].dadosDepois).toBeUndefined();
    }
  });

  it('não grava quando o handler falha', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom({ entidade: 'processo' });
    const erro = new Error('conflito');

    await expect(
      firstValueFrom(
        interceptor.intercept(contexto(alvo, { method: 'PATCH', params: { id: PROCESSO_ID } }), {
          handle: () => throwError(() => erro),
        }),
      ),
    ).rejects.toBe(erro);

    expect(registrar).not.toHaveBeenCalled();
  });

  it('não grava em handlers sem @Auditar', async () => {
    const { interceptor, registrar } = montar();
    const alvo = handlerCom();

    const resultado = await firstValueFrom(
      interceptor.intercept(
        contexto(alvo, { method: 'POST', params: { id: PROCESSO_ID } }),
        retorna('ok'),
      ),
    );

    expect(resultado).toBe('ok');
    expect(registrar).not.toHaveBeenCalled();
  });

  describe('quando o registro não pode ser gravado', () => {
    it('mantém a resposta e loga o erro se a gravação falhar', async () => {
      const { interceptor, registrar } = montar();
      registrar.mockRejectedValue(new Error('banco fora do ar'));
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const alvo = handlerCom({ entidade: 'processo' });

      const resultado = await firstValueFrom(
        interceptor.intercept(
          contexto(alvo, { method: 'POST', params: {} }),
          retorna({ id: PROCESSO_ID }),
        ),
      );

      expect(resultado).toEqual({ id: PROCESSO_ID });
      expect(log).toHaveBeenCalledOnce();
    });

    it.each([
      ['método sem ação (GET)', { method: 'GET', params: { id: PROCESSO_ID } }, {}],
      ['sem id na rota nem na resposta', { method: 'POST', params: {} }, { total: 1 }],
    ])('mantém a resposta e loga o erro: %s', async (_nome, requisicao, resposta) => {
      const { interceptor, registrar } = montar();
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const alvo = handlerCom({ entidade: 'processo' });

      const resultado = await firstValueFrom(
        interceptor.intercept(contexto(alvo, requisicao), retorna(resposta)),
      );

      expect(resultado).toBe(resposta);
      expect(registrar).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledOnce();
    });
  });

  it('funciona ligado pelo decorator, com injeção de dependência e requisição HTTP real', async () => {
    @Controller('processos')
    class ProcessosFake {
      @Auditar({ entidade: 'processo' })
      @Patch(':id')
      atualizar() {
        return { id: PROCESSO_ID, status: 'enviado' };
      }
    }
    const registrar = vi.fn().mockResolvedValue(undefined);
    const modulo = await Test.createTestingModule({
      controllers: [ProcessosFake],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AuditoriaService, useValue: { registrar } },
      ],
    }).compile();
    const app = modulo.createNestApplication();
    await app.listen(0);

    try {
      const resposta = await fetch(`${await app.getUrl()}/processos/${PROCESSO_ID}`, {
        method: 'PATCH',
      });

      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toEqual({ id: PROCESSO_ID, status: 'enviado' });
      expect(registrar).toHaveBeenCalledExactlyOnceWith(
        prisma,
        { id: undefined, ip: expect.any(String) },
        {
          acao: 'UPDATE',
          entidade: 'processo',
          entidadeId: PROCESSO_ID,
          dadosDepois: { id: PROCESSO_ID, status: 'enviado' },
        },
      );
    } finally {
      await app.close();
    }
  });
});
