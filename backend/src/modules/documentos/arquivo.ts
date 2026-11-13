import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

export const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024;
export const MIME_PDF = 'application/pdf';

const ASSINATURA_PDF = Buffer.from('%PDF-');
const TAMANHO_MAXIMO_NOME = 255;

export type ArquivoRecebido = { buffer: Buffer; originalname: string };

// Hash do conteúdo exato que vai para o storage. Serve de evidência de que
// o arquivo assinado ou baixado depois é o mesmo que foi enviado.
export function calcularSha256(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex');
}

// Confere o conteúdo, não a extensão nem o Content-Type do navegador.
export function garantirPdf(conteudo: Buffer) {
  if (conteudo.length === 0) {
    throw new BadRequestException({ erro: 'arquivo_invalido', motivo: 'arquivo vazio' });
  }
  if (!conteudo.subarray(0, ASSINATURA_PDF.length).equals(ASSINATURA_PDF)) {
    throw new BadRequestException({
      erro: 'arquivo_invalido',
      motivo: 'apenas arquivos PDF são aceitos',
    });
  }
}

// O multer entrega o nome em latin1; nomes com acento chegam corrompidos.
export function nomeOriginal(nome: string): string {
  const decodificado = basename(Buffer.from(nome, 'latin1').toString('utf8').replace(/\\/g, '/'));
  return decodificado.trim().slice(-TAMANHO_MAXIMO_NOME) || 'documento.pdf';
}
