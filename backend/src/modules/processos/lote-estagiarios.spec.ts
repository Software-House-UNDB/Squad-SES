import { BadRequestException } from '@nestjs/common';
import { duplicadosNoProcesso, lerLote } from './lote-estagiarios.js';

const CABECALHO = 'nome,cpf,matricula,curso,cidade,uf,cep';
const ANA = 'Ana,529.982.247-25,M1,Enfermagem,São Luís,ma,65000-000';
const BIA = 'Bia,11144477735,M2,Medicina,São Luís,MA,65000000';

const csv = (...linhas: string[]) => Buffer.from(linhas.join('\n'));

async function erroDe(conteudo: Buffer) {
  const erro = await lerLote(conteudo).catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(BadRequestException);
  return (erro as BadRequestException).getResponse();
}

describe('lerLote', () => {
  it('normaliza as linhas válidas', async () => {
    const { total, validos, invalidos } = await lerLote(csv(CABECALHO, ANA, BIA));

    expect(total).toBe(2);
    expect(invalidos).toEqual([]);
    expect(validos[0]).toMatchObject({
      linha: 2,
      dto: { cpf: '52998224725', uf: 'MA', cep: '65000000' },
    });
  });

  it('aceita o CSV do Excel em português', async () => {
    const conteudo = Buffer.from(
      '﻿nome;cpf;matricula;curso;cidade;uf;cep;data_inicio;dias_semana\r\n' +
        'Ana;52998224725;M1;"Enfermagem; noturno";São Luís;MA;65000000;01/03/2026;seg|QUA\r\n',
    );

    const { validos, invalidos } = await lerLote(conteudo);

    expect(invalidos).toEqual([]);
    expect(validos[0].dto).toMatchObject({
      curso: 'Enfermagem; noturno',
      dataInicio: '2026-03-01',
      diasSemana: ['seg', 'qua'],
    });
  });

  it('informa linha, campo e motivo de cada erro', async () => {
    const { invalidos } = await lerLote(
      csv(
        `${CABECALHO},data_inicio,data_termino`,
        `${ANA},2026-06-01,2026-07-01`,
        'Bia,12345678900,M2,Medicina,São Luís,MA,65000000,2026-08-01,2026-07-01',
      ),
    );

    expect(invalidos).toEqual(
      expect.arrayContaining([
        { linha: 3, campo: 'cpf', motivo: 'CPF inválido' },
        {
          linha: 3,
          campo: 'data_inicio',
          motivo: 'data_inicio posterior a data_termino',
        },
      ]),
    );
    expect(invalidos).toHaveLength(2);
  });

  it('numera a linha física mesmo com quebra dentro de aspas', async () => {
    const { invalidos } = await lerLote(
      csv(
        CABECALHO,
        'Ana,52998224725,M1,"Enfermagem\nnoturno",São Luís,MA,65000000',
        'Bia,00000000000,M2,Medicina,São Luís,MA,65000000',
      ),
    );

    expect(invalidos).toEqual([{ linha: 4, campo: 'cpf', motivo: 'CPF inválido' }]);
  });

  it('aponta CPF e matrícula repetidos no arquivo', async () => {
    const { invalidos } = await lerLote(csv(CABECALHO, ANA, ANA));

    expect(invalidos).toEqual([
      { linha: 3, campo: 'cpf', motivo: 'CPF repetido no arquivo' },
      { linha: 3, campo: 'matricula', motivo: 'matrícula repetida no arquivo' },
    ]);
  });

  it('aponta linha com número errado de colunas', async () => {
    const { invalidos } = await lerLote(csv(CABECALHO, 'Ana,52998224725'));

    expect(invalidos).toEqual([
      { linha: 2, campo: 'linha', motivo: 'esperadas 7 colunas, encontradas 2' },
    ]);
  });

  it.each([
    ['vazio', Buffer.from(''), 'arquivo vazio'],
    ['sem dados', csv(CABECALHO), 'arquivo sem estagiários'],
    ['coluna a mais', csv('nome,idade'), 'coluna desconhecida: idade'],
    ['fora de UTF-8', Buffer.from([0x6e, 0xe3, 0x6f]), 'o arquivo precisa estar em UTF-8'],
    [
      'coluna faltando',
      csv('nome,cpf'),
      'colunas obrigatórias ausentes: matricula, curso, cidade, uf, cep',
    ],
  ])('rejeita arquivo %s', async (_caso, conteudo, motivo) => {
    expect(await erroDe(conteudo)).toEqual({ erro: 'csv_invalido', motivo });
  });
});

describe('duplicadosNoProcesso', () => {
  it('aponta o que já está cadastrado no processo', async () => {
    const { validos } = await lerLote(csv(CABECALHO, ANA, BIA));

    const invalidos = duplicadosNoProcesso(validos, [{ cpf: '52998224725', matricula: 'OUTRA' }]);

    expect(invalidos).toEqual([
      { linha: 2, campo: 'cpf', motivo: 'CPF já cadastrado no processo' },
    ]);
  });
});
