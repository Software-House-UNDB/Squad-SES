// Teto legal da jornada do estágio (Lei 11.788/2008, art. 10, II; issue #79):
// até 6 horas diárias e 30 horas semanais no ensino superior. A exceção de
// 40 h semanais do §1º fica fora do MVP.
// Usado no cadastro (DTO, PATCH e lote CSV) e na geração do TCE: nenhum TCE
// sai acima do teto, nem por chamada direta à API.

export const LIMITE_HORAS_DIA = 6;
export const LIMITE_HORAS_SEMANA = 30;

export type Jornada = {
  horasPorDia?: number | null;
  diasSemana?: string[] | null;
  horarioInicio?: string | null;
  horarioFim?: string | null;
};

export type RegraJornada = 'diaria' | 'semanal' | 'horario';
export type ProblemaJornada = { regra: RegraJornada; motivo: string };

// Dia repetido ("seg|seg" no CSV) não conta duas vezes.
export function diasDistintos(diasSemana?: unknown): number {
  return Array.isArray(diasSemana) ? new Set(diasSemana).size : 0;
}

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const ehHorario = (valor: unknown): valor is string =>
  typeof valor === 'string' && HORARIO.test(valor);

const minutos = (horario: string) => {
  const [hora, minuto] = horario.split(':').map(Number);
  return hora * 60 + minuto;
};

// Confere só o que estiver preenchido e bem formado: campo ausente ou inválido
// é outra regra (o DTO e o TCE cobram à parte).
export function problemasJornada({
  horasPorDia,
  diasSemana,
  horarioInicio,
  horarioFim,
}: Jornada): ProblemaJornada[] {
  if (typeof horasPorDia !== 'number' || !Number.isFinite(horasPorDia)) return [];
  const problemas: ProblemaJornada[] = [];
  const problema = (regra: RegraJornada, motivo: string) => problemas.push({ regra, motivo });

  if (horasPorDia > LIMITE_HORAS_DIA) {
    problema('diaria', `jornada acima do limite legal de ${LIMITE_HORAS_DIA} horas diárias`);
  }

  const semanais = horasPorDia * diasDistintos(diasSemana);
  if (semanais > LIMITE_HORAS_SEMANA) {
    problema(
      'semanal',
      `jornada acima do limite legal de ${LIMITE_HORAS_SEMANA} horas semanais (${semanais} h)`,
    );
  }

  if (ehHorario(horarioInicio) && ehHorario(horarioFim)) {
    const janela = minutos(horarioFim) - minutos(horarioInicio);
    if (horasPorDia * 60 > janela) {
      problema(
        'horario',
        `${horasPorDia} h por dia não cabem no horário de ${horarioInicio} a ${horarioFim}`,
      );
    }
  }
  return problemas;
}
