import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { Perfil } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TokenPayload } from './auth.types.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AuthService } from './auth.service.js';

const ACCESS = 'segredo-access-teste';
const REFRESH = 'segredo-refresh-teste';
const SENHA = 'Senha@2026';

async function montar() {
  const usuario = {
    id: 'u1',
    nome: 'Ana',
    email: 'ana@ses.ma.gov.br',
    senhaHash: await hash(SENHA),
    perfil: Perfil.COORDENACAO_SES,
    instituicao: 'SES-MA',
  };
  // Banco falso: só conhece a Ana, por e-mail ou por id.
  const prisma = {
    usuario: {
      findUnique: vi.fn(({ where }: { where: { email?: string; id?: string } }) =>
        Promise.resolve(where.email === usuario.email || where.id === usuario.id ? usuario : null),
      ),
    },
  } as unknown as PrismaService;
  const jwt = new JwtService();
  const config = new ConfigService({ JWT_ACCESS_SECRET: ACCESS, JWT_REFRESH_SECRET: REFRESH });
  const auditoria = { registrarAcesso: vi.fn() };
  return {
    usuario,
    jwt,
    auditoria,
    service: new AuthService(prisma, jwt, config, auditoria as unknown as AuditoriaService),
  };
}

describe('AuthService.login', () => {
  it('devolve os tokens e o usuário sem o senhaHash', async () => {
    const { usuario, jwt, service } = await montar();

    const resposta = await service.login({ email: usuario.email, senha: SENHA });

    expect(resposta.usuario).toEqual({
      id: 'u1',
      email: 'ana@ses.ma.gov.br',
      perfil: Perfil.COORDENACAO_SES,
      instituicao: 'SES-MA',
    });
    expect(resposta.usuario).not.toHaveProperty('senhaHash');
    const payload = await jwt.verifyAsync<TokenPayload>(resposta.accessToken, { secret: ACCESS });
    expect(payload).toMatchObject({
      sub: 'u1',
      perfil: Perfil.COORDENACAO_SES,
      instituicao: 'SES-MA',
    });
  });

  it('recusa senha errada', async () => {
    const { usuario, service } = await montar();

    await expect(service.login({ email: usuario.email, senha: 'errada' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('registra o login na auditoria com IP e navegador', async () => {
    const { usuario, auditoria, service } = await montar();

    await service.login(
      { email: usuario.email, senha: SENHA },
      { ip: '200.1.2.3', userAgent: 'UA' },
    );

    expect(auditoria.registrarAcesso).toHaveBeenCalledExactlyOnceWith(
      { id: 'u1', ip: '200.1.2.3' },
      { acao: 'LOGIN', entidade: 'usuario', entidadeId: 'u1', dadosDepois: { userAgent: 'UA' } },
    );
  });

  it('registra a senha errada como LOGIN_FALHA, sem usuário autor', async () => {
    const { usuario, auditoria, service } = await montar();

    await service
      .login({ email: usuario.email, senha: 'errada' }, { ip: '200.1.2.3' })
      .catch(() => undefined);

    expect(auditoria.registrarAcesso).toHaveBeenCalledExactlyOnceWith(
      { ip: '200.1.2.3' },
      {
        acao: 'LOGIN_FALHA',
        entidade: 'usuario',
        entidadeId: 'u1',
        dadosDepois: { email: usuario.email, motivo: 'senha_incorreta', userAgent: undefined },
      },
    );
  });

  it('registra e-mail sem conta como LOGIN_FALHA com o e-mail tentado', async () => {
    const { auditoria, service } = await montar();

    await expect(
      service.login({ email: 'ninguem@x.com', senha: SENHA }, { ip: '200.1.2.3' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditoria.registrarAcesso).toHaveBeenCalledWith(
      { ip: '200.1.2.3' },
      expect.objectContaining({
        acao: 'LOGIN_FALHA',
        entidadeId: 'ninguem@x.com',
        dadosDepois: expect.objectContaining({ motivo: 'usuario_inexistente' }),
      }),
    );
  });

  it('recusa e-mail sem conta com a mesma mensagem da senha errada', async () => {
    const { service } = await montar();

    await expect(service.login({ email: 'ninguem@x.com', senha: SENHA })).rejects.toThrow(
      'E-mail ou senha inválidos',
    );
  });
});

describe('AuthService.refresh', () => {
  it('troca um refresh token válido por um par novo', async () => {
    const { jwt, service } = await montar();
    const refreshToken = await jwt.signAsync(
      { sub: 'u1', perfil: Perfil.COORDENACAO_SES },
      { secret: REFRESH },
    );

    const tokens = await service.refresh({ refreshToken });

    await expect(jwt.verifyAsync(tokens.accessToken, { secret: ACCESS })).resolves.toMatchObject({
      sub: 'u1',
    });
    await expect(jwt.verifyAsync(tokens.refreshToken, { secret: REFRESH })).resolves.toMatchObject({
      sub: 'u1',
    });
  });

  it('renova a instituição do usuário no token novo (escopo ABAC)', async () => {
    const { jwt, service } = await montar();
    const refreshToken = await jwt.signAsync(
      { sub: 'u1', perfil: Perfil.COORDENACAO_SES, instituicao: 'antiga' },
      { secret: REFRESH },
    );

    const tokens = await service.refresh({ refreshToken });

    await expect(jwt.verifyAsync(tokens.accessToken, { secret: ACCESS })).resolves.toMatchObject({
      instituicao: 'SES-MA',
    });
  });

  it('recusa um access token no lugar do refresh token', async () => {
    const { jwt, service } = await montar();
    const accessToken = await jwt.signAsync(
      { sub: 'u1', perfil: Perfil.COORDENACAO_SES },
      { secret: ACCESS },
    );

    await expect(service.refresh({ refreshToken: accessToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('recusa um token malformado', async () => {
    const { service } = await montar();

    await expect(service.refresh({ refreshToken: 'nao-e-um-jwt' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('recusa o refresh de um usuário que não existe mais', async () => {
    const { jwt, service } = await montar();
    const refreshToken = await jwt.signAsync(
      { sub: 'removido', perfil: Perfil.COORDENACAO_SES },
      { secret: REFRESH },
    );

    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
