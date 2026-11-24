import { createHash, randomBytes, randomInt } from 'node:crypto';

// 32 bytes aleatórios em base64url: 43 caracteres.
export const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// O token só existe no link do e-mail; o banco guarda o SHA-256 dele.
// Um token de 256 bits não precisa de hash lento: não dá para adivinhar.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function gerarToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

// Código de 6 dígitos, com zeros à esquerda.
export const gerarOtp = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

// "ana.lima@exemplo.com" vira "a*******@exemplo.com": a página do link mostra
// para onde o código foi sem revelar o endereço a quem só tem o link.
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}@${dominio}`;
}
