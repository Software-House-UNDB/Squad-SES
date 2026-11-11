import { describe, expect, it } from 'vitest';
import { ACCESS, homeFor } from './permissions.ts';

describe('permissions', () => {
  it('cada perfil começa na sua tela', () => {
    expect(homeFor('coordenacao_ses')).toBe('/gerenciamento/analise-oficios');
    expect(homeFor('representante_ies')).toBe('/dashboard');
  });

  it('só a coordenação acessa análise, assinatura e administração', () => {
    const { novoProcesso, ...restritas } = ACCESS;
    for (const perfis of Object.values(restritas)) {
      expect(perfis).toEqual(['coordenacao_ses']);
    }
    expect(novoProcesso).toEqual(['representante_ies']);
  });
});
