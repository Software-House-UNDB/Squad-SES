// Calendário de dias úteis da SES-MA, no fuso do Maranhão.
//
// Feriados considerados:
// - nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023): 01/01, 21/04,
//   01/05, 07/09, 12/10, 02/11, 15/11, 20/11 e 25/12;
// - Sexta-feira Santa;
// - Carnaval (segunda e terça) e Corpus Christi: pontos facultativos federais,
//   sem expediente nos órgãos públicos;
// - estadual do Maranhão: 28/07 (Adesão do Maranhão à Independência).
// Feriados municipais e pontos facultativos decretados no ano entram pela
// configuração (FERIADOS_EXTRAS), sem mudar código.

// UTC-3 fixo: o Maranhão não tem horário de verão.
export const FUSO_MARANHAO = 'America/Fortaleza';
const DESLOCAMENTO = '-03:00';

// Dia do calendário no formato 'AAAA-MM-DD'.
export type Dia = string;

const FIXOS = [
  '01-01',
  '04-21',
  '05-01',
  '07-28',
  '09-07',
  '10-12',
  '11-02',
  '11-15',
  '11-20',
  '12-25',
];

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_MARANHAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Dia do calendário em São Luís para um instante.
export function diaLocal(instante: Date): Dia {
  return formatoDia.format(instante);
}

// Instante em que o dia começa em São Luís.
export function inicioDoDia(dia: Dia): Date {
  return new Date(`${dia}T00:00:00${DESLOCAMENTO}`);
}

export function somarDias(dia: Dia, quantidade: number): Dia {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return data.toISOString().slice(0, 10);
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const DIA_COMPLETO = /^\d{4}-\d{2}-\d{2}$/;
const DIA_DO_ANO = /^\d{2}-\d{2}$/;

// FERIADOS_EXTRAS: lista separada por vírgula. 'MM-DD' vale todo ano (feriado
// municipal); 'AAAA-MM-DD' vale só naquela data (ponto facultativo decretado).
export function lerFeriadosExtras(valor: string | undefined): string[] {
  const itens = (valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const invalido = itens.find((item) => !DIA_COMPLETO.test(item) && !DIA_DO_ANO.test(item));
  if (invalido) {
    throw new Error(`FERIADOS_EXTRAS inválido: "${invalido}" (use MM-DD ou AAAA-MM-DD)`);
  }
  return itens;
}

export class CalendarioUtil {
  private readonly porAno = new Map<number, Set<Dia>>();

  constructor(private readonly extras: string[] = []) {}

  feriados(ano: number): Set<Dia> {
    let dias = this.porAno.get(ano);
    if (!dias) {
      const domingoDePascoa = pascoa(ano);
      dias = new Set([
        ...FIXOS.map((mesDia) => `${ano}-${mesDia}`),
        somarDias(domingoDePascoa, -48), // segunda de Carnaval
        somarDias(domingoDePascoa, -47), // terça de Carnaval
        somarDias(domingoDePascoa, -2), // Sexta-feira Santa
        somarDias(domingoDePascoa, 60), // Corpus Christi
        ...this.extras.map((item) => (DIA_DO_ANO.test(item) ? `${ano}-${item}` : item)),
      ]);
      this.porAno.set(ano, dias);
    }
    return dias;
  }

  ehDiaUtil(dia: Dia): boolean {
    const semana = new Date(`${dia}T00:00:00Z`).getUTCDay();
    if (semana === 0 || semana === 6) return false;
    return !this.feriados(Number(dia.slice(0, 4))).has(dia);
  }

  // O dia útil que fica `quantidade` dias úteis antes de `dia` (sem contar `dia`).
  voltarDiasUteis(dia: Dia, quantidade: number): Dia {
    let atual = dia;
    for (let contados = 0; contados < quantidade;) {
      atual = somarDias(atual, -1);
      if (this.ehDiaUtil(atual)) contados++;
    }
    return atual;
  }
}
