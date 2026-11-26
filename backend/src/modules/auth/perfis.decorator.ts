import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import type { Perfil } from '../../generated/prisma/enums.js';

export const PERFIS_CHAVE = 'perfis';

// RBAC (#53): restringe a rota aos perfis informados. Quem tem outro perfil
// recebe 403 `perfil_nao_autorizado` antes de qualquer consulta ao banco, então
// não descobre se o recurso existe. Precisa do PerfisGuard depois do
// JwtAuthGuard: @UseGuards(JwtAuthGuard, PerfisGuard).
// Rota sem @Perfis vale para todos os perfis autenticados; o escopo
// institucional (ABAC, #54) continua nos services.
export function Perfis(...perfis: [Perfil, ...Perfil[]]) {
  return applyDecorators(
    SetMetadata(PERFIS_CHAVE, perfis),
    ApiForbiddenResponse({
      description: `Só ${perfis.join(' ou ')}. Outro perfil recebe 403 (erro: perfil_nao_autorizado).`,
    }),
  );
}
