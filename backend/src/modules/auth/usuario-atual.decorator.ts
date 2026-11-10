import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Perfil } from '../../generated/prisma/enums.js';

export type UsuarioAutenticado = {
  id: string;
  perfil: Perfil;
  ip?: string;
};

export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const requisicao = contexto.switchToHttp().getRequest();
    return { ...requisicao.usuario, ip: requisicao.ip };
  },
);
