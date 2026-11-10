import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CriarEstagiarioDto } from './dto/estagiario.dto.js';

const COLUNAS = {
  nome: 'nome',
  cpf: 'cpf',
  matricula: 'matricula',
  curso: 'curso',
  cidade: 'cidade',
  uf: 'uf',
  cep: 'cep',
  tipo_liberacao: 'tipoLiberacao',
  periodo: 'periodo',
  data_inicio: 'dataInicio',
  data_termino: 'dataTermino',
  horas_por_dia: 'horasPorDia',
  dias_semana: 'diasSemana',
  horario_inicio: 'horarioInicio',
  horario_fim: 'horarioFim',
} as const;

type Coluna = keyof typeof COLUNAS;

const COLUNAS_OBRIGATORIAS: Coluna[] = ['nome', 'cpf', 'matricula', 'curso', 'cidade', 'uf', 'cep'];

const NOME_DA_COLUNA = Object.fromEntries(
  Object.entries(COLUNAS).map(([coluna, campo]) => [campo, coluna]),
);

type RegistroCsv = { linha: number; campos: string[] };

export type LinhaInvalida = { linha: number; campo: string; motivo: string };
export type LinhaValida = { linha: number; dto: CriarEstagiarioDto };

function csvInvalido(motivo: string): BadRequestException {
  return new BadRequestException({ erro: 'csv_invalido', motivo });
}

function decodificar(conteudo: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(conteudo);
  } catch {
    throw csvInvalido('o arquivo precisa estar em UTF-8');
  }
}

// O Excel em português exporta CSV separado por ponto e vírgula.
function detectarSeparador(texto: string): string {
  const cabecalho = texto.split('\n', 1)[0];
  const contar = (separador: string) => cabecalho.split(separador).length;
  return contar(';') > contar(',') ? ';' : ',';
}

function separarRegistros(texto: string, separador: string): RegistroCsv[] {
  const registros: RegistroCsv[] = [];
  let campos: string[] = [];
  let campo = '';
  let entreAspas = false;
  let linhaAtual = 1;
  let linhaInicial = 1;

  const fecharRegistro = () => {
    campos.push(campo);
    if (campos.some((valor) => valor.trim() !== '')) {
      registros.push({ linha: linhaInicial, campos });
    }
    campos = [];
    campo = '';
  };

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i];
    if (entreAspas) {
      if (caractere === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        if (caractere === '\n') linhaAtual++;
        campo += caractere;
      }
    } else if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === separador) {
      campos.push(campo);
      campo = '';
    } else if (caractere === '\n') {
      fecharRegistro();
      linhaAtual++;
      linhaInicial = linhaAtual;
    } else if (caractere !== '\r') {
      campo += caractere;
    }
  }

  if (entreAspas) throw csvInvalido('aspas sem fechamento no arquivo');
  fecharRegistro();
  return registros;
}

function lerCabecalho(registro: RegistroCsv | undefined): Coluna[] {
  if (!registro) throw csvInvalido('arquivo vazio');

  const nomes = registro.campos.map((nome) => nome.trim().toLowerCase());
  const desconhecida = nomes.find((nome) => !(nome in COLUNAS));
  if (desconhecida !== undefined) {
    throw csvInvalido(`coluna desconhecida: ${desconhecida}`);
  }
  if (new Set(nomes).size !== nomes.length) {
    throw csvInvalido('coluna repetida no cabeçalho');
  }
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !nomes.includes(c));
  if (faltando.length > 0) {
    throw csvInvalido(`colunas obrigatórias ausentes: ${faltando.join(', ')}`);
  }
  return nomes as Coluna[];
}

function converterValor(coluna: Coluna, valor: string): string | string[] {
  if (coluna === 'dias_semana') {
    return valor.split('|').map((dia) => dia.trim().toLowerCase());
  }
  if (coluna === 'data_inicio' || coluna === 'data_termino') {
    const brasileira = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
    if (brasileira) {
      return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`;
    }
  }
  return valor;
}

function montarObjeto(colunas: Coluna[], campos: string[]) {
  const objeto: Record<string, string | string[]> = {};
  colunas.forEach((coluna, indice) => {
    const valor = campos[indice].trim();
    if (valor !== '') objeto[COLUNAS[coluna]] = converterValor(coluna, valor);
  });
  return objeto;
}

async function validarRegistro(
  colunas: Coluna[],
  { linha, campos }: RegistroCsv,
): Promise<LinhaValida | LinhaInvalida[]> {
  if (campos.length !== colunas.length) {
    return [
      {
        linha,
        campo: 'linha',
        motivo: `esperadas ${colunas.length} colunas, encontradas ${campos.length}`,
      },
    ];
  }

  const dto = plainToInstance(CriarEstagiarioDto, montarObjeto(colunas, campos));
  const erros = await validate(dto);
  if (erros.length === 0) return { linha, dto };

  return erros.map((erro) => ({
    linha,
    campo: NOME_DA_COLUNA[erro.property],
    motivo: Object.values(erro.constraints ?? {})[0],
  }));
}

function duplicadosNoArquivo(validos: LinhaValida[]): LinhaInvalida[] {
  const invalidos: LinhaInvalida[] = [];
  const campos = [
    { campo: 'cpf', motivo: 'CPF repetido no arquivo' },
    { campo: 'matricula', motivo: 'matrícula repetida no arquivo' },
  ] as const;

  for (const { campo, motivo } of campos) {
    const vistos = new Set<string>();
    for (const { linha, dto } of validos) {
      if (vistos.has(dto[campo])) invalidos.push({ linha, campo, motivo });
      vistos.add(dto[campo]);
    }
  }
  return invalidos;
}

export function duplicadosNoProcesso(
  validos: LinhaValida[],
  existentes: { cpf: string; matricula: string }[],
): LinhaInvalida[] {
  const cpfs = new Set(existentes.map((e) => e.cpf));
  const matriculas = new Set(existentes.map((e) => e.matricula));

  return validos.flatMap(({ linha, dto }) => [
    ...(cpfs.has(dto.cpf)
      ? [{ linha, campo: 'cpf', motivo: 'CPF já cadastrado no processo' }]
      : []),
    ...(matriculas.has(dto.matricula)
      ? [
          {
            linha,
            campo: 'matricula',
            motivo: 'matrícula já cadastrada no processo',
          },
        ]
      : []),
  ]);
}

export function loteInvalido(total: number, invalidos: LinhaInvalida[]): BadRequestException {
  return new BadRequestException({
    erro: 'lote_invalido',
    total,
    invalidos: [...invalidos].sort((a, b) => a.linha - b.linha),
  });
}

export async function lerLote(conteudo: Buffer) {
  const texto = decodificar(conteudo);
  const [cabecalho, ...registros] = separarRegistros(texto, detectarSeparador(texto));
  const colunas = lerCabecalho(cabecalho);
  if (registros.length === 0) throw csvInvalido('arquivo sem estagiários');

  const validos: LinhaValida[] = [];
  const invalidos: LinhaInvalida[] = [];
  for (const registro of registros) {
    const resultado = await validarRegistro(colunas, registro);
    if (Array.isArray(resultado)) invalidos.push(...resultado);
    else validos.push(resultado);
  }
  invalidos.push(...duplicadosNoArquivo(validos));

  return { total: registros.length, validos, invalidos };
}
