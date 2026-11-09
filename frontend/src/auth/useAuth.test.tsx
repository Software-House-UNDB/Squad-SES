import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth.ts';

// Unitário (caixa branca): o hook protege contra uso fora do AuthProvider.
describe('useAuth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falha com mensagem clara quando usado fora do <AuthProvider>', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth deve ser usado dentro de <AuthProvider>.',
    );
  });
});
