import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TipoComentario } from '../../../generated/prisma/enums.js';
import { CriarComentarioDto } from './comentario.dto.js';

// Mesmas opções do main.ts: o que vale em produção é o que o teste exercita.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const validar = (corpo: unknown) =>
  pipe.transform(corpo, { type: 'body', metatype: CriarComentarioDto });

async function mensagens(corpo: unknown): Promise<string[]> {
  const erro = await validar(corpo).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(BadRequestException);
  const { message } = (erro as BadRequestException).getResponse() as { message: string[] };
  return message;
}

describe('CriarComentarioDto', () => {
  it('aceita tipo e texto e tira os espaços das pontas', async () => {
    const dto = await validar({ tipo: 'pendencia', texto: '  CPF ilegível no documento.  ' });

    expect(dto).toBeInstanceOf(CriarComentarioDto);
    expect(dto).toEqual({ tipo: TipoComentario.pendencia, texto: 'CPF ilegível no documento.' });
  });

  it.each(Object.values(TipoComentario))('aceita o tipo %s', async (tipo) => {
    await expect(validar({ tipo, texto: 'ok' })).resolves.toMatchObject({ tipo });
  });

  it('preserva quebras de linha no meio do texto', async () => {
    const dto = await validar({ tipo: 'observacao', texto: 'linha 1\nlinha 2' });

    expect(dto.texto).toBe('linha 1\nlinha 2');
  });

  it('aceita exatamente 1000 caracteres e recusa 1001', async () => {
    await expect(validar({ tipo: 'resposta', texto: 'a'.repeat(1000) })).resolves.toBeDefined();

    expect(await mensagens({ tipo: 'resposta', texto: 'a'.repeat(1001) })).toContain(
      'texto passa de 1000 caracteres',
    );
  });

  it('o limite conta caracteres, não unidades UTF-16: 1000 emojis passam e 1001 não', async () => {
    // Um emoji ocupa 2 unidades UTF-16 (length 2), mas é 1 caractere para o usuário
    // e para o CHECK do banco (char_length).
    await expect(validar({ tipo: 'resposta', texto: '😀'.repeat(1000) })).resolves.toBeDefined();

    expect(await mensagens({ tipo: 'resposta', texto: '😀'.repeat(1001) })).toContain(
      'texto passa de 1000 caracteres',
    );
  });

  it('conta como o char_length do banco: seletor de variação (U+FE0F) também é caractere', async () => {
    // O validator.js desconta U+FE0E/U+FE0F; o Postgres conta. Sem isso, o CHECK do banco
    // recusava o texto e a API respondia 500 em vez de 400.
    expect(await mensagens({ tipo: 'resposta', texto: 'a️'.repeat(600) })).toContain(
      'texto passa de 1000 caracteres',
    );
    await expect(validar({ tipo: 'resposta', texto: '❤️'.repeat(500) })).resolves.toBeDefined();
  });

  it('conta o tamanho depois de aparar: 1000 letras com espaços em volta passam', async () => {
    const texto = `   ${'a'.repeat(1000)}   `;

    await expect(validar({ tipo: 'resposta', texto })).resolves.toBeDefined();
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '     '],
    ['só tabs e quebras de linha', ' \t\r\n '],
    ['só espaço sem quebra (NBSP)', '  '],
    ['só caracteres invisíveis (zero-width)', '​​⁠﻿'],
  ])('recusa texto sem conteúdo: %s', async (_nome, texto) => {
    expect(await mensagens({ tipo: 'pendencia', texto })).toContain('texto sem conteúdo');
  });

  it('recusa byte nulo no texto: o Postgres não grava e daria 500', async () => {
    expect(await mensagens({ tipo: 'pendencia', texto: 'abc\u0000def' })).toContain(
      'texto com caractere inválido',
    );
  });

  it.each([
    ['número', 42],
    ['nulo', null],
    ['ausente', undefined],
    ['lista', ['a']],
    ['objeto', { $ne: '' }],
    ['booleano', true],
  ])('recusa texto que não é string: %s', async (_nome, texto) => {
    const erros = await mensagens({ tipo: 'pendencia', texto });

    expect(erros.some((m) => m.startsWith('texto'))).toBe(true);
  });

  it.each([
    ['inexistente', 'urgente'],
    ['em maiúsculas', 'PENDENCIA'],
    ['com acento', 'pendência'],
    ['ausente', undefined],
    ['nulo', null],
    ['número', 1],
  ])('recusa tipo %s', async (_nome, tipo) => {
    expect(await mensagens({ tipo, texto: 'ok' })).toContain('tipo inválido');
  });

  it.each([
    ['autorId', { autorId: '11111111-1111-4111-8111-111111111111' }],
    ['processoId', { processoId: '11111111-1111-4111-8111-111111111111' }],
    ['criadoEm', { criadoEm: '2020-01-01T00:00:00Z' }],
    ['id', { id: '11111111-1111-4111-8111-111111111111' }],
  ])('recusa o campo %s no corpo: quem manda é o servidor', async (campo, extra) => {
    const erros = await mensagens({ tipo: 'observacao', texto: 'ok', ...extra });

    expect(erros).toContain(`property ${campo} should not exist`);
  });
});
