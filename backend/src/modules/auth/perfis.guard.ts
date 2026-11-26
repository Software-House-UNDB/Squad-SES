import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Perfil } from '../../generated/prisma/enums.js';
import { PERFIS_CHAVE } from './perfis.decorator.js';
import type { UsuarioAutenticado } from './usuario-atual.decorator.js';

// Mesmo corpo padrão do Nest, com o `erro` estável que a tela usa para decidir.
export function perfilNaoAutorizado() {
  return new ForbiddenException({
    statusCode: HttpStatus.FORBIDDEN,
    error: 'Forbidden',
    message: 'Seu perfil não pode executar esta ação',
    erro: 'perfil_nao_autorizado',
  });
}

// RBAC (#53): confere o perfil do usuário contra o @Perfis() da rota (ou do
// controller). Roda depois do JwtAuthGuard, que preenche requisicao.usuario.
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<Perfil[] | undefined>(PERFIS_CHAVE, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!permitidos || permitidos.length === 0) return true;

    const usuario = contexto.switchToHttp().getRequest().usuario as UsuarioAutenticado | undefined;
    // Sem usuário (guard fora de ordem ou rota sem JwtAuthGuard): nega. Falha
    // fechada, para um erro de configuração não abrir a rota.
    if (!usuario || !permitidos.includes(usuario.perfil)) throw perfilNaoAutorizado();
    return true;
  }
}
