import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Perfil } from '../../generated/prisma/enums.js';

export type UsuarioAutenticado = {
  id: string;
  perfil: Perfil;
  // Escopo institucional (ABAC). Ausente ou nulo significa sem instituição: o representante não vê processos.
  instituicao?: string | null;
  ip?: string;
};

export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const requisicao = contexto.switchToHttp().getRequest();
    return { ...requisicao.usuario, ip: requisicao.ip };
  },
);
