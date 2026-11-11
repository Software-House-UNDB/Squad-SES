import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TokenPayload } from './auth.types.js';

// Protege as rotas: só passa quem envia "Authorization: Bearer <accessToken>" válido.
// Preenche requisicao.usuario, que o @UsuarioAtual() lê nos controllers.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest();
    const [tipo, token] = (requisicao.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    const payload = await this.jwt
      .verifyAsync<TokenPayload>(token, { secret: this.secret })
      .catch(() => {
        throw new UnauthorizedException('Token de acesso inválido ou expirado');
      });

    requisicao.usuario = { id: payload.sub, perfil: payload.perfil };
    return true;
  }
}
