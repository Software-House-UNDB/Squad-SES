import type { Perfil } from '../../generated/prisma/enums.js';

// O que vai dentro dos dois tokens. "sub" (subject) é o nome padrão do JWT para o id do usuário.
export type TokenPayload = {
  sub: string;
  perfil: Perfil;
  // Instituição do usuário (escopo ABAC). Opcional: tokens emitidos antes desta mudança não a trazem,
  // e aí o representante não enxerga nada até renovar o token (falha fechada).
  instituicao?: string | null;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
};
