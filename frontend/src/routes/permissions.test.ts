import { describe, expect, it } from 'vitest';
import { ACCESS, homeFor } from './permissions.ts';

describe('permissions', () => {
  it('cada perfil começa na sua tela', () => {
    expect(homeFor('coordenacao_ses')).toBe('/gerenciamento/analise-oficios');
    expect(homeFor('representante_ies')).toBe('/dashboard');
  });

  it('só a coordenação acessa as áreas de gerenciamento e administração', () => {
    for (const perfis of Object.values(ACCESS)) {
      expect(perfis).toEqual(['coordenacao_ses']);
    }
  });
});
