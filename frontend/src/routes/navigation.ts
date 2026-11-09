import { FileText, House, Pen, Settings, User, type LucideIcon } from 'lucide-react';
import type { Perfil } from '../types/auth.ts';
import { ACCESS } from './permissions.ts';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Perfis que veem o item. Omitido = todo usuário autenticado.
  perfis?: Perfil[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

// Fonte única do menu lateral. Os perfis vêm de ACCESS para o menu nunca mostrar um link
// que a rota bloqueia (nem esconder um que ela permite).
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: '/dashboard', label: 'Início', icon: House }],
  },
  {
    label: 'Gerenciamento',
    items: [
      {
        to: '/gerenciamento/analise-oficios',
        label: 'Análise de Ofícios',
        icon: FileText,
        perfis: ACCESS.analiseOficios,
      },
      {
        to: '/gerenciamento/assinatura-termos',
        label: 'Assinatura de Termos',
        icon: Pen,
        perfis: ACCESS.assinaturaTermos,
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/administracao/usuarios', label: 'Usuários', icon: User, perfis: ACCESS.administracao },
      {
        to: '/administracao/configuracoes',
        label: 'Configurações',
        icon: Settings,
        perfis: ACCESS.administracao,
      },
    ],
  },
];

export const PERFIL_LABEL: Record<Perfil, string> = {
  coordenacao_ses: 'Coordenação SES',
  representante_ies: 'Representante da IES',
};

/** Menu do perfil: remove itens sem permissão e seções que ficaram vazias. */
export function navFor(perfil: Perfil): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.perfis || item.perfis.includes(perfil)),
  })).filter((section) => section.items.length > 0);
}

/** Iniciais para o avatar, a partir do e-mail (o usuário ainda não tem nome no cadastro). */
export function initialsFromEmail(email: string): string {
  const parts = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
