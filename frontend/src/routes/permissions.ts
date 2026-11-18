import type { Perfil } from '../types/auth.ts';

// Perfis com acesso a cada área do menu. Centralizado para as rotas e a navegação usarem a mesma fonte.
// TODO (Sprint 1, RF-02): `REPRESENTANTE_UNDB` autentica, mas por ora só acessa /dashboard. As rotas de
// submissão (criar lote, submeter pacote) entram na Sprint 1 e devem ser adicionadas aqui. A lacuna é
// esperada: este PR cobre apenas a infraestrutura de autenticação.
export const ACCESS = {
  // RF-06: quem cria o processo e monta o pacote é o representante da IES, não a coordenação.
  novoProcesso: ['REPRESENTANTE_UNDB'],
  // RF-20: painel da coordenação com a lista de processos recebidos da UNDB.
  listaProcessos: ['COORDENACAO_SES'],
  analiseOficios: ['COORDENACAO_SES'],
  assinaturaTermos: ['COORDENACAO_SES'],
  administracao: ['COORDENACAO_SES'],
} satisfies Record<string, Perfil[]>;

// Primeira tela de cada perfil após o login.
export function homeFor(perfil: Perfil): string {
  return perfil === 'COORDENACAO_SES' ? '/gerenciamento/processos' : '/dashboard';
}
