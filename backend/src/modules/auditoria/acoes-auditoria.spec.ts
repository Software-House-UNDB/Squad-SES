import { describe, expect, it } from 'vitest';
import { ACOES_AUDITORIA, ehAcaoAuditoria } from './acoes-auditoria.js';

describe('lista canônica de auditoria.acao', () => {
  it('contém as ações definidas na issue #49 e as já usadas', () => {
    expect([...ACOES_AUDITORIA].sort()).toEqual(
      [
        'ANALISE',
        'ASSINATURA',
        'CREATE',
        'DELETE',
        'IMPORT_LOTE',
        'RETORNO_COORDENACAO',
        'TRANSICAO',
        'UPDATE',
      ].sort(),
    );
  });

  it('reconhece só valores da lista', () => {
    expect(ehAcaoAuditoria('ANALISE')).toBe(true);
    expect(ehAcaoAuditoria('RETORNO_COORDENACAO')).toBe(true);
    expect(ehAcaoAuditoria('ASSINATURA')).toBe(true);
    expect(ehAcaoAuditoria('analise')).toBe(false);
    expect(ehAcaoAuditoria('DROP')).toBe(false);
    expect(ehAcaoAuditoria(undefined)).toBe(false);
  });
});
