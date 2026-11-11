import type { Perfil } from '../../generated/prisma/enums.js';

// O que vai dentro dos dois tokens. "sub" (subject) é o nome padrão do JWT para o id do usuário.
export type TokenPayload = {
  sub: string;
  perfil: Perfil;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
};
