import { BadRequestException } from '@nestjs/common';
import { calcularSha256, garantirPdf, nomeOriginal } from './arquivo.js';

describe('calcularSha256', () => {
  it('gera o hash hexadecimal de 64 caracteres', () => {
    // Valor de referência: `printf abc | sha256sum`
    expect(calcularSha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('garantirPdf', () => {
  it('aceita conteúdo que começa com %PDF-', () => {
    expect(() => garantirPdf(Buffer.from('%PDF-1.7\n...'))).not.toThrow();
  });

  it.each([
    ['vazio', Buffer.alloc(0), 'arquivo vazio'],
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'apenas arquivos PDF são aceitos'],
    ['texto', Buffer.from('não sou PDF'), 'apenas arquivos PDF são aceitos'],
  ])('rejeita %s', (_caso, conteudo, motivo) => {
    const erro = (() => {
      try {
        garantirPdf(conteudo);
      } catch (e) {
        return e;
      }
    })();

    expect(erro).toBeInstanceOf(BadRequestException);
    expect((erro as BadRequestException).getResponse()).toEqual({
      erro: 'arquivo_invalido',
      motivo,
    });
  });
});

describe('nomeOriginal', () => {
  const comoMulter = (nome: string) => Buffer.from(nome, 'utf8').toString('latin1');

  it('recupera acentos que o multer entrega em latin1', () => {
    expect(nomeOriginal(comoMulter('Ofício São Luís.pdf'))).toBe('Ofício São Luís.pdf');
  });

  it('descarta caminho enviado pelo navegador', () => {
    expect(nomeOriginal('C:\\Users\\ana\\termo.pdf')).toBe('termo.pdf');
    expect(nomeOriginal('../../etc/termo.pdf')).toBe('termo.pdf');
  });

  it('usa um nome padrão quando vem vazio', () => {
    expect(nomeOriginal('   ')).toBe('documento.pdf');
  });

  it('limita a 255 caracteres preservando a extensão', () => {
    const nome = nomeOriginal(`${'a'.repeat(300)}.pdf`);

    expect(nome).toHaveLength(255);
    expect(nome.endsWith('.pdf')).toBe(true);
  });
});
