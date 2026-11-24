import { formatarCodigo, gerarCodigoValidacao, normalizarCodigo } from './codigo-validacao.js';

describe('código de validação', () => {
  it('gera 12 caracteres de base32 de Crockford, sem I, L, O e U', () => {
    const codigos = Array.from({ length: 200 }, gerarCodigoValidacao);

    for (const codigo of codigos) expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(new Set(codigos).size).toBe(200);
  });

  it('formata em blocos de 4', () => {
    expect(formatarCodigo('7K3M9QX2HV4T')).toBe('7K3M-9QX2-HV4T');
  });

  it.each([
    ['7K3M-9QX2-HV4T', '7K3M9QX2HV4T'],
    [' 7k3m 9qx2 hv4t ', '7K3M9QX2HV4T'],
    // O vira 0; I e L viram 1 (quem digita confunde as letras com os dígitos).
    ['7K3M-9QX2-HVOT', '7K3M9QX2HV0T'],
    ['7K3M-9QX2-HVIL', '7K3M9QX2HV11'],
  ])('normaliza %j', (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });

  it.each(['', '7K3M-9QX2', '7K3M-9QX2-HV4T-0', '7K3M-9QX2-HV4U', '../../etc/passwd'])(
    'recusa %j',
    (entrada) => {
      expect(normalizarCodigo(entrada)).toBeNull();
    },
  );
});
