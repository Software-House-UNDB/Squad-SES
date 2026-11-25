import type { EstagiarioParaTce } from '../../src/modules/tce/tce-dados.js';

// Dados fictícios do TCE para os testes.
export const CONFIG_TCE: Record<string, string> = {
  TCE_SECRETARIO_NOME: 'Fulano de Tal',
  TCE_IE_NOME: 'Centro Universitário UNDB',
  TCE_IE_CNPJ: '00.000.000/0001-00',
  TCE_IE_ENDERECO: 'Av. Colares Moreira, 443',
  TCE_IE_CIDADE: 'São Luís',
  TCE_IE_UF: 'MA',
  TCE_IE_CEP: '65075-441',
  TCE_IE_REPRESENTANTE_CARGO: 'Reitor',
  TCE_IE_REPRESENTANTE_NOME: 'Beltrano',
  TCE_IE_REPRESENTANTE_CPF: '000.000.000-00',
  TCE_IE_REPRESENTANTE_RG: '0000000',
};

export function estagiarioCompleto(extra: Partial<EstagiarioParaTce> = {}): EstagiarioParaTce {
  return {
    id: 'e1',
    nome: 'Ana Souza',
    cpf: '12345678901',
    matricula: '2026001',
    curso: 'Enfermagem',
    cidade: 'São Luís',
    uf: 'MA',
    cep: '65000000',
    dataInicio: new Date('2026-12-01T00:00:00Z'),
    dataTermino: new Date('2027-02-28T00:00:00Z'),
    horasPorDia: 6,
    diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex'],
    horarioInicio: '07:00',
    horarioFim: '13:00',
    menorIdade: false,
    responsavelNome: null,
    ...extra,
  };
}
