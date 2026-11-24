// Máscaras e validações do formulário de Novo processo (RF-06 e RF-13 do projeto piloto).
// O CPF segue a mesma regra do DTO do back-end para o erro aparecer antes do envio.

export const apenasDigitos = (valor: string) => valor.replace(/\D/g, '');

export function formatarCpf(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitos(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

export const DIAS_SEMANA = [
  { valor: 'seg', rotulo: 'Seg' },
  { valor: 'ter', rotulo: 'Ter' },
  { valor: 'qua', rotulo: 'Qua' },
  { valor: 'qui', rotulo: 'Qui' },
  { valor: 'sex', rotulo: 'Sex' },
  { valor: 'sab', rotulo: 'Sáb' },
  { valor: 'dom', rotulo: 'Dom' },
] as const;

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

export function formatarCep(valor: string): string {
  return apenasDigitos(valor)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2');
}

/**
 * Estagiário do lote: nome, CPF, matrícula e curso; menor de idade exige o responsável (RF-13).
 * Os dados do TCE (e-mail, período, dias/horário, cidade/UF/CEP) são exigidos para o envio às
 * assinaturas: sem o e-mail o /iniciar falha e sem o restante o TCE não pode ser gerado.
 */
export interface EstagiarioForm {
  nome: string;
  cpf: string;
  matricula: string;
  curso: string;
  menor: boolean;
  responsavel: string;
  email: string;
  /** Período (semestre) do curso, em texto para o input; vai como número para a API. */
  periodo: string;
  /** Datas no formato AAAA-MM-DD, o mesmo do input type="date" e da API. */
  dataInicio: string;
  dataTermino: string;
  horasPorDia: string;
  diasSemana: string[];
  /** Horários no formato HH:MM. */
  horarioInicio: string;
  horarioFim: string;
  cidade: string;
  uf: string;
  cep: string;
}

export const ESTAGIARIO_VAZIO: EstagiarioForm = {
  nome: '',
  cpf: '',
  matricula: '',
  curso: '',
  menor: false,
  responsavel: '',
  email: '',
  periodo: '',
  dataInicio: '',
  dataTermino: '',
  horasPorDia: '',
  diasSemana: [],
  horarioInicio: '',
  horarioFim: '',
  cidade: '',
  uf: '',
  cep: '',
};

export type ErrosEstagiario = Partial<Record<keyof EstagiarioForm, string>>;

/** Valida um estagiário; `existentes` evita CPF, matrícula e e-mail repetidos no mesmo processo. */
export function validarEstagiario(
  dados: EstagiarioForm,
  existentes: EstagiarioForm[] = [],
): ErrosEstagiario {
  const erros: ErrosEstagiario = {};
  if (!dados.nome.trim()) erros.nome = 'Informe o nome completo.';
  if (!cpfValido(dados.cpf)) erros.cpf = 'CPF inválido. Confira os 11 dígitos.';
  else if (existentes.some((e) => apenasDigitos(e.cpf) === apenasDigitos(dados.cpf)))
    erros.cpf = 'Este CPF já está neste processo.';
  if (!dados.matricula.trim()) erros.matricula = 'Informe a matrícula.';
  else if (existentes.some((e) => e.matricula.trim() === dados.matricula.trim()))
    erros.matricula = 'Esta matrícula já está neste processo.';
  if (!dados.curso.trim()) erros.curso = 'Informe o curso.';
  if (dados.menor && !dados.responsavel.trim())
    erros.responsavel = 'Informe o nome do responsável pelo menor.';

  const email = dados.email.trim().toLowerCase();
  if (!email) erros.email = 'Informe o e-mail do estagiário.';
  else if (!EMAIL.test(email)) erros.email = 'E-mail inválido.';
  else if (existentes.some((e) => e.email.trim().toLowerCase() === email))
    erros.email = 'Este e-mail já está neste processo: cada estagiário assina com o seu.';

  const periodo = Number(dados.periodo);
  if (!dados.periodo.trim() || !Number.isInteger(periodo) || periodo < 1)
    erros.periodo = 'Informe o período do curso (1 ou mais).';

  if (!dados.dataInicio) erros.dataInicio = 'Informe a data de início.';
  if (!dados.dataTermino) erros.dataTermino = 'Informe a data de término.';
  else if (dados.dataInicio && dados.dataTermino < dados.dataInicio)
    erros.dataTermino = 'O término não pode ser antes do início.';

  const horas = Number(dados.horasPorDia);
  if (!dados.horasPorDia.trim() || !Number.isInteger(horas) || horas < 1 || horas > 24)
    erros.horasPorDia = 'Informe as horas por dia (de 1 a 24).';

  if (dados.diasSemana.length === 0) erros.diasSemana = 'Marque ao menos um dia da semana.';

  if (!HORARIO.test(dados.horarioInicio)) erros.horarioInicio = 'Informe o horário de início.';
  if (!HORARIO.test(dados.horarioFim)) erros.horarioFim = 'Informe o horário de fim.';
  else if (HORARIO.test(dados.horarioInicio) && dados.horarioFim <= dados.horarioInicio)
    erros.horarioFim = 'O fim deve ser depois do início.';

  if (!dados.cidade.trim()) erros.cidade = 'Informe a cidade.';
  if (!(UFS as readonly string[]).includes(dados.uf)) erros.uf = 'Escolha a UF.';
  if (apenasDigitos(dados.cep).length !== 8) erros.cep = 'CEP inválido. Confira os 8 dígitos.';
  return erros;
}

/** Dados do processo que entram no TCE: tipo de estágio e supervisor do campo. */
export interface ProcessoForm {
  tipoEstagio: '' | 'obrigatorio' | 'pos_graduacao';
  supervisorNome: string;
  supervisorEmail: string;
}

export const PROCESSO_VAZIO: ProcessoForm = {
  tipoEstagio: '',
  supervisorNome: '',
  supervisorEmail: '',
};

export type ErrosProcesso = Partial<Record<keyof ProcessoForm, string>>;

export function validarProcesso(dados: ProcessoForm): ErrosProcesso {
  const erros: ErrosProcesso = {};
  if (!dados.tipoEstagio) erros.tipoEstagio = 'Escolha o tipo de estágio.';
  if (!dados.supervisorNome.trim()) erros.supervisorNome = 'Informe o nome do supervisor.';
  const email = dados.supervisorEmail.trim();
  if (!email) erros.supervisorEmail = 'Informe o e-mail do supervisor.';
  else if (!EMAIL.test(email)) erros.supervisorEmail = 'E-mail do supervisor inválido.';
  return erros;
}
