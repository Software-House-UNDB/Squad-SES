import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';

const AMBIENTES_PERMITIDOS = ['development', 'test'];

// TODO: substituir pelo guard JWT + RBAC. Identifica o usuário pelo header
// x-usuario-id, então só pode funcionar em ambiente local.
@Injectable()
export class AuthTemporarioGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (!AMBIENTES_PERMITIDOS.includes(process.env.NODE_ENV ?? '')) {
      throw new UnauthorizedException('Autenticação indisponível');
    }

    const requisicao = contexto.switchToHttp().getRequest();
    const id = requisicao.headers['x-usuario-id'];
    if (!isUUID(id)) {
      throw new UnauthorizedException('Usuário não identificado');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, perfil: true },
    });
    if (!usuario) {
      throw new UnauthorizedException('Usuário não identificado');
    }

    requisicao.usuario = usuario;
    return true;
  }
}
