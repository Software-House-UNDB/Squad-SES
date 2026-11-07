import type { Perfil } from '../types/auth.ts';

// Perfis com acesso a cada área do menu. Centralizado para as rotas e a navegação usarem a mesma fonte.
export const ACCESS = {
  analiseOficios: ['coordenacao_ses'],
  assinaturaTermos: ['coordenacao_ses'],
  administracao: ['coordenacao_ses'],
} satisfies Record<string, Perfil[]>;

// Primeira tela de cada perfil após o login.
export function homeFor(perfil: Perfil): string {
  return perfil === 'coordenacao_ses' ? '/gerenciamento/analise-oficios' : '/dashboard';
}
