import { describe, expect, it } from 'vitest';
import { ACCESS, homeFor } from './permissions.ts';

describe('permissions', () => {
  it('cada perfil começa na sua tela', () => {
    expect(homeFor('COORDENACAO_SES')).toBe('/gerenciamento/processos');
    expect(homeFor('REPRESENTANTE_UNDB')).toBe('/dashboard');
  });

  it('só a coordenação acessa processos, análise, assinatura e administração', () => {
    const { novoProcesso, meusProcessos, ...restritas } = ACCESS;
    for (const perfis of Object.values(restritas)) {
      expect(perfis).toEqual(['COORDENACAO_SES']);
    }
    // O representante cria o processo e corrige o que a SES devolve; a coordenação não.
    expect(novoProcesso).toEqual(['REPRESENTANTE_UNDB']);
    expect(meusProcessos).toEqual(['REPRESENTANTE_UNDB']);
  });
});
