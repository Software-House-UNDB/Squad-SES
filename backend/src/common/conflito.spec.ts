import { ConflictException } from '@nestjs/common';
import { conflito } from './conflito.js';

describe('conflito', () => {
  it('mantém o corpo padrão do Nest e acrescenta o código estável', () => {
    const excecao = conflito('arquivo_repetido', 'Documento já enviado neste processo');

    expect(excecao).toBeInstanceOf(ConflictException);
    expect(excecao.getStatus()).toBe(409);
    expect(excecao.getResponse()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Documento já enviado neste processo',
      erro: 'arquivo_repetido',
    });
  });
});
