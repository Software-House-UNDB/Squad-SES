import {
  ConflictException,
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
    },
  };
  const prisma = {
    signatario: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  };
  const auditoria = { registrar: vi.fn() };
  const email = { enviar: vi.fn() };
  const service = new AssinaturasService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
    email as unknown as EmailService,
    { get: (nome: string) => config[nome] } as unknown as ConfigService,
  );
  return { service, tx, prisma, auditoria, email };
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
