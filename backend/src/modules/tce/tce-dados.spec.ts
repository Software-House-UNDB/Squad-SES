import { HttpException } from '@nestjs/common';
import { TipoEstagio } from '../../generated/prisma/enums.js';
import {
  type ConfiguracaoTce,
  formatarCep,
  formatarCpf,
  formatarData,
  garantirDadosTce,
  lerConfiguracaoTce,
  montarDadosTce,
  nomeArquivoTce,
  pendenciasTce,
  VARIAVEIS_TCE,
} from './tce-dados.js';
import { CONFIG_TCE, estagiarioCompleto } from '../../../test/fixtures/tce.js';

const lerDe = (fonte: Record<string, string | undefined>) => (nome: string) => fonte[nome];

describe('lerConfiguracaoTce', () => {
  it('lê todas as variáveis, sem espaços nas pontas', () => {
    const config = lerConfiguracaoTce(lerDe({ ...CONFIG_TCE, TCE_IE_UF: ' MA ' }));

    expect(config.ieUf).toBe('MA');
    expect(Object.keys(config)).toHaveLength(Object.keys(VARIAVEIS_TCE).length);
  });

  it('responde 503 listando as variáveis que faltam', () => {
    const erro = (() => {
      try {
        lerConfiguracaoTce(
          lerDe({ ...CONFIG_TCE, TCE_IE_CNPJ: undefined, TCE_SECRETARIO_NOME: '  ' }),
        );
      } catch (e) {
        return e as HttpException;
      }
    })();

    expect(erro?.getStatus()).toBe(503);
    expect(erro?.message).toContain('TCE_SECRETARIO_NOME, TCE_IE_CNPJ');
  });
});

describe('pendenciasTce', () => {
  it('processo completo não tem pendências', () => {
    expect(
      pendenciasTce({ tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [estagiarioCompleto()] }),
    ).toEqual([]);
  });

  it('lista tipo de estágio, campos do estagiário e dias da semana', () => {
    const pendencias = pendenciasTce({
      tipoEstagio: null,
      estagiarios: [estagiarioCompleto({ id: 'e2', cep: null, horasPorDia: null, diasSemana: [] })],
    });

    expect(pendencias).toEqual([
      { campo: 'tipoEstagio', motivo: 'tipo de estágio não informado' },
      { campo: 'cep', motivo: 'CEP não informado', estagiarioId: 'e2' },
      { campo: 'horasPorDia', motivo: 'horas por dia não informadas', estagiarioId: 'e2' },
      { campo: 'diasSemana', motivo: 'dias da semana não informados', estagiarioId: 'e2' },
    ]);
  });

  it('estagiário acima do teto legal da jornada é pendência (#79)', () => {
    const pendencias = pendenciasTce({
      tipoEstagio: TipoEstagio.obrigatorio,
      estagiarios: [
        estagiarioCompleto(),
        estagiarioCompleto({
          id: 'e2',
          horasPorDia: 8,
          horarioInicio: '08:00',
          horarioFim: '18:00',
          diasSemana: ['seg', 'ter', 'qua', 'qui'],
        }),
      ],
    });

    expect(pendencias).toEqual([
      {
        campo: 'horasPorDia',
        motivo: 'jornada acima do limite legal de 6 horas diárias',
        estagiarioId: 'e2',
      },
      {
        campo: 'horasPorDia',
        motivo: 'jornada acima do limite legal de 30 horas semanais (32 h)',
        estagiarioId: 'e2',
      },
    ]);
  });

  it('menor de idade sem o nome do responsável é pendência (#80)', () => {
    const pendencias = pendenciasTce({
      tipoEstagio: TipoEstagio.obrigatorio,
      estagiarios: [
        estagiarioCompleto({ id: 'e2', menorIdade: true, responsavelNome: 'Maria Souza' }),
        estagiarioCompleto({ id: 'e3', menorIdade: true, responsavelNome: '  ' }),
        estagiarioCompleto({ id: 'e4', menorIdade: true, responsavelNome: null }),
      ],
    });

    expect(pendencias).toEqual(
      ['e3', 'e4'].map((estagiarioId) => ({
        campo: 'responsavelNome',
        motivo: 'nome do responsável não informado (menor de idade)',
        estagiarioId,
      })),
    );
  });

  it('processo sem estagiários é pendência', () => {
    expect(pendenciasTce({ tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [] })).toEqual([
      { campo: 'estagiarios', motivo: 'processo sem estagiários' },
    ]);
  });

  it('garantirDadosTce responde 400 tce_incompleto', () => {
    const erro = (() => {
      try {
        garantirDadosTce({ tipoEstagio: null, estagiarios: [estagiarioCompleto()] });
      } catch (e) {
        return e as HttpException;
      }
    })();

    expect(erro?.getStatus()).toBe(400);
    expect(erro?.getResponse()).toEqual({
      erro: 'tce_incompleto',
      pendencias: [{ campo: 'tipoEstagio', motivo: 'tipo de estágio não informado' }],
    });
  });
});

describe('montarDadosTce', () => {
  const config = lerConfiguracaoTce(lerDe(CONFIG_TCE)) as ConfiguracaoTce;

  it('preenche os campos do template com formatação brasileira', () => {
    const dados = montarDadosTce(
      { tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [] },
      estagiarioCompleto(),
      config,
      // 01:30 UTC do dia 25 ainda é dia 24 em São Luís (UTC-3).
      new Date('2026-11-25T01:30:00Z'),
    );

    expect(dados).toMatchObject({
      secretario_nome: 'Fulano de Tal',
      ie_nome: 'Centro Universitário UNDB',
      ie_representante_cpf: '000.000.000-00',
      nome: 'Ana Souza',
      cpf: '123.456.789-01',
      cep: '65000-000',
      is_obrigatorio: true,
      is_pos_graduacao: false,
      data_inicio: '01/12/2026',
      data_termino: '28/02/2027',
      horario_inicio: '07:00',
      horario_fim: '13:00',
      horas_semanais: 30,
      dia: '24',
      mes: 'novembro',
      ano: '2026',
    });
  });

  it('maior de idade: sem responsável, mesmo que haja um nome gravado', () => {
    const dados = montarDadosTce(
      { tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [] },
      estagiarioCompleto({ responsavelNome: 'Resto de cadastro antigo' }),
      config,
      new Date(),
    );

    expect(dados).toMatchObject({ is_menor: false, responsavel_nome: '' });
  });

  it('menor de idade: leva o nome do responsável', () => {
    const dados = montarDadosTce(
      { tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [] },
      estagiarioCompleto({ menorIdade: true, responsavelNome: ' Maria Souza ' }),
      config,
      new Date(),
    );

    expect(dados).toMatchObject({ is_menor: true, responsavel_nome: 'Maria Souza' });
  });

  it('marca pós-graduação', () => {
    const dados = montarDadosTce(
      { tipoEstagio: TipoEstagio.pos_graduacao, estagiarios: [] },
      estagiarioCompleto(),
      config,
      new Date(),
    );

    expect(dados).toMatchObject({ is_obrigatorio: false, is_pos_graduacao: true });
  });
});

describe('formatação', () => {
  it('CPF e CEP só são formatados quando têm só dígitos', () => {
    expect(formatarCpf('12345678901')).toBe('123.456.789-01');
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCep('65075441')).toBe('65075-441');
  });

  it('data @db.Date não volta um dia no fuso de Brasília', () => {
    expect(formatarData(new Date('2026-12-01T00:00:00Z'))).toBe('01/12/2026');
  });

  it('nome do arquivo sem barras nem controles', () => {
    expect(nomeArquivoTce('Ana / Souza\n')).toBe('TCE - Ana Souza.pdf');
    expect(nomeArquivoTce('  ')).toBe('TCE - estagiario.pdf');
  });
});
