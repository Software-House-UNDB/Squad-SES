import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { hash } from '@node-rs/argon2';
import { PapelSignatario, Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import type { EmailService } from '../../email/email.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { calcularSha256 } from '../documentos/arquivo.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  AssinaturasService,
  OTP_INTERVALO_MS,
  OTP_MAX_TENTATIVAS,
  OTP_VALIDADE_MS,
} from './assinaturas.service.js';
import { gerarToken, hashToken, mascararEmail } from './tokens.js';

const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB, ip: '10.0.0.1' };
const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES, ip: '10.0.0.2' };
const CONFIG: Record<string, string> = {
  FRONTEND_URL: 'https://ses.exemplo.com/',
  DIRETOR_ESP_NOME: 'Dra. Diretora',
  DIRETOR_ESP_EMAIL: ' Diretora@ESP.ma.gov.br ',
};

const PDF = Buffer.from('%PDF-1.7 TCE da Ana');
const HASH_PDF = calcularSha256(PDF);

const TCE = (id: string, estagiario: object | null, papeis: PapelSignatario[] = []) => ({
  id,
  estagiario,
  signatarios: papeis.map((papel) => ({ papel })),
});

const PROCESSO = {
  id: 'p1',
  status: StatusProcesso.aguardando_assinaturas,
  supervisorNome: 'Sup Souza',
  supervisorEmail: 'sup@exemplo.com',
  criadoPor: { id: 'rep', nome: 'Rep UNDB', email: 'rep@undb.edu.br' },
  documentos: [TCE('d1', { id: 'e1', nome: 'Ana', email: 'ana@exemplo.com' })],
};

// Signatário carregado pelo token, já com um link válido.
function signatarioDoLink(extra: object = {}) {
  return {
    id: 's1',
    papel: PapelSignatario.SUPERVISOR,
    nome: 'Sup Souza',
    email: 'sup@exemplo.com',
    tokenExpiraEm: new Date(Date.now() + 60_000),
    otpHash: null as string | null,
    otpExpiraEm: null as Date | null,
    otpTentativas: 0,
    assinatura: null,
    documento: {
      id: 'd1',
      tipo: 'termo_compromisso',
      nomeArquivo: 'tce.pdf',
      mimeType: 'application/pdf',
      codigoValidacao: '7K3M9QX2HV4T',
      storageKey: 'processos/p1/tce.pdf',
      hashSha256: HASH_PDF,
      processo: { id: 'p1', status: StatusProcesso.aguardando_assinaturas },
    },
    ...extra,
  };
}

function montar(config: Record<string, string | undefined> = CONFIG) {
  let sequencia = 0;
  const tx = {
    processo: { findUnique: vi.fn().mockResolvedValue(PROCESSO) },
    signatario: {
      create: vi.fn(({ data }) => Promise.resolve({ id: `novo${++sequencia}`, ...data })),
      update: vi.fn(),
      // Por padrão ainda falta alguém assinar.
      count: vi.fn().mockResolvedValue(2),
    },
    assinatura: {
      create: vi.fn(({ data }) =>
        Promise.resolve({ id: 'a1', nivel: 'SIMPLES', assinadoEm: new Date(), ...data }),
      ),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ status: StatusProcesso.aguardando_assinaturas }]),
    documento: { update: vi.fn() },
  };
  Object.assign(tx.processo, {
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  });
  const prisma = {
    signatario: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    processo: { findFirst: vi.fn() },
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  };
  const storage = {
    baixar: vi.fn().mockResolvedValue(PDF),
    urlAssinada: vi.fn().mockResolvedValue('https://storage/assinada'),
  };
  const auditoria = { registrar: vi.fn() };
  const email = { enviar: vi.fn() };
  const service = new AssinaturasService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
    email as unknown as EmailService,
    { get: (nome: string) => config[nome] } as unknown as ConfigService,
    storage as unknown as StorageService,
  );
  return { service, tx, prisma, auditoria, email, storage };
}

// Token válido no formato; o findUnique decide o que ele "é".
const TOKEN = gerarToken().token;

async function respostaDe(promessa: Promise<unknown>) {
  const erro = await promessa.catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(HttpException);
  return {
    status: (erro as HttpException).getStatus(),
    corpo: (erro as HttpException).getResponse(),
  };
}

describe('AssinaturasService.criarSignatarios', () => {
  it('cria os 4 signatários do TCE, com vínculo por papel, e audita cada um', async () => {
    const { service, tx, auditoria } = montar();

    const criados = await service.criarSignatarios(tx as never, 'p1', REPRESENTANTE);

    expect(criados).toHaveLength(4);
    expect(tx.signatario.create.mock.calls.map(([{ data }]) => data)).toEqual([
      {
        documentoId: 'd1',
        papel: PapelSignatario.REPRESENTANTE_UNDB,
        nome: 'Rep UNDB',
        email: 'rep@undb.edu.br',
        usuarioId: 'rep',
      },
      {
        documentoId: 'd1',
        papel: PapelSignatario.SUPERVISOR,
        nome: 'Sup Souza',
        email: 'sup@exemplo.com',
      },
      {
        documentoId: 'd1',
        papel: PapelSignatario.DIRETOR_ESP,
        nome: 'Dra. Diretora',
        email: 'diretora@esp.ma.gov.br',
      },
      {
        documentoId: 'd1',
        papel: PapelSignatario.ESTAGIARIO,
        nome: 'Ana',
        email: 'ana@exemplo.com',
        estagiarioId: 'e1',
      },
    ]);
    expect(auditoria.registrar).toHaveBeenCalledTimes(4);
    expect(auditoria.registrar.mock.calls[0][2]).toMatchObject({
      acao: 'CREATE',
      entidade: 'signatario',
      entidadeId: 'novo1',
    });
  });

  it('é idempotente: pula papéis que o documento já tem', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue({
      ...PROCESSO,
      documentos: [
        TCE('d1', { id: 'e1', nome: 'Ana', email: 'ana@exemplo.com' }, [
          PapelSignatario.REPRESENTANTE_UNDB,
          PapelSignatario.SUPERVISOR,
          PapelSignatario.DIRETOR_ESP,
        ]),
      ],
    });

    await service.criarSignatarios(tx as never, 'p1', REPRESENTANTE);

    expect(tx.signatario.create).toHaveBeenCalledTimes(1);
    expect(tx.signatario.create.mock.calls[0][0].data.papel).toBe(PapelSignatario.ESTAGIARIO);
  });

  it('gera o código de validação do TCE que ainda não tem', async () => {
    const { service, tx } = montar();

    await service.criarSignatarios(tx as never, 'p1', REPRESENTANTE);

    expect(tx.documento.update).toHaveBeenCalledTimes(1);
    const { where, data } = tx.documento.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'd1' });
    expect(data.codigoValidacao).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it('não troca o código de validação que o documento já tem', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue({
      ...PROCESSO,
      documentos: [
        {
          ...TCE('d1', { id: 'e1', nome: 'Ana', email: 'ana@exemplo.com' }),
          codigoValidacao: '7K3M9QX2HV4T',
        },
      ],
    });

    await service.criarSignatarios(tx as never, 'p1', REPRESENTANTE);

    expect(tx.documento.update).not.toHaveBeenCalled();
  });

  it('lista tudo o que falta antes de criar qualquer signatário', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue({
      ...PROCESSO,
      supervisorNome: null,
      supervisorEmail: null,
      documentos: [TCE('d1', null), TCE('d2', { id: 'e2', nome: 'Bia', email: null })],
    });

    const { status, corpo } = await respostaDe(
      service.criarSignatarios(tx as never, 'p1', REPRESENTANTE),
    );

    expect(status).toBe(400);
    expect(corpo).toEqual({
      erro: 'assinatura_incompleta',
      pendencias: [
        { campo: 'supervisorNome', motivo: 'nome do supervisor não informado' },
        { campo: 'supervisorEmail', motivo: 'e-mail do supervisor não informado' },
        { campo: 'estagiarioId', motivo: 'TCE sem estagiário vinculado', documentoId: 'd1' },
        { campo: 'email', motivo: 'e-mail do estagiário não informado', estagiarioId: 'e2' },
      ],
    });
    expect(tx.signatario.create).not.toHaveBeenCalled();
  });

  it('recusa processo sem TCE', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue({ ...PROCESSO, documentos: [] });

    const { corpo } = await respostaDe(service.criarSignatarios(tx as never, 'p1', REPRESENTANTE));

    expect(corpo).toMatchObject({ pendencias: [{ campo: 'tce' }] });
  });

  it('recusa processo fora de aguardando_assinaturas', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue({ ...PROCESSO, status: StatusProcesso.aprovado });

    await expect(service.criarSignatarios(tx as never, 'p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('responde 503 sem o diretor da ESP-MA configurado', async () => {
    const { service, tx } = montar({ ...CONFIG, DIRETOR_ESP_EMAIL: undefined });

    await expect(service.criarSignatarios(tx as never, 'p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('responde 404 para processo inexistente', async () => {
    const { service, tx } = montar();
    tx.processo.findUnique.mockResolvedValue(null);

    await expect(service.criarSignatarios(tx as never, 'p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AssinaturasService.enviarLinks', () => {
  const SUPERVISOR = { id: 's1', nome: 'Sup', email: 'sup@exemplo.com', papel: 'SUPERVISOR' };
  const ESTAGIARIO = { id: 's2', nome: 'Ana', email: 'ana@exemplo.com', papel: 'ESTAGIARIO' };

  it('busca só quem não recebeu, não assinou e não é o representante', async () => {
    const { service, prisma } = montar();

    await service.enviarLinks('p1');

    expect(prisma.signatario.findMany.mock.calls[0][0].where).toEqual({
      documento: { processoId: 'p1' },
      papel: { not: PapelSignatario.REPRESENTANTE_UNDB },
      linkEnviadoEm: null,
      assinatura: { is: null },
    });
  });

  it('guarda só o hash do token e manda no e-mail o link com o token', async () => {
    const { service, prisma, email } = montar();
    prisma.signatario.findMany.mockResolvedValue([SUPERVISOR]);

    const resultado = await service.enviarLinks('p1');

    expect(resultado).toEqual({ enviados: 1, falhas: [] });
    const { data } = prisma.signatario.update.mock.calls[0][0];
    const mensagem = email.enviar.mock.calls[0][0];
    const token = /https:\/\/ses\.exemplo\.com\/assinar\/([A-Za-z0-9_-]{43})/.exec(
      mensagem.texto,
    )?.[1];
    expect(token).toBeDefined();
    expect(data.tokenHash).toBe(hashToken(token!));
    expect(mensagem.texto).not.toContain(data.tokenHash);
    expect(mensagem.para).toBe('sup@exemplo.com');
    expect(data).toMatchObject({ otpHash: null, otpExpiraEm: null, otpTentativas: 0 });
    // linkEnviadoEm só depois do envio.
    expect(data.linkEnviadoEm).toBeUndefined();
    expect(prisma.signatario.update.mock.calls[1][0].data.linkEnviadoEm).toBeInstanceOf(Date);
  });

  it('uma falha de e-mail não impede os outros nem marca o link como enviado', async () => {
    const { service, prisma, email } = montar();
    prisma.signatario.findMany.mockResolvedValue([SUPERVISOR, ESTAGIARIO]);
    email.enviar.mockRejectedValueOnce(new Error('SMTP fora'));
    vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    const resultado = await service.enviarLinks('p1');

    expect(resultado).toEqual({
      enviados: 1,
      falhas: [{ signatarioId: 's1', papel: 'SUPERVISOR' }],
    });
    const marcados = prisma.signatario.update.mock.calls
      .filter(([{ data }]) => data.linkEnviadoEm)
      .map(([{ where }]) => where.id);
    expect(marcados).toEqual(['s2']);
  });
});

describe('AssinaturasService.iniciarAssinaturas', () => {
  it('muda o status só se estiver aprovado, audita e cria os signatários na transação', async () => {
    const { service, tx, auditoria } = montar();

    const resultado = await service.iniciarAssinaturas('p1', COORDENACAO);

    expect(tx.processo.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: StatusProcesso.aprovado },
      data: { status: StatusProcesso.aguardando_assinaturas },
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(tx, COORDENACAO, {
      acao: 'UPDATE',
      entidade: 'processo',
      entidadeId: 'p1',
      dadosAntes: { status: StatusProcesso.aprovado },
      dadosDepois: { status: StatusProcesso.aguardando_assinaturas },
    });
    expect(tx.signatario.create).toHaveBeenCalledTimes(4);
    expect(resultado).toMatchObject({
      processoId: 'p1',
      status: StatusProcesso.aguardando_assinaturas,
      signatariosCriados: 4,
    });
  });

  it('envia os links só depois da transação', async () => {
    const { service, prisma, tx } = montar();
    const ordem: string[] = [];
    tx.signatario.create.mockImplementation(({ data }) => {
      ordem.push('create');
      return Promise.resolve({ id: 'novo', ...data });
    });
    prisma.signatario.findMany.mockImplementation(() => {
      ordem.push('enviarLinks');
      return Promise.resolve([]);
    });

    await service.iniciarAssinaturas('p1', COORDENACAO);

    expect(ordem.at(-1)).toBe('enviarLinks');
    expect(ordem.filter((passo) => passo === 'create')).toHaveLength(4);
  });

  it('devolve as falhas de envio sem desfazer a transição', async () => {
    const { service, prisma, email, tx } = montar();
    prisma.signatario.findMany.mockResolvedValue([
      { id: 's1', nome: 'Sup', email: 'sup@exemplo.com', papel: PapelSignatario.SUPERVISOR },
    ]);
    email.enviar.mockRejectedValue(new Error('SMTP fora'));

    const resultado = await service.iniciarAssinaturas('p1', COORDENACAO);

    expect(resultado).toMatchObject({
      enviados: 0,
      falhas: [{ signatarioId: 's1', papel: PapelSignatario.SUPERVISOR }],
    });
    expect(tx.processo.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    StatusProcesso.rascunho,
    StatusProcesso.enviado,
    StatusProcesso.em_analise,
    StatusProcesso.pendencia,
    StatusProcesso.aguardando_assinaturas,
    StatusProcesso.concluido,
  ])('recusa processo em %s com 409, sem criar signatários', async (status) => {
    const { service, tx, prisma } = montar();
    tx.processo.updateMany.mockResolvedValue({ count: 0 });
    tx.processo.findUnique.mockResolvedValue({ status });

    const { status: http, corpo } = await respostaDe(service.iniciarAssinaturas('p1', COORDENACAO));

    expect(http).toBe(409);
    expect(corpo).toMatchObject({ erro: 'transicao_invalida' });
    expect(tx.signatario.create).not.toHaveBeenCalled();
    expect(prisma.signatario.findMany).not.toHaveBeenCalled();
  });

  it('responde 404 para processo inexistente', async () => {
    const { service, tx } = montar();
    tx.processo.updateMany.mockResolvedValue({ count: 0 });
    tx.processo.findUnique.mockResolvedValue(null);

    await expect(service.iniciarAssinaturas('p1', COORDENACAO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('pendência nos dados derruba a transação e não envia nada', async () => {
    const { service, tx, prisma } = montar();
    tx.processo.findUnique.mockResolvedValue({ ...PROCESSO, supervisorEmail: null });

    await expect(service.iniciarAssinaturas('p1', COORDENACAO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.signatario.findMany).not.toHaveBeenCalled();
  });

  it('só a coordenação SES inicia', async () => {
    const { service, tx } = montar();

    await expect(service.iniciarAssinaturas('p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.processo.updateMany).not.toHaveBeenCalled();
  });
});

describe('AssinaturasService.reenviarLinksPendentes', () => {
  it('reenvia os pendentes de um processo aguardando assinaturas', async () => {
    const { service, prisma, email } = montar();
    prisma.processo.findFirst.mockResolvedValue({ status: StatusProcesso.aguardando_assinaturas });
    prisma.signatario.findMany.mockResolvedValue([
      { id: 's1', nome: 'Sup', email: 'sup@exemplo.com', papel: PapelSignatario.SUPERVISOR },
    ]);

    await expect(service.reenviarLinksPendentes('p1', COORDENACAO)).resolves.toEqual({
      enviados: 1,
      falhas: [],
    });
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });

  it('limita o representante aos próprios processos', async () => {
    const { service, prisma } = montar();
    prisma.processo.findFirst.mockResolvedValue(null);

    await expect(service.reenviarLinksPendentes('p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.processo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', criadoPorId: 'rep' } }),
    );
  });

  it('recusa processo fora de aguardando_assinaturas', async () => {
    const { service, prisma } = montar();
    prisma.processo.findFirst.mockResolvedValue({ status: StatusProcesso.aprovado });

    await expect(service.reenviarLinksPendentes('p1', COORDENACAO)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.signatario.findMany).not.toHaveBeenCalled();
  });
});

describe('AssinaturasService.reenviarLink', () => {
  it('gera link novo e audita sem o token', async () => {
    const { service, prisma, email, auditoria } = montar();
    prisma.signatario.findFirst.mockResolvedValue(signatarioDoLink());

    const resposta = await service.reenviarLink('s1', COORDENACAO);

    expect(resposta.signatarioId).toBe('s1');
    expect(email.enviar).toHaveBeenCalledTimes(1);
    const registro = auditoria.registrar.mock.calls[0][2];
    expect(registro).toMatchObject({ acao: 'UPDATE', entidade: 'signatario', entidadeId: 's1' });
    expect(JSON.stringify(registro)).not.toMatch(/token_hash|tokenHash/);
  });

  it('limita o representante aos próprios processos', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findFirst.mockResolvedValue(null);

    await expect(service.reenviarLink('s1', REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.signatario.findFirst.mock.calls[0][0].where).toEqual({
      id: 's1',
      documento: { processo: { criadoPorId: 'rep' } },
    });
  });

  it.each([
    ['o representante', { papel: PapelSignatario.REPRESENTANTE_UNDB }],
    ['quem já assinou', { assinatura: { id: 'a1' } }],
    [
      'processo concluído',
      {
        documento: {
          ...signatarioDoLink().documento,
          processo: { id: 'p1', status: StatusProcesso.concluido },
        },
      },
    ],
  ])('recusa %s', async (_caso, extra) => {
    const { service, prisma, email } = montar();
    prisma.signatario.findFirst.mockResolvedValue(signatarioDoLink(extra));

    await expect(service.reenviarLink('s1', COORDENACAO)).rejects.toBeInstanceOf(ConflictException);
    expect(email.enviar).not.toHaveBeenCalled();
  });
});

describe('AssinaturasService.consultarLink', () => {
  it('procura pelo hash do token e mascara o e-mail', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(signatarioDoLink());

    const resposta = await service.consultarLink(TOKEN);

    expect(prisma.signatario.findUnique.mock.calls[0][0].where).toEqual({
      tokenHash: hashToken(TOKEN),
    });
    expect(resposta).toMatchObject({
      nome: 'Sup Souza',
      papel: PapelSignatario.SUPERVISOR,
      email: 's**@exemplo.com',
      otpAtivo: false,
      documento: { id: 'd1', nomeArquivo: 'tce.pdf' },
    });
  });

  it('token fora do formato nem consulta o banco', async () => {
    const { service, prisma } = montar();

    const { status, corpo } = await respostaDe(service.consultarLink('curto'));

    expect(status).toBe(404);
    expect(corpo).toMatchObject({ erro: 'link_invalido' });
    expect(prisma.signatario.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['token desconhecido', null, 404, 'link_invalido'],
    ['já assinado', signatarioDoLink({ assinatura: { id: 'a1' } }), 409, 'ja_assinado'],
    [
      'link expirado',
      signatarioDoLink({ tokenExpiraEm: new Date(Date.now() - 1) }),
      410,
      'link_expirado',
    ],
    [
      'processo fora de aguardando_assinaturas',
      signatarioDoLink({
        documento: {
          ...signatarioDoLink().documento,
          processo: { id: 'p1', status: StatusProcesso.pendencia },
        },
      }),
      409,
      'assinatura_encerrada',
    ],
  ])('%s', async (_caso, signatario, statusEsperado, erroEsperado) => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(signatario);

    const { status, corpo } = await respostaDe(service.consultarLink(TOKEN));

    expect(status).toBe(statusEsperado);
    expect(corpo).toMatchObject({ erro: erroEsperado });
  });
});

describe('AssinaturasService.enviarOtp', () => {
  it('gera código de 6 dígitos, guarda só o hash e manda por e-mail', async () => {
    const { service, prisma, email } = montar();
    prisma.signatario.findUnique.mockResolvedValue(signatarioDoLink());

    const resposta = await service.enviarOtp(TOKEN);

    const codigo = /: (\d{6})$/.exec(email.enviar.mock.calls[0][0].assunto)?.[1];
    expect(codigo).toBeDefined();
    const { data } = prisma.signatario.updateMany.mock.calls[0][0];
    expect(data.otpHash).not.toContain(codigo);
    expect(data.otpHash).toMatch(/^\$argon2/);
    expect(data.otpTentativas).toBe(0);
    expect(resposta.email).toBe('s**@exemplo.com');
    expect(resposta.otpExpiraEm.getTime() - Date.now()).toBeGreaterThan(OTP_VALIDADE_MS - 5_000);
  });

  it('a condição de intervalo mínimo vai no próprio UPDATE', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(signatarioDoLink());

    await service.enviarOtp(TOKEN);

    const { where } = prisma.signatario.updateMany.mock.calls[0][0];
    expect(where.OR[0]).toEqual({ otpExpiraEm: null });
    const limite = where.OR[1].otpExpiraEm.lte.getTime();
    expect(limite - Date.now()).toBeGreaterThan(OTP_VALIDADE_MS - OTP_INTERVALO_MS - 5_000);
    expect(limite - Date.now()).toBeLessThanOrEqual(OTP_VALIDADE_MS - OTP_INTERVALO_MS);
  });

  it('pedido dentro do intervalo responde 429 com o tempo de espera e não envia', async () => {
    const { service, prisma, email } = montar();
    // Código emitido há 20 s.
    prisma.signatario.findUnique.mockResolvedValue(
      signatarioDoLink({ otpExpiraEm: new Date(Date.now() + OTP_VALIDADE_MS - 20_000) }),
    );
    prisma.signatario.updateMany.mockResolvedValue({ count: 0 });

    const { status, corpo } = await respostaDe(service.enviarOtp(TOKEN));

    expect(status).toBe(429);
    expect(corpo).toMatchObject({ erro: 'otp_recente', aguardarSegundos: 40 });
    expect(email.enviar).not.toHaveBeenCalled();
  });
});

describe('AssinaturasService.verificarOtp', () => {
  const CODIGO = '012345';
  const comOtp = async (extra: object = {}) =>
    signatarioDoLink({
      otpHash: await hash(CODIGO),
      otpExpiraEm: new Date(Date.now() + 60_000),
      ...extra,
    });

  it('aceita o código certo e conta a tentativa no UPDATE', async () => {
    const { service, prisma } = montar();
    const signatario = await comOtp();
    prisma.signatario.findUnique.mockResolvedValue(signatario);

    await expect(service.verificarOtp(TOKEN, CODIGO)).resolves.toEqual({ valido: true });
    expect(prisma.signatario.updateMany).toHaveBeenCalledWith({
      where: {
        id: 's1',
        otpHash: signatario.otpHash,
        otpTentativas: { lt: OTP_MAX_TENTATIVAS },
      },
      data: { otpTentativas: { increment: 1 } },
    });
  });

  it('código certo zera as tentativas, para o caminho normal não gastar o limite', async () => {
    const { service, prisma } = montar();
    const signatario = await comOtp({ otpTentativas: 2 });
    prisma.signatario.findUnique.mockResolvedValue(signatario);

    await service.verificarOtp(TOKEN, CODIGO);

    expect(prisma.signatario.updateMany).toHaveBeenLastCalledWith({
      where: { id: 's1', otpHash: signatario.otpHash },
      data: { otpTentativas: 0 },
    });
  });

  it('código errado não zera as tentativas', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());

    await service.verificarOtp(TOKEN, '999999').catch(() => undefined);

    expect(prisma.signatario.updateMany).toHaveBeenCalledTimes(1);
  });

  it('código errado responde 400 com as tentativas restantes', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp({ otpTentativas: 2 }));

    const { status, corpo } = await respostaDe(service.verificarOtp(TOKEN, '999999'));

    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: 'otp_invalido', tentativasRestantes: 2 });
  });

  it('tentativas esgotadas respondem 429 sem conferir o código', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(
      await comOtp({ otpTentativas: OTP_MAX_TENTATIVAS }),
    );
    prisma.signatario.updateMany.mockResolvedValue({ count: 0 });

    const { status, corpo } = await respostaDe(service.verificarOtp(TOKEN, CODIGO));

    expect(status).toBe(429);
    expect(corpo).toMatchObject({ erro: 'otp_bloqueado' });
  });

  it.each([
    ['sem código pedido', { otpHash: null, otpExpiraEm: null }],
    ['código expirado', { otpExpiraEm: new Date(Date.now() - 1) }],
  ])('%s responde 410', async (_caso, extra) => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp(extra));

    await expect(service.verificarOtp(TOKEN, CODIGO)).rejects.toBeInstanceOf(GoneException);
    expect(prisma.signatario.updateMany).not.toHaveBeenCalled();
  });

  it('link inválido barra antes do código', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findUnique.mockResolvedValue(null);

    await expect(service.verificarOtp(TOKEN, CODIGO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('mascararEmail', () => {
  it.each([
    ['ana.lima@exemplo.com', 'a*******@exemplo.com'],
    ['a@exemplo.com', 'a*@exemplo.com'],
  ])('%s -> %s', (email, mascarado) => {
    expect(mascararEmail(email)).toBe(mascarado);
  });
});

describe('AssinaturasService.assinarPorLink', () => {
  const CODIGO = '012345';
  const EVIDENCIA = { ip: '200.1.2.3', userAgent: 'Firefox/140' };
  const comOtp = async (extra: object = {}) =>
    signatarioDoLink({
      otpHash: await hash(CODIGO),
      otpExpiraEm: new Date(Date.now() + 60_000),
      ...extra,
    });

  it('grava as evidências com o hash calculado agora, consome o código e audita', async () => {
    const { service, prisma, tx, storage, auditoria } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());

    const resposta = await service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA);

    expect(storage.baixar).toHaveBeenCalledWith('processos/p1/tce.pdf');
    expect(tx.assinatura.create).toHaveBeenCalledWith({
      data: {
        signatarioId: 's1',
        documentoId: 'd1',
        hashSha256: HASH_PDF,
        metodo: 'OTP',
        aceite: true,
        ip: '200.1.2.3',
        userAgent: 'Firefox/140',
      },
    });
    expect(tx.signatario.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { otpHash: null, otpExpiraEm: null },
    });
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    const [, autor, registro] = auditoria.registrar.mock.calls[0];
    expect(autor).toEqual({ id: undefined, ip: '200.1.2.3' });
    expect(registro).toMatchObject({
      acao: 'ASSINATURA',
      entidade: 'assinatura',
      entidadeId: 'a1',
      dadosDepois: { papel: 'SUPERVISOR', metodo: 'OTP', nivel: 'SIMPLES', hashSha256: HASH_PDF },
    });
    expect(tx.processo.update).not.toHaveBeenCalled();
    expect(resposta).toMatchObject({
      metodo: 'OTP',
      nivel: 'SIMPLES',
      codigoValidacao: '7K3M-9QX2-HV4T',
      processoConcluido: false,
    });
  });

  it('trava o processo antes de contar quem falta', async () => {
    const { service, prisma, tx } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());

    await service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA);

    const sql = tx.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.signatario.count.mock.invocationCallOrder[0],
    );
    expect(tx.signatario.count).toHaveBeenCalledWith({
      where: { documento: { processoId: 'p1' }, assinatura: { is: null } },
    });
  });

  it('a última assinatura conclui o processo na mesma transação e audita a transição', async () => {
    const { service, prisma, tx, auditoria } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());
    tx.signatario.count.mockResolvedValue(0);

    const resposta = await service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA);

    expect(tx.processo.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: StatusProcesso.concluido },
    });
    expect(auditoria.registrar.mock.calls[1][2]).toMatchObject({
      acao: 'UPDATE',
      entidade: 'processo',
      entidadeId: 'p1',
      dadosAntes: { status: StatusProcesso.aguardando_assinaturas },
      dadosDepois: { status: StatusProcesso.concluido },
    });
    expect(resposta.processoConcluido).toBe(true);
  });

  it('recusa se o PDF no storage não confere com o hash do upload', async () => {
    const { service, prisma, storage, tx } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());
    storage.baixar.mockResolvedValue(Buffer.from('%PDF-1.7 outro conteúdo'));
    vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    const { status, corpo } = await respostaDe(service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA));

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: 'documento_alterado' });
    expect(tx.assinatura.create).not.toHaveBeenCalled();
  });

  it('código errado não assina', async () => {
    const { service, prisma, tx, storage } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());

    const { status } = await respostaDe(service.assinarPorLink(TOKEN, '999999', EVIDENCIA));

    expect(status).toBe(400);
    expect(storage.baixar).not.toHaveBeenCalled();
    expect(tx.assinatura.create).not.toHaveBeenCalled();
  });

  it('processo que saiu de aguardando_assinaturas durante a assinatura é recusado dentro da trava', async () => {
    const { service, prisma, tx } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());
    tx.$queryRaw.mockResolvedValue([{ status: StatusProcesso.concluido }]);

    const { status, corpo } = await respostaDe(service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA));

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: 'assinatura_encerrada' });
    expect(tx.assinatura.create).not.toHaveBeenCalled();
  });

  it('segunda assinatura simultânea do mesmo signatário vira 409 ja_assinado', async () => {
    const { service, prisma, tx } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());
    tx.assinatura.create.mockRejectedValue(Object.assign(new Error('único'), { code: 'P2002' }));

    const { status, corpo } = await respostaDe(service.assinarPorLink(TOKEN, CODIGO, EVIDENCIA));

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: 'ja_assinado' });
  });

  it('sem IP ou user-agent grava "desconhecido" (as colunas são obrigatórias)', async () => {
    const { service, prisma, tx } = montar();
    prisma.signatario.findUnique.mockResolvedValue(await comOtp());

    await service.assinarPorLink(TOKEN, CODIGO, {});

    expect(tx.assinatura.create.mock.calls[0][0].data).toMatchObject({
      ip: 'desconhecido',
      userAgent: 'desconhecido',
    });
  });
});

describe('AssinaturasService.urlDocumentoPorLink', () => {
  it('confere o código e devolve URL temporária do PDF', async () => {
    const { service, prisma, storage } = montar();
    prisma.signatario.findUnique.mockResolvedValue(
      signatarioDoLink({
        otpHash: await hash('012345'),
        otpExpiraEm: new Date(Date.now() + 60_000),
      }),
    );

    const resposta = await service.urlDocumentoPorLink(TOKEN, '012345');

    expect(resposta.url).toBe('https://storage/assinada');
    expect(storage.urlAssinada).toHaveBeenCalledWith(
      'processos/p1/tce.pdf',
      'tce.pdf',
      'application/pdf',
      300,
    );
  });

  it('sem código válido não gera URL', async () => {
    const { service, prisma, storage } = montar();
    prisma.signatario.findUnique.mockResolvedValue(signatarioDoLink());

    await expect(service.urlDocumentoPorLink(TOKEN, '012345')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(storage.urlAssinada).not.toHaveBeenCalled();
  });
});

describe('AssinaturasService.assinarLogado', () => {
  const representante = async (extra: object = {}) =>
    signatarioDoLink({
      id: 'sr',
      papel: PapelSignatario.REPRESENTANTE_UNDB,
      usuario: { senhaHash: await hash('Senha@2026') },
      ...extra,
    });

  it('confere a senha e grava método SENHA com o usuário na auditoria', async () => {
    const { service, prisma, tx, auditoria } = montar();
    prisma.signatario.findFirst.mockResolvedValue(await representante());

    const resposta = await service.assinarLogado('sr', 'Senha@2026', REPRESENTANTE, 'Chrome/140');

    expect(prisma.signatario.findFirst.mock.calls[0][0].where).toEqual({
      id: 'sr',
      usuarioId: 'rep',
      papel: PapelSignatario.REPRESENTANTE_UNDB,
    });
    expect(tx.assinatura.create.mock.calls[0][0].data).toMatchObject({
      metodo: 'SENHA',
      ip: '10.0.0.1',
      userAgent: 'Chrome/140',
    });
    expect(auditoria.registrar.mock.calls[0][1]).toEqual({ id: 'rep', ip: '10.0.0.1' });
    expect(resposta.metodo).toBe('SENHA');
  });

  it('senha errada responde 401 e não assina', async () => {
    const { service, prisma, tx } = montar();
    prisma.signatario.findFirst.mockResolvedValue(await representante());

    const { status, corpo } = await respostaDe(
      service.assinarLogado('sr', 'errada', REPRESENTANTE),
    );

    expect(status).toBe(401);
    expect(corpo).toMatchObject({ erro: 'senha_invalida' });
    expect(tx.assinatura.create).not.toHaveBeenCalled();
  });

  it('signatário de outra pessoa ou de outro papel responde 404', async () => {
    const { service, prisma } = montar();
    prisma.signatario.findFirst.mockResolvedValue(null);

    await expect(service.assinarLogado('s1', 'Senha@2026', REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['já assinado', { assinatura: { id: 'a1' } }, 'ja_assinado'],
    [
      'processo fora de aguardando_assinaturas',
      {
        documento: {
          ...signatarioDoLink().documento,
          processo: { id: 'p1', status: StatusProcesso.aprovado },
        },
      },
      'assinatura_encerrada',
    ],
  ])('%s responde 409', async (_caso, extra, erro) => {
    const { service, prisma } = montar();
    prisma.signatario.findFirst.mockResolvedValue(await representante(extra));

    const { status, corpo } = await respostaDe(
      service.assinarLogado('sr', 'Senha@2026', REPRESENTANTE),
    );

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro });
  });
});

describe('AssinaturasService.listarPorProcesso', () => {
  it('aplica o escopo do representante e responde 404 fora dele', async () => {
    const { service, prisma } = montar();
    prisma.processo.findFirst.mockResolvedValue(null);

    await expect(service.listarPorProcesso('p1', REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.processo.findFirst.mock.calls[0][0].where).toEqual({
      id: 'p1',
      criadoPorId: 'rep',
    });
  });

  it('devolve o código de validação formatado', async () => {
    const { service, prisma } = montar();
    prisma.processo.findFirst.mockResolvedValue({
      id: 'p1',
      documentos: [
        { id: 'd1', codigoValidacao: '7K3M9QX2HV4T', signatarios: [] },
        { id: 'd2', codigoValidacao: null, signatarios: [] },
      ],
    });

    const resposta = await service.listarPorProcesso('p1', COORDENACAO);

    expect(resposta.documentos.map((d) => d.codigoValidacao)).toEqual(['7K3M-9QX2-HV4T', null]);
  });

  it('não expõe hash de token nem de código', async () => {
    const { service, prisma } = montar();
    prisma.processo.findFirst.mockResolvedValue({ id: 'p1', documentos: [] });

    await service.listarPorProcesso('p1', COORDENACAO);

    const selecao = JSON.stringify(prisma.processo.findFirst.mock.calls[0][0].select);
    expect(selecao).not.toMatch(/tokenHash|otpHash/);
  });
});
