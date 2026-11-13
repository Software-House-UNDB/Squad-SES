import { describe, expect, it } from 'vitest';
import { ESTAGIARIO_VAZIO, cpfValido, formatarCpf, validarEstagiario } from './validacao.ts';
import { DOCS_DO_PROCESSO, docsDoEstagiario, exigidos, pendenciasDoPacote, validarArquivo } from './pacote.ts';

const valido = {
  ...ESTAGIARIO_VAZIO,
  nome: 'Ana Souza',
  cpf: '529.982.247-25',
  matricula: '2024001',
  curso: 'Enfermagem',
};

describe('estagiário do lote (RF-06)', () => {
  it('formata o CPF progressivamente', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('5299')).toBe('529.9');
  });

  it('valida os dígitos verificadores do CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });

  it('aceita nome, CPF, matrícula e curso', () => {
    expect(validarEstagiario(valido)).toEqual({});
  });

  it('exige os quatro campos', () => {
    expect(Object.keys(validarEstagiario(ESTAGIARIO_VAZIO)).sort()).toEqual([
      'cpf',
      'curso',
      'matricula',
      'nome',
    ]);
  });

  it('barra CPF e matrícula repetidos no mesmo processo', () => {
    const erros = validarEstagiario(valido, [valido]);
    expect(erros.cpf).toMatch(/já está/);
    expect(erros.matricula).toMatch(/já está/);
  });

  it('menor de idade exige o nome do responsável (RF-13)', () => {
    expect(validarEstagiario({ ...valido, menor: true }).responsavel).toBeDefined();
    expect(validarEstagiario({ ...valido, menor: true, responsavel: 'Maria Souza' })).toEqual({});
  });
});

describe('pacote de documentos (RF-08, RF-09, RF-10, RF-13)', () => {
  const maior = { nome: 'Ana', cpf: '1', menor: false };
  const menor = { nome: 'Bia', cpf: '2', menor: true };

  it('nunca pede o TCE: ele é gerado pelo sistema', () => {
    const descricoes = exigidos([maior]).map((d) => d.descricao.toLowerCase());
    expect(descricoes.some((d) => d.includes('tce') || d.includes('termo de compromisso'))).toBe(
      false,
    );
  });

  it('pede plano, apólice, lista e os documentos pessoais de cada estagiário', () => {
    expect(exigidos([maior, menor]).map((d) => d.chave)).toEqual([
      'plano_atividades',
      'apolice',
      'lista_indicados',
      '1|documento_pessoal',
      '2|documento_pessoal',
      '2|identidade_responsavel',
      '2|declaracao_responsavel',
    ]);
  });

  it('só o menor de idade leva identidade e declaração do responsável', () => {
    expect(docsDoEstagiario('1', false)).toHaveLength(1);
    expect(docsDoEstagiario('2', true)).toHaveLength(3);
  });

  it('pacote incompleto não avança e diz o que falta', () => {
    expect(pendenciasDoPacote([], new Set())[0]).toMatch(/ao menos um estagiário/);
    const faltando = pendenciasDoPacote([maior], new Set(['plano_atividades', 'apolice', 'lista_indicados']));
    expect(faltando).toEqual(['Ana: documentos pessoais']);
  });

  it('pacote completo não tem pendências', () => {
    const tudo = new Set(exigidos([maior]).map((d) => d.chave));
    expect(pendenciasDoPacote([maior], tudo)).toEqual([]);
  });

  it('aceita só PDF, até 20 MB', () => {
    expect(validarArquivo({ type: 'application/pdf', size: 1024 })).toBeNull();
    expect(validarArquivo({ type: 'image/png', size: 1024 })).toMatch(/Formato/);
    expect(validarArquivo({ type: 'image/jpeg', size: 1024 })).toMatch(/Formato/);
    expect(validarArquivo({ type: 'text/plain', size: 10 })).toMatch(/Formato/);
    expect(validarArquivo({ type: 'application/pdf', size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });
});

describe('tipos enviados à API (RF-09)', () => {
  it('traduz os slots para os tipos do backend', () => {
    expect(DOCS_DO_PROCESSO.map((d) => d.tipo)).toEqual(['plano_atividades', 'apolice', 'lista_indicados']);
    expect(docsDoEstagiario('1', false).map((d) => d.tipo)).toEqual(['documento_pessoal']);
    // identidade do responsável entra como documento pessoal; a declaração tem tipo próprio
    expect(docsDoEstagiario('1', true).map((d) => d.tipo)).toEqual([
      'documento_pessoal',
      'documento_pessoal',
      'declaracao',
    ]);
  });
});
