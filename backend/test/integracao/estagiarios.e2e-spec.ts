import type { INestApplication } from '@nestjs/common';
import { StatusProcesso } from '../../src/generated/prisma/enums.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  type Api,
  CPFS,
  criarUsuarios,
  entrar,
  estagiario,
  iniciarApp,
  mudarStatus,
} from './app.js';

// Controller de estagiários de ponta a ponta: DTO (CPF, RF-13, datas),
// índices únicos do banco, escopo, status editável e importação em lote.

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

const novoProcesso = async () =>
  ((await representante.post('/processos').send({}).expect(201)).body as { id: string }).id;

const cadastrar = async (processoId: string, extra: Record<string, unknown> = {}) =>
  (
    await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario(extra))
      .expect(201)
  ).body as { id: string };

describe('POST /processos/:id/estagiarios', () => {
  it('cadastra com os dados do TCE e não grava o CPF na auditoria', async () => {
    const processoId = await novoProcesso();

    const { body } = await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(
        estagiario({
          email: 'Ana@Exemplo.com',
          cidade: 'São Luís',
          uf: 'MA',
          cep: '65000000',
          dataInicio: '2026-12-01',
          dataTermino: '2027-02-28',
          horasPorDia: 6,
          diasSemana: ['seg', 'qua', 'sex'],
          horarioInicio: '07:00',
          horarioFim: '13:00',
        }),
      )
      .expect(201);

    expect(body).toMatchObject({
      processoId,
      cpf: CPFS[0],
      email: 'ana@exemplo.com',
      dataInicio: '2026-12-01T00:00:00.000Z',
      diasSemana: ['seg', 'qua', 'sex'],
      menorIdade: false,
    });
    const auditoria = await prisma.auditoria.findFirst({
      where: { entidade: 'estagiario', entidadeId: body.id, acao: 'CREATE' },
    });
    expect(auditoria).not.toBeNull();
    expect(JSON.stringify(auditoria?.dadosDepois)).not.toContain(CPFS[0]);
  });

  it.each([
    ['CPF com dígito errado', { cpf: '52998224724' }],
    ['CPF curto', { cpf: '5299822472' }],
    ['UF com três letras', { uf: 'MAR' }],
    ['CEP curto', { cep: '6500000' }],
    ['término antes do início', { dataInicio: '2027-03-01', dataTermino: '2027-01-31' }],
    ['dia da semana inválido', { diasSemana: ['segunda'] }],
    ['horário fora do formato', { horarioInicio: '7h' }],
    ['menor de idade sem responsável (RF-13)', { menorIdade: true }],
    ['campo desconhecido', { observacao: 'x' }],
  ])('400 com %s', async (_caso, extra) => {
    const processoId = await novoProcesso();

    await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario(extra))
      .expect(400);
  });

  it('normaliza CPF e CEP com pontuação, UF minúscula e espaços', async () => {
    const processoId = await novoProcesso();

    const { body } = await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario({ nome: '  Ana  ', cpf: '529.982.247-25', uf: ' ma ', cep: '65000-000' }))
      .expect(201);

    expect(body).toMatchObject({ nome: 'Ana', cpf: CPFS[0], uf: 'MA', cep: '65000000' });
  });

  it('menor de idade com responsável é aceito', async () => {
    const processoId = await novoProcesso();

    const { body } = await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario({ menorIdade: true, responsavelNome: 'Maria Souza' }))
      .expect(201);

    expect(body).toMatchObject({ menorIdade: true, responsavelNome: 'Maria Souza' });
  });

  it('CPF ou matrícula repetidos no mesmo processo respondem 409', async () => {
    const processoId = await novoProcesso();
    await cadastrar(processoId, { cpf: CPFS[0], matricula: 'M-1' });

    await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario({ cpf: CPFS[0], matricula: 'M-2' }))
      .expect(409);
    await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario({ cpf: CPFS[1], matricula: 'M-1' }))
      .expect(409);
  });

  it('o mesmo CPF pode estar em outro processo', async () => {
    await cadastrar(await novoProcesso(), { cpf: CPFS[2] });
    await cadastrar(await novoProcesso(), { cpf: CPFS[2] });
  });

  it('processo enviado não recebe estagiário (409 status_invalido)', async () => {
    const processoId = await novoProcesso();
    await mudarStatus(prisma, processoId, StatusProcesso.enviado);

    const { body } = await representante
      .post(`/processos/${processoId}/estagiarios`)
      .send(estagiario())
      .expect(409);
    expect(body.erro).toBe('status_invalido');
  });

  it('representante de outra instituição recebe 404', async () => {
    const processoId = await novoProcesso();

    await outraIes.post(`/processos/${processoId}/estagiarios`).send(estagiario()).expect(404);
  });
});

describe('GET /processos/:id/estagiarios', () => {
  it('lista em ordem alfabética, para o dono e para a coordenação', async () => {
    const processoId = await novoProcesso();
    await cadastrar(processoId, { nome: 'Bia Lima', cpf: CPFS[1] });
    await cadastrar(processoId, { nome: 'Ana Souza', cpf: CPFS[0] });

    const nomes = (resposta: { body: { nome: string }[] }) => resposta.body.map((e) => e.nome);
    expect(
      nomes(await representante.get(`/processos/${processoId}/estagiarios`).expect(200)),
    ).toEqual(['Ana Souza', 'Bia Lima']);
    expect(
      nomes(await coordenacao.get(`/processos/${processoId}/estagiarios`).expect(200)),
    ).toEqual(['Ana Souza', 'Bia Lima']);
  });

  it('404 para quem está fora do escopo', async () => {
    const processoId = await novoProcesso();

    await outraIes.get(`/processos/${processoId}/estagiarios`).expect(404);
  });

  it('GET :id não acha estagiário de outro processo', async () => {
    const processoA = await novoProcesso();
    const processoB = await novoProcesso();
    const { id } = await cadastrar(processoA);

    await representante.get(`/processos/${processoA}/estagiarios/${id}`).expect(200);
    await representante.get(`/processos/${processoB}/estagiarios/${id}`).expect(404);
  });
});

describe('PATCH /processos/:id/estagiarios/:id', () => {
  it('altera campos e audita antes e depois sem CPF', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);

    const { body } = await representante
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ curso: 'Medicina', email: 'novo@exemplo.com' })
      .expect(200);

    expect(body).toMatchObject({ curso: 'Medicina', email: 'novo@exemplo.com' });
    const update = await prisma.auditoria.findFirst({
      where: { entidade: 'estagiario', entidadeId: id, acao: 'UPDATE' },
    });
    expect(update?.dadosAntes).toMatchObject({ curso: 'Enfermagem' });
    expect(JSON.stringify([update?.dadosAntes, update?.dadosDepois])).not.toContain(CPFS[0]);
  });

  it('confere as datas contra o que já está gravado (400)', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId, { dataTermino: '2027-01-31' });

    await representante
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ dataInicio: '2027-03-01' })
      .expect(400);
  });

  it('RF-13: marcar menor sem responsável gravado responde 400', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);

    await representante
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ menorIdade: true })
      .expect(400);
  });

  it('desmarcar menor limpa o responsável', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId, { menorIdade: true, responsavelNome: 'Maria' });

    const { body } = await representante
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ menorIdade: false })
      .expect(200);

    expect(body).toMatchObject({ menorIdade: false, responsavelNome: null });
  });

  it('CPF de outro estagiário do processo responde 409', async () => {
    const processoId = await novoProcesso();
    await cadastrar(processoId, { cpf: CPFS[0] });
    const { id } = await cadastrar(processoId, { cpf: CPFS[1] });

    await representante
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ cpf: CPFS[0] })
      .expect(409);
  });

  it('a coordenação não altera estagiário (403)', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);

    await coordenacao
      .patch(`/processos/${processoId}/estagiarios/${id}`)
      .send({ curso: 'X' })
      .expect(403);
  });
});

describe('DELETE /processos/:id/estagiarios/:id', () => {
  it('remove e audita', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);

    await representante.delete(`/processos/${processoId}/estagiarios/${id}`).expect(204);

    await representante.get(`/processos/${processoId}/estagiarios/${id}`).expect(404);
    expect(await prisma.auditoria.count({ where: { entidadeId: id, acao: 'DELETE' } })).toBe(1);
  });

  it('estagiário com documento não é removido (409)', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);
    await prisma.documento.create({
      data: {
        processoId,
        estagiarioId: id,
        tipo: 'documento_pessoal',
        nomeArquivo: 'rg.pdf',
        mimeType: 'application/pdf',
        tamanhoBytes: 10,
        hashSha256: 'b'.repeat(64),
        storageKey: `integracao/${id}.pdf`,
        enviadoPorId: usuarios.representante.id,
      },
    });

    await representante.delete(`/processos/${processoId}/estagiarios/${id}`).expect(409);
  });

  it('processo aprovado não perde estagiário (409)', async () => {
    const processoId = await novoProcesso();
    const { id } = await cadastrar(processoId);
    await mudarStatus(prisma, processoId, StatusProcesso.aprovado);

    await representante.delete(`/processos/${processoId}/estagiarios/${id}`).expect(409);
  });
});

describe('POST /processos/:id/estagiarios/lote', () => {
  const csv = (...linhas: string[]) => Buffer.from(linhas.join('\n'), 'utf8');
  const enviarLote = (processoId: string, conteudo: Buffer, api: Api = representante) =>
    api
      .post(`/processos/${processoId}/estagiarios/lote`)
      .attach('arquivo', conteudo, { filename: 'lote.csv', contentType: 'text/csv' });

  it('importa o CSV do Excel (ponto e vírgula, acentos) e audita como IMPORT_LOTE', async () => {
    const processoId = await novoProcesso();

    const { body } = await enviarLote(
      processoId,
      csv(
        'nome;cpf;matricula;curso;email;menor_idade;responsavel_nome;uf;cep',
        `João Araújo;${CPFS[0]};L-1;Enfermagem;joao@exemplo.com;não;;MA;65000000`,
        `Bia Lima;${CPFS[1]};L-2;Medicina;bia@exemplo.com;sim;Maria Lima;MA;65130000`,
      ),
    ).expect(201);

    expect(body).toEqual({ total: 2 });
    const { body: lista } = await representante
      .get(`/processos/${processoId}/estagiarios`)
      .expect(200);
    expect(lista).toEqual([
      expect.objectContaining({
        nome: 'Bia Lima',
        menorIdade: true,
        responsavelNome: 'Maria Lima',
      }),
      expect.objectContaining({ nome: 'João Araújo', menorIdade: false }),
    ]);
    expect(
      await prisma.auditoria.count({ where: { entidadeId: processoId, acao: 'IMPORT_LOTE' } }),
    ).toBe(1);
  });

  it('uma linha inválida rejeita o arquivo inteiro, com linha e campo', async () => {
    const processoId = await novoProcesso();

    const { body } = await enviarLote(
      processoId,
      csv(
        'nome,cpf,matricula,curso',
        `Ana,${CPFS[0]},L-1,Enfermagem`,
        'Bia,12345678900,L-2,Medicina',
      ),
    ).expect(400);

    expect(body).toMatchObject({
      erro: 'lote_invalido',
      total: 2,
      invalidos: [expect.objectContaining({ linha: 3, campo: 'cpf' })],
    });
    expect(await prisma.estagiario.count({ where: { processoId } })).toBe(0);
  });

  it('CPF já cadastrado no processo invalida a linha', async () => {
    const processoId = await novoProcesso();
    await cadastrar(processoId, { cpf: CPFS[0] });

    const { body } = await enviarLote(
      processoId,
      csv('nome,cpf,matricula,curso', `Ana,${CPFS[0]},L-9,Enfermagem`),
    ).expect(400);

    expect(body.invalidos).toEqual([
      { linha: 2, campo: 'cpf', motivo: 'CPF já cadastrado no processo' },
    ]);
  });

  it('sem arquivo responde 400 csv_invalido', async () => {
    const processoId = await novoProcesso();

    const { body } = await representante
      .post(`/processos/${processoId}/estagiarios/lote`)
      .expect(400);
    expect(body.erro).toBe('csv_invalido');
  });

  it('arquivo que não é UTF-8 responde 400 csv_invalido', async () => {
    const processoId = await novoProcesso();

    const { body } = await enviarLote(
      processoId,
      Buffer.from('nome;cpf;matricula;curso\nJoão;52998224725;L-1;Enf', 'latin1'),
    ).expect(400);
    expect(body).toMatchObject({
      erro: 'csv_invalido',
      motivo: 'o arquivo precisa estar em UTF-8',
    });
  });

  it('representante de outra instituição recebe 404', async () => {
    const processoId = await novoProcesso();

    await enviarLote(
      processoId,
      csv('nome,cpf,matricula,curso', `Ana,${CPFS[0]},L-1,Enfermagem`),
      outraIes,
    ).expect(404);
  });
});
