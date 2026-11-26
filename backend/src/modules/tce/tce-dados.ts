import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { Estagiario } from '../../generated/prisma/client.js';
import { TipoEstagio } from '../../generated/prisma/enums.js';
import { diasDistintos, problemasJornada } from '../processos/jornada.js';

// Dados fixos do TCE: a SES (concedente) e a instituição de ensino do piloto.
// Vêm do ambiente (Render), não do banco: no piloto só a UNDB participa, e o
// CPF/RG do representante legal da IE não deve ficar no repositório nem no seed.
export const VARIAVEIS_TCE = {
  secretarioNome: 'TCE_SECRETARIO_NOME',
  ieNome: 'TCE_IE_NOME',
  ieCnpj: 'TCE_IE_CNPJ',
  ieEndereco: 'TCE_IE_ENDERECO',
  ieCidade: 'TCE_IE_CIDADE',
  ieUf: 'TCE_IE_UF',
  ieCep: 'TCE_IE_CEP',
  ieRepresentanteCargo: 'TCE_IE_REPRESENTANTE_CARGO',
  ieRepresentanteNome: 'TCE_IE_REPRESENTANTE_NOME',
  ieRepresentanteCpf: 'TCE_IE_REPRESENTANTE_CPF',
  ieRepresentanteRg: 'TCE_IE_REPRESENTANTE_RG',
} as const;

export type ConfiguracaoTce = Record<keyof typeof VARIAVEIS_TCE, string>;

// Sem alguma das variáveis a geração responde 503, como o e-mail e o storage.
export function lerConfiguracaoTce(ler: (nome: string) => string | undefined): ConfiguracaoTce {
  const configuracao = {} as ConfiguracaoTce;
  const faltando: string[] = [];
  for (const [campo, variavel] of Object.entries(VARIAVEIS_TCE)) {
    const valor = ler(variavel)?.trim();
    if (valor) configuracao[campo as keyof ConfiguracaoTce] = valor;
    else faltando.push(variavel);
  }
  if (faltando.length > 0) {
    throw new ServiceUnavailableException(
      `Geração de TCE não configurada (faltam ${faltando.join(', ')})`,
    );
  }
  return configuracao;
}

export type EstagiarioParaTce = Pick<
  Estagiario,
  | 'id'
  | 'nome'
  | 'cpf'
  | 'matricula'
  | 'curso'
  | 'cidade'
  | 'uf'
  | 'cep'
  | 'dataInicio'
  | 'dataTermino'
  | 'horasPorDia'
  | 'diasSemana'
  | 'horarioInicio'
  | 'horarioFim'
>;

export type ProcessoParaTce = {
  tipoEstagio: TipoEstagio | null;
  estagiarios: EstagiarioParaTce[];
};

export type PendenciaTce = { campo: string; motivo: string; estagiarioId?: string };

// Campos do estagiário que aparecem no TCE. Opcionais no banco (o lote nasce
// sem eles), obrigatórios na geração.
const CAMPOS_ESTAGIARIO: [keyof EstagiarioParaTce, string][] = [
  ['cidade', 'cidade não informada'],
  ['uf', 'UF não informada'],
  ['cep', 'CEP não informado'],
  ['dataInicio', 'data de início não informada'],
  ['dataTermino', 'data de término não informada'],
  ['horarioInicio', 'horário de início não informado'],
  ['horarioFim', 'horário de fim não informado'],
  ['horasPorDia', 'horas por dia não informadas'],
];

export function pendenciasTce(processo: ProcessoParaTce): PendenciaTce[] {
  const pendencias: PendenciaTce[] = [];
  if (!processo.tipoEstagio) {
    pendencias.push({ campo: 'tipoEstagio', motivo: 'tipo de estágio não informado' });
  }
  if (processo.estagiarios.length === 0) {
    pendencias.push({ campo: 'estagiarios', motivo: 'processo sem estagiários' });
  }
  for (const estagiario of processo.estagiarios) {
    for (const [campo, motivo] of CAMPOS_ESTAGIARIO) {
      const valor = estagiario[campo];
      if (valor === null || valor === undefined || valor === '') {
        pendencias.push({ campo, motivo, estagiarioId: estagiario.id });
      }
    }
    if (estagiario.diasSemana.length === 0) {
      pendencias.push({
        campo: 'diasSemana',
        motivo: 'dias da semana não informados',
        estagiarioId: estagiario.id,
      });
    }
    // Teto legal da jornada (#79): cadastro antigo ou gravado antes da regra
    // não gera TCE acima de 6 h/dia ou 30 h/semana.
    for (const { motivo } of problemasJornada(estagiario)) {
      pendencias.push({ campo: 'horasPorDia', motivo, estagiarioId: estagiario.id });
    }
  }
  return pendencias;
}

export function garantirDadosTce(processo: ProcessoParaTce) {
  const pendencias = pendenciasTce(processo);
  if (pendencias.length > 0) {
    throw new BadRequestException({ erro: 'tce_incompleto', pendencias });
  }
}

// Nomes exatos dos campos do backend/templates/tce.html.
export type DadosTce = {
  secretario_nome: string;
  ie_nome: string;
  ie_cnpj: string;
  ie_endereco: string;
  ie_cidade: string;
  ie_uf: string;
  ie_cep: string;
  ie_representante_cargo: string;
  ie_representante_nome: string;
  ie_representante_cpf: string;
  ie_representante_rg: string;
  nome: string;
  curso: string;
  matricula: string;
  cpf: string;
  cidade: string;
  uf: string;
  cep: string;
  is_obrigatorio: boolean;
  is_pos_graduacao: boolean;
  data_inicio: string;
  data_termino: string;
  horario_inicio: string;
  horario_fim: string;
  horas_semanais: number;
  dia: string;
  mes: string;
  ano: string;
};

// Data de emissão no fuso do Maranhão (UTC-3, sem horário de verão).
const FUSO_EMISSAO = 'America/Fortaleza';

// Chame garantirDadosTce antes: aqui os campos já são obrigatórios.
export function montarDadosTce(
  processo: ProcessoParaTce,
  estagiario: EstagiarioParaTce,
  configuracao: ConfiguracaoTce,
  emissao: Date,
): DadosTce {
  const parte = (opcoes: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_EMISSAO, ...opcoes }).format(emissao);
  return {
    secretario_nome: configuracao.secretarioNome,
    ie_nome: configuracao.ieNome,
    ie_cnpj: configuracao.ieCnpj,
    ie_endereco: configuracao.ieEndereco,
    ie_cidade: configuracao.ieCidade,
    ie_uf: configuracao.ieUf,
    ie_cep: configuracao.ieCep,
    ie_representante_cargo: configuracao.ieRepresentanteCargo,
    ie_representante_nome: configuracao.ieRepresentanteNome,
    ie_representante_cpf: configuracao.ieRepresentanteCpf,
    ie_representante_rg: configuracao.ieRepresentanteRg,
    nome: estagiario.nome,
    curso: estagiario.curso,
    matricula: estagiario.matricula,
    cpf: formatarCpf(estagiario.cpf),
    cidade: estagiario.cidade!,
    uf: estagiario.uf!,
    cep: formatarCep(estagiario.cep!),
    is_obrigatorio: processo.tipoEstagio === TipoEstagio.obrigatorio,
    is_pos_graduacao: processo.tipoEstagio === TipoEstagio.pos_graduacao,
    data_inicio: formatarData(estagiario.dataInicio!),
    data_termino: formatarData(estagiario.dataTermino!),
    horario_inicio: estagiario.horarioInicio!,
    horario_fim: estagiario.horarioFim!,
    horas_semanais: estagiario.horasPorDia! * diasDistintos(estagiario.diasSemana),
    dia: parte({ day: '2-digit' }),
    mes: parte({ month: 'long' }),
    ano: parte({ year: 'numeric' }),
  };
}

export function formatarCpf(cpf: string): string {
  return /^\d{11}$/.test(cpf) ? cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : cpf;
}

export function formatarCep(cep: string): string {
  return /^\d{8}$/.test(cep) ? cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : cep;
}

// Colunas @db.Date chegam como meia-noite UTC: formatar em UTC não muda o dia.
export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(data);
}

// Nome do PDF no storage e no download. Sem barra nem caractere de controle.
export function nomeArquivoTce(nome: string): string {
  const limpo = nome
    .replace(/[\\/\p{Cc}"]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `TCE - ${limpo || 'estagiario'}.pdf`;
}
