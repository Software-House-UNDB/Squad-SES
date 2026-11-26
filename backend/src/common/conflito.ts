import { ConflictException, HttpStatus } from '@nestjs/common';

// Códigos estáveis dos 409 de processos e documentos. A tela decide pelo
// `erro`; o `message` continua com o mesmo texto para quem ainda o lê.
export type ErroConflito =
  'status_invalido' | 'transicao_invalida' | 'arquivo_repetido' | 'documento_em_assinatura';

// Mesmo corpo padrão do Nest (statusCode, error, message), com o `erro` a mais.
export function conflito(erro: ErroConflito, message: string) {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message,
    erro,
  });
}
