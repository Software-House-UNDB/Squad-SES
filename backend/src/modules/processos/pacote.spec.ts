import { describe, expect, it } from 'vitest';
import { TipoDocumento } from '../../generated/prisma/enums.js';
import { pendenciasPacote, type DocumentoDoPacote } from './pacote.js';

const ANA = { id: 'e1', nome: 'Ana Souza', menorIdade: false };
const BIA = { id: 'e2', nome: 'Bia Lima', menorIdade: true };

const doProcesso: DocumentoDoPacote[] = [
  { tipo: TipoDocumento.plano_atividades, estagiarioId: null },
  { tipo: TipoDocumento.apolice, estagiarioId: null },
  { tipo: TipoDocumento.lista_indicados, estagiarioId: null },
];
const pessoal = (estagiarioId: string): DocumentoDoPacote => ({
  tipo: TipoDocumento.documento_pessoal,
  estagiarioId,
});
const declaracao = (estagiarioId: string): DocumentoDoPacote => ({
  tipo: TipoDocumento.declaracao,
  estagiarioId,
});

describe('pendenciasPacote (RF-08)', () => {
  it('pacote completo de maior e de menor de idade: sem pendências', () => {
    expect(
      pendenciasPacote(
        [ANA, BIA],
        [...doProcesso, pessoal('e1'), pessoal('e2'), pessoal('e2'), declaracao('e2')],
      ),
    ).toEqual([]);
  });

  it('processo vazio: lista tudo de uma vez', () => {
    expect(pendenciasPacote([], []).map((p) => p.campo)).toEqual([
      'estagiarios',
      'plano_atividades',
      'apolice',
      'lista_indicados',
    ]);
  });

  it.each([TipoDocumento.plano_atividades, TipoDocumento.apolice, TipoDocumento.lista_indicados])(
    'falta %s do processo',
    (tipo) => {
      const documentos = [...doProcesso.filter((d) => d.tipo !== tipo), pessoal('e1')];
      expect(pendenciasPacote([ANA], documentos)).toEqual([
        { campo: tipo, motivo: expect.stringContaining('não anexado') },
      ]);
    },
  );

  it('falta documento pessoal do estagiário', () => {
    expect(pendenciasPacote([ANA], doProcesso)).toEqual([
      {
        campo: 'documento_pessoal',
        motivo: 'Ana Souza: documentos pessoais não anexados',
        estagiarioId: 'e1',
      },
    ]);
  });

  it('documento de outro estagiário não conta', () => {
    expect(pendenciasPacote([ANA], [...doProcesso, pessoal('outro')])).toHaveLength(1);
  });

  it('menor de idade sem identidade nem declaração do responsável (RF-13)', () => {
    expect(pendenciasPacote([BIA], [...doProcesso, pessoal('e2')])).toEqual([
      {
        campo: 'identidade_responsavel',
        motivo: 'Bia Lima: identidade do responsável não anexada',
        estagiarioId: 'e2',
      },
      {
        campo: 'declaracao',
        motivo: 'Bia Lima: declaração do responsável não anexada',
        estagiarioId: 'e2',
      },
    ]);
  });

  it('menor de idade sem nenhum documento: três pendências', () => {
    expect(pendenciasPacote([BIA], doProcesso).map((p) => p.campo)).toEqual([
      'documento_pessoal',
      'identidade_responsavel',
      'declaracao',
    ]);
  });
});
