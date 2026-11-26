import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StatusProcesso, TipoEstagio } from '../../src/generated/prisma/enums.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { type Api, criarUsuarios, entrar, iniciarApp, mudarStatus } from './app.js';

// Controller de processos de ponta a ponta: JWT, ValidationPipe, escopo,
// regras de status, auditoria e banco real.

let app: INestApplication;
let prisma: PrismaService;
let usuarios: Awaited<ReturnType<typeof criarUsuarios>>;
let representante: Api;
let outraIes: Api;
let coordenacao: Api;

beforeAll(async () => {
  ({ app, prisma } = await iniciarApp());
  usuarios = await criarUsuarios(prisma);
  representante = await entrar(app, usuarios.representante.email);
  outraIes = await entrar(app, usuarios.outraIes.email);
  coordenacao = await entrar(app, usuarios.coordenacao.email);
});

afterAll(async () => {
  await app.close();
});

const criarProcesso = async (api: Api = representante, corpo: object = {}) =>
  (await api.post('/processos').send(corpo).expect(201)).body as { id: string; status: string };

describe('autenticação', () => {
  it('sem token responde 401', async () => {
    await request(app.getHttpServer()).get('/processos').expect(401);
  });

  it('token inválido responde 401', async () => {
    await request(app.getHttpServer())
      .get('/processos')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
  });
});

describe('POST /processos', () => {
  it('cria o processo em rascunho, ligado a quem criou, e audita', async () => {
    const { body } = await representante
      .post('/processos')
      .send({
        tipoEstagio: TipoEstagio.obrigatorio,
        supervisorNome: '  Maria Souza ',
        supervisorEmail: 'Maria.Souza@Saude.MA.gov.br',
      })
      .expect(201);

    expect(body).toMatchObject({
      status: StatusProcesso.rascunho,
      tipoEstagio: TipoEstagio.obrigatorio,
      supervisorNome: 'Maria Souza',
      supervisorEmail: 'maria.souza@saude.ma.gov.br',
      criadoPorId: usuarios.representante.id,
    });
    const auditoria = await prisma.auditoria.findMany({
      where: { entidade: 'processo', entidadeId: body.id },
    });
    expect(auditoria).toEqual([
      expect.objectContaining({ acao: 'CREATE', usuarioId: usuarios.representante.id }),
    ]);
  });

  it.each([
    ['campo desconhecido', { status: 'aprovado' }],
    ['tipo de estágio inválido', { tipoEstagio: 'voluntario' }],
    ['e-mail do supervisor inválido', { supervisorEmail: 'nao-e-email' }],
    ['nome do supervisor só com espaços', { supervisorNome: '   ' }],
  ])('400 com %s', async (_caso, corpo) => {
    await representante.post('/processos').send(corpo).expect(400);
  });
});

describe('GET /processos', () => {
  let doRepresentante: string[];
  let daOutraIes: string;

  beforeAll(async () => {
    doRepresentante = [(await criarProcesso()).id, (await criarProcesso()).id];
    daOutraIes = (await criarProcesso(outraIes)).id;
    await mudarStatus(prisma, doRepresentante[1], StatusProcesso.enviado);
  });

  it('o representante só vê os processos do próprio escopo', async () => {
    const { body } = await representante.get('/processos?limite=100').expect(200);
    const ids = body.itens.map((p: { id: string }) => p.id);

    expect(ids).toEqual(expect.arrayContaining(doRepresentante));
    expect(ids).not.toContain(daOutraIes);
    expect(body).toMatchObject({ pagina: 1, limite: 100 });
    expect(body.itens[0]._count).toEqual({ estagiarios: expect.any(Number) });
  });

  it('a coordenação vê os processos de todas as instituições', async () => {
    const { body } = await coordenacao.get('/processos?limite=100').expect(200);
    const ids = body.itens.map((p: { id: string }) => p.id);

    expect(ids).toEqual(expect.arrayContaining([...doRepresentante, daOutraIes]));
  });

  it('filtra por status', async () => {
    const { body } = await representante.get('/processos?status=enviado&limite=100').expect(200);

    expect(body.itens.map((p: { id: string }) => p.id)).toContain(doRepresentante[1]);
    expect(body.itens.every((p: { status: string }) => p.status === 'enviado')).toBe(true);
  });

  it('pagina com limite e devolve o total do escopo', async () => {
    const { body } = await representante.get('/processos?limite=1&pagina=2').expect(200);

    expect(body.itens).toHaveLength(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body).toMatchObject({ pagina: 2, limite: 1 });
  });

  it.each(['limite=101', 'limite=0', 'pagina=0', 'status=arquivado', 'pagina=abc'])(
    '400 com %s',
    async (consulta) => {
      await representante.get(`/processos?${consulta}`).expect(400);
    },
  );
});

describe('GET /processos/:id', () => {
  it('traz o processo com os estagiários', async () => {
    const { id } = await criarProcesso();
    await representante
      .post(`/processos/${id}/estagiarios`)
      .send({ nome: 'Ana', cpf: '52998224725', matricula: 'M1', curso: 'Enfermagem' })
      .expect(201);

    const { body } = await representante.get(`/processos/${id}`).expect(200);

    expect(body.estagiarios).toEqual([expect.objectContaining({ nome: 'Ana' })]);
  });

  it('404 para processo fora do escopo, sem revelar que ele existe', async () => {
    const { id } = await criarProcesso();

    const { body } = await outraIes.get(`/processos/${id}`).expect(404);
    expect(body.message).toBe('Processo não encontrado');
  });

  it('400 para id que não é UUID', async () => {
    await representante.get('/processos/123').expect(400);
  });
});

describe('PATCH /processos/:id', () => {
  it('o representante altera o próprio rascunho e a auditoria guarda antes e depois', async () => {
    const { id } = await criarProcesso();

    const { body } = await representante
      .patch(`/processos/${id}`)
      .send({ supervisorNome: 'João Lima', tipoEstagio: TipoEstagio.pos_graduacao })
      .expect(200);

    expect(body).toMatchObject({ supervisorNome: 'João Lima', tipoEstagio: 'pos_graduacao' });
    const update = await prisma.auditoria.findFirst({
      where: { entidade: 'processo', entidadeId: id, acao: 'UPDATE' },
    });
    expect(update?.dadosAntes).toMatchObject({ supervisorNome: null });
    expect(update?.dadosDepois).toMatchObject({ supervisorNome: 'João Lima' });
  });

  it('em pendência também altera', async () => {
    const { id } = await criarProcesso();
    await mudarStatus(prisma, id, StatusProcesso.pendencia);

    await representante.patch(`/processos/${id}`).send({ supervisorNome: 'X' }).expect(200);
  });

  it.each([StatusProcesso.enviado, StatusProcesso.aprovado, StatusProcesso.concluido])(
    '409 status_invalido em %s',
    async (status) => {
      const { id } = await criarProcesso();
      await mudarStatus(prisma, id, status);

      const { body } = await representante
        .patch(`/processos/${id}`)
        .send({ supervisorNome: 'X' })
        .expect(409);
      expect(body.erro).toBe('status_invalido');
    },
  );

  it('a coordenação não altera processo de representante (403)', async () => {
    const { id } = await criarProcesso();

    await coordenacao.patch(`/processos/${id}`).send({ supervisorNome: 'X' }).expect(403);
  });

  it('representante de outra instituição recebe 404', async () => {
    const { id } = await criarProcesso();

    await outraIes.patch(`/processos/${id}`).send({ supervisorNome: 'X' }).expect(404);
  });
});

describe('PATCH /processos/:id/analise', () => {
  it('a coordenação grava a observação em processo enviado, sem mudar o status', async () => {
    const { id } = await criarProcesso();
    await mudarStatus(prisma, id, StatusProcesso.enviado);

    const { body } = await coordenacao
      .patch(`/processos/${id}/analise`)
      .send({ observacaoAnalise: 'Falta a apólice' })
      .expect(200);

    expect(body).toMatchObject({ observacaoAnalise: 'Falta a apólice', status: 'enviado' });
    const analise = await prisma.auditoria.findFirst({
      where: { entidade: 'processo', entidadeId: id, acao: 'ANALISE' },
    });
    expect(analise?.usuarioId).toBe(usuarios.coordenacao.id);
  });

  it('observação vazia limpa', async () => {
    const { id } = await criarProcesso();
    await mudarStatus(prisma, id, StatusProcesso.em_analise);
    await coordenacao
      .patch(`/processos/${id}/analise`)
      .send({ observacaoAnalise: 'x' })
      .expect(200);

    const { body } = await coordenacao
      .patch(`/processos/${id}/analise`)
      .send({ observacaoAnalise: '' })
      .expect(200);

    expect(body.observacaoAnalise).toBeNull();
  });

  it('o representante não analisa (403)', async () => {
    const { id } = await criarProcesso();
    await mudarStatus(prisma, id, StatusProcesso.enviado);

    await representante
      .patch(`/processos/${id}/analise`)
      .send({ observacaoAnalise: 'x' })
      .expect(403);
  });

  it('rascunho ainda não pode ser analisado (409)', async () => {
    const { id } = await criarProcesso();

    await coordenacao
      .patch(`/processos/${id}/analise`)
      .send({ observacaoAnalise: 'x' })
      .expect(409);
  });

  it('processo inexistente responde 404', async () => {
    await coordenacao
      .patch('/processos/00000000-0000-4000-8000-000000000000/analise')
      .send({ observacaoAnalise: 'x' })
      .expect(404);
  });
});

describe('DELETE /processos/:id', () => {
  it('apaga o rascunho com os estagiários e audita', async () => {
    const { id } = await criarProcesso();
    await representante
      .post(`/processos/${id}/estagiarios`)
      .send({ nome: 'Ana', cpf: '52998224725', matricula: 'M1', curso: 'Enfermagem' })
      .expect(201);

    await representante.delete(`/processos/${id}`).expect(204);

    await representante.get(`/processos/${id}`).expect(404);
    expect(await prisma.estagiario.count({ where: { processoId: id } })).toBe(0);
    expect(await prisma.auditoria.count({ where: { entidadeId: id, acao: 'DELETE' } })).toBe(1);
  });

  it('pendência não é excluída (409)', async () => {
    const { id } = await criarProcesso();
    await mudarStatus(prisma, id, StatusProcesso.pendencia);

    await representante.delete(`/processos/${id}`).expect(409);
  });

  it('rascunho com documento não é excluído (409)', async () => {
    const { id } = await criarProcesso();
    await prisma.documento.create({
      data: {
        processoId: id,
        tipo: 'anexo',
        nomeArquivo: 'a.pdf',
        mimeType: 'application/pdf',
        tamanhoBytes: 10,
        hashSha256: 'a'.repeat(64),
        storageKey: `integracao/${id}.pdf`,
        enviadoPorId: usuarios.representante.id,
      },
    });

    const { body } = await representante.delete(`/processos/${id}`).expect(409);
    expect(body.message).toBe('Processo possui documentos enviados');
  });

  it('representante de outra instituição recebe 404', async () => {
    const { id } = await criarProcesso();

    await outraIes.delete(`/processos/${id}`).expect(404);
  });
});
