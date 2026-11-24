import { describe, expect, it } from 'vitest';
import {
  ESTAGIARIO_VAZIO,
  PROCESSO_VAZIO,
  cpfValido,
  formatarCep,
  formatarCpf,
  validarEstagiario,
  validarProcesso,
} from './validacao.ts';
import {
  DOCS_DO_PROCESSO,
  docsDoEstagiario,
  exigidos,
  pendenciasDoPacote,
  validarArquivo,
} from './pacote.ts';

const valido = {
  ...ESTAGIARIO_VAZIO,
  nome: 'Ana Souza',
  cpf: '529.982.247-25',
  matricula: '2024001',
  curso: 'Enfermagem',
  email: 'ana@aluno.undb.edu.br',
  periodo: '5',
  dataInicio: '2026-12-01',
  dataTermino: '2027-06-30',
  horasPorDia: '6',
  diasSemana: ['seg', 'qua'],
  horarioInicio: '08:00',
  horarioFim: '14:00',
  cidade: 'São Luís',
  uf: 'MA',
  cep: '65000-000',
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

  it('aceita o estagiário com todos os dados do TCE', () => {
    expect(validarEstagiario(valido)).toEqual({});
  });

  it('exige todos os campos, inclusive os dados do TCE', () => {
    expect(Object.keys(validarEstagiario(ESTAGIARIO_VAZIO)).sort()).toEqual([
      'cep',
      'cidade',
      'cpf',
      'curso',
      'dataInicio',
      'dataTermino',
      'diasSemana',
      'email',
      'horarioFim',
      'horarioInicio',
      'horasPorDia',
      'matricula',
      'nome',
      'periodo',
      'uf',
    ]);
  });

  it('valida o e-mail e barra e-mail repetido, ignorando maiúsculas', () => {
    expect(validarEstagiario({ ...valido, email: 'sem-arroba' }).email).toMatch(/inválido/);
    const outro = { ...valido, cpf: '111.444.777-35', matricula: '2' };
    expect(validarEstagiario({ ...outro, email: 'ANA@aluno.undb.edu.br' }, [valido]).email).toMatch(
      /já está/,
    );
  });

  it('o término não pode ser antes do início', () => {
    expect(validarEstagiario({ ...valido, dataTermino: '2026-11-30' }).dataTermino).toMatch(
      /antes do início/,
    );
    expect(validarEstagiario({ ...valido, dataTermino: '2026-12-01' })).toEqual({});
  });

  it('o horário de fim deve ser depois do início', () => {
    expect(validarEstagiario({ ...valido, horarioFim: '08:00' }).horarioFim).toMatch(/depois/);
  });

  it.each([
    ['horasPorDia', '0'],
    ['horasPorDia', '25'],
    ['horasPorDia', '2.5'],
    ['periodo', '0'],
    ['uf', 'XX'],
    ['cep', '65000-00'],
  ] as const)('recusa %s = %s', (campo, valor) => {
    expect(validarEstagiario({ ...valido, [campo]: valor })[campo]).toBeDefined();
  });

  it('formata o CEP progressivamente', () => {
    expect(formatarCep('65000000')).toBe('65000-000');
    expect(formatarCep('6500')).toBe('6500');
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
    const faltando = pendenciasDoPacote(
      [maior],
      new Set(['plano_atividades', 'apolice', 'lista_indicados']),
    );
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
    // Limite: exatamente 20 MB passa; um byte a mais não. Arquivo vazio nunca é um PDF.
    expect(validarArquivo({ type: 'application/pdf', size: 20 * 1024 * 1024 })).toBeNull();
    expect(validarArquivo({ type: 'application/pdf', size: 20 * 1024 * 1024 + 1 })).toMatch(
      /20 MB/,
    );
    expect(validarArquivo({ type: 'application/pdf', size: 0 })).toMatch(/vazio/);
    expect(validarArquivo({ type: 'application/pdf', size: 1 })).toBeNull();
  });
});

describe('tipos enviados à API (RF-09)', () => {
  it('traduz os slots para os tipos do backend', () => {
    expect(DOCS_DO_PROCESSO.map((d) => d.tipo)).toEqual([
      'plano_atividades',
      'apolice',
      'lista_indicados',
    ]);
    expect(docsDoEstagiario('1', false).map((d) => d.tipo)).toEqual(['documento_pessoal']);
    // identidade do responsável entra como documento pessoal; a declaração tem tipo próprio
    expect(docsDoEstagiario('1', true).map((d) => d.tipo)).toEqual([
      'documento_pessoal',
      'documento_pessoal',
      'declaracao',
    ]);
  });
});

describe('dados do processo', () => {
  it('exige tipo de estágio, nome e e-mail do supervisor', () => {
    expect(Object.keys(validarProcesso(PROCESSO_VAZIO)).sort()).toEqual([
      'supervisorEmail',
      'supervisorNome',
      'tipoEstagio',
    ]);
  });

  it('aceita os dados completos e recusa e-mail do supervisor inválido', () => {
    const ok = {
      tipoEstagio: 'obrigatorio',
      supervisorNome: 'Maria',
      supervisorEmail: 'maria@saude.ma.gov.br',
    } as const;
    expect(validarProcesso(ok)).toEqual({});
    expect(validarProcesso({ ...ok, supervisorEmail: 'maria@' }).supervisorEmail).toBeDefined();
  });
});
