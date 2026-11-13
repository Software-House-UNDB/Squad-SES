import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const ACCESS = 'segredo-access-teste';
const jwt = new JwtService();
const guard = new JwtAuthGuard(jwt, new ConfigService({ JWT_ACCESS_SECRET: ACCESS }));

// Requisição falsa, só com o cabeçalho Authorization.
function contexto(authorization?: string) {
  const requisicao: { headers: Record<string, string>; usuario?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => requisicao }),
  } as unknown as ExecutionContext;
  return { requisicao, ctx };
}

const PAYLOAD = { sub: 'u1', perfil: Perfil.REPRESENTANTE_UNDB };

describe('JwtAuthGuard', () => {
  it('libera token válido e preenche requisicao.usuario', async () => {
    const token = await jwt.signAsync(PAYLOAD, { secret: ACCESS });
    const { requisicao, ctx } = contexto(`Bearer ${token}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(requisicao.usuario).toEqual({ id: 'u1', perfil: Perfil.REPRESENTANTE_UNDB });
  });

  it.each([undefined, 'Basic abc', 'Bearer'])('recusa cabeçalho %j', async (cabecalho) => {
    await expect(guard.canActivate(contexto(cabecalho).ctx)).rejects.toThrow(
      'Token de acesso ausente',
    );
  });

  it('recusa token assinado com outro segredo (ex.: refresh token)', async () => {
    const token = await jwt.signAsync(PAYLOAD, { secret: 'outro-segredo' });

    await expect(guard.canActivate(contexto(`Bearer ${token}`).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('recusa token vencido', async () => {
    const vencido = Math.floor(Date.now() / 1000) - 60;
    const token = await jwt.signAsync({ ...PAYLOAD, exp: vencido }, { secret: ACCESS });

    await expect(guard.canActivate(contexto(`Bearer ${token}`).ctx)).rejects.toThrow(
      'Token de acesso inválido ou expirado',
    );
  });
});
