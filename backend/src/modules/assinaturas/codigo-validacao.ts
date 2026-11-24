import { randomInt } from 'node:crypto';

// Base32 de Crockford: sem I, L, O e U, para o código ser lido e digitado
// sem confusão (RF-17). 12 caracteres = 60 bits: inviável de adivinhar.
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TAMANHO = 12;
const FORMATO = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export function gerarCodigoValidacao(): string {
  return Array.from({ length: TAMANHO }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}

// "7K3M-9QX2-HV4T" para exibir; o banco guarda sem hífens.
export const formatarCodigo = (codigo: string) => codigo.match(/.{4}/g)!.join('-');

// Aceita o que a pessoa digitar: minúsculas, hífens, espaços e as letras que
// o Crockford trata como dígitos (O = 0; I e L = 1). Inválido vira null.
export function normalizarCodigo(entrada: string): string | null {
  const codigo = entrada
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return FORMATO.test(codigo) ? codigo : null;
}
