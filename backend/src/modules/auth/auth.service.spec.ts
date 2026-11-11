import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { Perfil } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TokenPayload } from './auth.types.js';
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
  return { usuario, jwt, service: new AuthService(prisma, jwt, config) };
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
    expect(payload).toMatchObject({ sub: 'u1', perfil: Perfil.COORDENACAO_SES });
  });

  it('recusa senha errada', async () => {
    const { usuario, service } = await montar();

    await expect(service.login({ email: usuario.email, senha: 'errada' })).rejects.toBeInstanceOf(
      UnauthorizedException,
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
