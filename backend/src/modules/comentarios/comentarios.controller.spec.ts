import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Perfil } from '../../generated/prisma/enums.js';
import { ComentariosController } from './comentarios.controller.js';
import { ComentariosService } from './comentarios.service.js';

const SEGREDO = 'segredo-de-teste-comentarios';
const PROCESSO = '11111111-1111-4111-8111-111111111111';
const DOCUMENTO = '22222222-2222-4222-8222-222222222222';
const COMENTARIO = { id: 'c1', tipo: 'pendencia', texto: 'CPF ilegível' };

let app: INestApplication;
let url: string;
let jwt: JwtService;
const servico = {
  criar: vi.fn(),
  listarDoDocumento: vi.fn(),
  listarDoProcesso: vi.fn(),
};

beforeAll(async () => {
  const modulo = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: SEGREDO })],
    controllers: [ComentariosController],
    providers: [
      { provide: ComentariosService, useValue: servico },
      // O JwtAuthGuard real lê o segredo daqui.
      { provide: ConfigService, useValue: { getOrThrow: () => SEGREDO } },
    ],
  }).compile();
  app = modulo.createNestApplication();
  // Mesmas opções do main.ts.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(0);
  url = await app.getUrl();
  jwt = modulo.get(JwtService);
});

afterAll(() => app.close());

beforeEach(() => {
  servico.criar.mockReset().mockResolvedValue(COMENTARIO);
  servico.listarDoDocumento.mockReset().mockResolvedValue([COMENTARIO]);
  servico.listarDoProcesso.mockReset().mockResolvedValue([COMENTARIO]);
});

const token = (perfil: Perfil = Perfil.COORDENACAO_SES, sub = 'u1') => jwt.sign({ sub, perfil });

function chamar(
  metodo: string,
  caminho: string,
  { corpo, bearer = token() }: { corpo?: unknown; bearer?: string | null } = {},
) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body:
      corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

const DO_DOCUMENTO = `/processos/${PROCESSO}/documentos/${DOCUMENTO}/comentarios`;
const DO_PROCESSO = `/processos/${PROCESSO}/comentarios`;
const VALIDO = { tipo: 'pendencia', texto: 'x' };

describe('POST /processos/:processoId/documentos/:documentoId/comentarios', () => {
  it('cria o comentário e repassa ids, corpo já aparado e o usuário do token ao service', async () => {
    const resposta = await chamar('POST', DO_DOCUMENTO, {
      corpo: { tipo: 'pendencia', texto: '  CPF ilegível  ' },
      bearer: token(Perfil.COORDENACAO_SES, 'coord-1'),
    });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual(COMENTARIO);
    expect(servico.criar).toHaveBeenCalledExactlyOnceWith(
      PROCESSO,
      DOCUMENTO,
      { tipo: 'pendencia', texto: 'CPF ilegível' },
      { id: 'coord-1', perfil: Perfil.COORDENACAO_SES, ip: expect.any(String) },
    );
  });

  it('401 sem token, com token inválido e com esquema errado', async () => {
    for (const bearer of [null, 'lixo', `${token()}x`]) {
      const resposta = await chamar('POST', DO_DOCUMENTO, { corpo: VALIDO, bearer });
      expect(resposta.status).toBe(401);
    }
    const basic = await fetch(`${url}${DO_DOCUMENTO}`, {
      method: 'POST',
      headers: { authorization: `Basic ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify(VALIDO),
    });
    expect(basic.status).toBe(401);
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it.each([
    ['processoId', `/processos/nao-e-uuid/documentos/${DOCUMENTO}/comentarios`],
    ['documentoId', `/processos/${PROCESSO}/documentos/123/comentarios`],
    ['ids com SQL', `/processos/${PROCESSO}'%20OR%201=1--/documentos/${DOCUMENTO}/comentarios`],
  ])('400 quando %s não é UUID, sem chegar ao service', async (_nome, caminho) => {
    const resposta = await chamar('POST', caminho, { corpo: VALIDO });

    expect(resposta.status).toBe(400);
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it.each([
    ['tipo inválido', { tipo: 'urgente', texto: 'x' }, 'tipo inválido'],
    ['texto vazio', { tipo: 'pendencia', texto: '   ' }, 'texto sem conteúdo'],
    [
      'texto grande demais',
      { tipo: 'pendencia', texto: 'a'.repeat(1001) },
      'texto passa de 1000 caracteres',
    ],
    ['byte nulo', { tipo: 'pendencia', texto: 'a\u0000b' }, 'texto com caractere inválido'],
    [
      'campo extra (autorId)',
      { tipo: 'pendencia', texto: 'x', autorId: PROCESSO },
      'property autorId should not exist',
    ],
    ['sem corpo nenhum', {}, 'tipo inválido'],
  ])('400 com a mensagem certa: %s', async (_nome, corpo, mensagem) => {
    const resposta = await chamar('POST', DO_DOCUMENTO, { corpo });

    expect(resposta.status).toBe(400);
    expect((await resposta.json()).message).toContain(mensagem);
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it('400 para JSON malformado e para corpo que não é objeto, nunca 500', async () => {
    for (const corpo of ['{"tipo": ', '"texto solto"', '[1,2]', 'null']) {
      const resposta = await chamar('POST', DO_DOCUMENTO, { corpo });
      expect(resposta.status, `corpo ${corpo}`).toBe(400);
    }
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it('413 para corpo gigante, nunca 500', async () => {
    const resposta = await chamar('POST', DO_DOCUMENTO, {
      corpo: { tipo: 'pendencia', texto: 'a'.repeat(300_000) },
    });

    expect(resposta.status).toBe(413);
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it.each([
    [
      '403',
      new ForbiddenException('Apenas a coordenação SES registra comentário do tipo pendencia'),
      403,
    ],
    ['404', new NotFoundException('Documento não encontrado'), 404],
    [
      '409',
      new ConflictException({ erro: 'status_invalido', message: 'Processo em aprovado' }),
      409,
    ],
  ])('devolve o %s do service', async (_nome, erro, status) => {
    servico.criar.mockRejectedValue(erro);

    const resposta = await chamar('POST', DO_DOCUMENTO, { corpo: VALIDO });

    expect(resposta.status).toBe(status);
  });

  it('o 409 mantém o código estável `erro` que a tela usa para decidir', async () => {
    servico.criar.mockRejectedValue(
      new ConflictException({ erro: 'status_invalido', message: 'Processo em aprovado' }),
    );

    const resposta = await chamar('POST', DO_DOCUMENTO, { corpo: VALIDO });

    expect(await resposta.json()).toMatchObject({ erro: 'status_invalido' });
  });
});

describe('GET /processos/:processoId/documentos/:documentoId/comentarios', () => {
  it('lista os comentários do documento', async () => {
    const resposta = await chamar('GET', DO_DOCUMENTO, {
      bearer: token(Perfil.REPRESENTANTE_UNDB, 'rep-1'),
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual([COMENTARIO]);
    expect(servico.listarDoDocumento).toHaveBeenCalledExactlyOnceWith(PROCESSO, DOCUMENTO, {
      id: 'rep-1',
      perfil: Perfil.REPRESENTANTE_UNDB,
      ip: expect.any(String),
    });
  });

  it('401 sem token', async () => {
    expect((await chamar('GET', DO_DOCUMENTO, { bearer: null })).status).toBe(401);
  });

  it('400 com UUID inválido', async () => {
    const resposta = await chamar('GET', `/processos/${PROCESSO}/documentos/xyz/comentarios`);

    expect(resposta.status).toBe(400);
    expect(servico.listarDoDocumento).not.toHaveBeenCalled();
  });

  it('404 vindo do service (processo ou documento inexistente)', async () => {
    servico.listarDoDocumento.mockRejectedValue(new NotFoundException());

    expect((await chamar('GET', DO_DOCUMENTO)).status).toBe(404);
  });
});

describe('GET /processos/:processoId/comentarios', () => {
  it('lista todos os comentários do processo', async () => {
    const resposta = await chamar('GET', DO_PROCESSO);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual([COMENTARIO]);
    expect(servico.listarDoProcesso).toHaveBeenCalledExactlyOnceWith(PROCESSO, {
      id: 'u1',
      perfil: Perfil.COORDENACAO_SES,
      ip: expect.any(String),
    });
  });

  it('401 sem token e 400 com UUID inválido', async () => {
    expect((await chamar('GET', DO_PROCESSO, { bearer: null })).status).toBe(401);
    expect((await chamar('GET', '/processos/abc/comentarios')).status).toBe(400);
    expect(servico.listarDoProcesso).not.toHaveBeenCalled();
  });
});

describe('o que não existe', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])(
    '%s em um comentário não existe: comentário é imutável (404)',
    async (metodo) => {
      const resposta = await chamar(metodo, `${DO_DOCUMENTO}/c1`, { corpo: { texto: 'x' } });

      expect(resposta.status).toBe(404);
    },
  );
});
