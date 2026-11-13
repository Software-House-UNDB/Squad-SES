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

/** Estagiário do lote: nome, CPF, matrícula e curso; menor de idade exige o responsável (RF-13). */
export interface EstagiarioForm {
  nome: string;
  cpf: string;
  matricula: string;
  curso: string;
  menor: boolean;
  responsavel: string;
}

export const ESTAGIARIO_VAZIO: EstagiarioForm = {
  nome: '',
  cpf: '',
  matricula: '',
  curso: '',
  menor: false,
  responsavel: '',
};

export type ErrosEstagiario = Partial<Record<keyof EstagiarioForm, string>>;

/** Valida um estagiário; `existentes` evita CPF e matrícula repetidos no mesmo processo. */
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
  return erros;
}
