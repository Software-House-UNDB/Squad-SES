import { describe, expect, it } from 'vitest';
import { initialsFromEmail, navFor } from './navigation.ts';

const links = (perfil: Parameters<typeof navFor>[0]) =>
  navFor(perfil).flatMap((s) => s.items.map((i) => i.to));

describe('menu por perfil', () => {
  it('coordenação vê gerenciamento e administração', () => {
    expect(links('coordenacao_ses')).toEqual([
      '/dashboard',
      '/gerenciamento/analise-oficios',
      '/gerenciamento/assinatura-termos',
      '/administracao/usuarios',
      '/administracao/configuracoes',
    ]);
  });

  it('representante da IES vê início e novo processo, sem seções vazias', () => {
    expect(links('representante_ies')).toEqual(['/dashboard', '/gerenciamento/novo-processo']);
    expect(navFor('representante_ies')).toHaveLength(2);
  });
});

describe('initialsFromEmail', () => {
  it.each([
    ['debora.vieira@ses.ma.gov.br', 'DV'],
    ['felipe@undb.edu.br', 'FE'],
    ['a@x.com', 'A'],
  ])('%s -> %s', (email, expected) => {
    expect(initialsFromEmail(email)).toBe(expected);
  });
});
