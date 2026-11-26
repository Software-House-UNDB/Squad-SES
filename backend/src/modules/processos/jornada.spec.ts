import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CriarEstagiarioDto } from './dto/estagiario.dto.js';
import { diasDistintos, problemasJornada } from './jornada.js';

const UTEIS = ['seg', 'ter', 'qua', 'qui', 'sex'];

describe('problemasJornada (Lei 11.788, art. 10, II)', () => {
  it('limite exato passa: 6 h × 5 dias = 30 h, em 6 h de janela', () => {
    expect(
      problemasJornada({
        horasPorDia: 6,
        diasSemana: UTEIS,
        horarioInicio: '07:00',
        horarioFim: '13:00',
      }),
    ).toEqual([]);
  });

  it('diário: mais de 6 h por dia', () => {
    expect(problemasJornada({ horasPorDia: 7, diasSemana: ['seg'] })).toEqual([
      { regra: 'diaria', motivo: 'jornada acima do limite legal de 6 horas diárias' },
    ]);
  });

  it('semanal: 6 h × 6 dias = 36 h', () => {
    expect(problemasJornada({ horasPorDia: 6, diasSemana: [...UTEIS, 'sab'] })).toEqual([
      {
        regra: 'semanal',
        motivo: 'jornada acima do limite legal de 30 horas semanais (36 h)',
      },
    ]);
  });

  it('janela: 6 h não cabem entre 08:00 e 13:00', () => {
    expect(
      problemasJornada({ horasPorDia: 6, horarioInicio: '08:00', horarioFim: '13:00' }),
    ).toEqual([{ regra: 'horario', motivo: '6 h por dia não cabem no horário de 08:00 a 13:00' }]);
  });

  it('horário de fim antes do início não é janela válida', () => {
    expect(
      problemasJornada({ horasPorDia: 4, horarioInicio: '18:00', horarioFim: '08:00' }),
    ).toHaveLength(1);
  });

  it('lista todas as regras violadas', () => {
    const regras = problemasJornada({
      horasPorDia: 8,
      diasSemana: UTEIS,
      horarioInicio: '08:00',
      horarioFim: '12:00',
    }).map(({ regra }) => regra);

    expect(regras).toEqual(['diaria', 'semanal', 'horario']);
  });

  it('dia repetido conta uma vez', () => {
    expect(diasDistintos(['seg', 'seg', 'ter'])).toBe(2);
    expect(problemasJornada({ horasPorDia: 6, diasSemana: [...UTEIS, 'seg'] })).toEqual([]);
  });

  it('sem horas por dia, ou com dado malformado, não acusa nada (outras regras cobram)', () => {
    expect(problemasJornada({ horasPorDia: null, diasSemana: UTEIS })).toEqual([]);
    expect(
      problemasJornada({ horasPorDia: 6, horarioInicio: '25:00', horarioFim: '13:00' }),
    ).toEqual([]);
    expect(problemasJornada({ horasPorDia: 6, diasSemana: 'seg' as unknown as string[] })).toEqual(
      [],
    );
  });
});

describe('CriarEstagiarioDto: teto da jornada', () => {
  const BASE = { nome: 'Ana', cpf: '52998224725', matricula: 'M1', curso: 'Enfermagem' };

  async function errosDe(jornada: object) {
    const erros = await validate(plainToInstance(CriarEstagiarioDto, { ...BASE, ...jornada }));
    return erros.flatMap((erro) => Object.values(erro.constraints ?? {}));
  }

  it('aceita o limite exato', async () => {
    expect(
      await errosDe({
        horasPorDia: 6,
        diasSemana: UTEIS,
        horarioInicio: '07:00',
        horarioFim: '13:00',
      }),
    ).toEqual([]);
  });

  it('recusa mais de 6 h por dia, sem repetir a mensagem', async () => {
    expect(await errosDe({ horasPorDia: 8, diasSemana: ['seg'] })).toEqual([
      'jornada acima do limite legal de 6 horas diárias',
    ]);
  });

  it('recusa mais de 30 h por semana', async () => {
    expect(await errosDe({ horasPorDia: 5, diasSemana: [...UTEIS, 'sab', 'dom'] })).toEqual([
      'jornada acima do limite legal de 30 horas semanais (35 h)',
    ]);
  });

  it('recusa horas que não cabem no horário', async () => {
    expect(await errosDe({ horasPorDia: 5, horarioInicio: '08:00', horarioFim: '12:00' })).toEqual([
      '5 h por dia não cabem no horário de 08:00 a 12:00',
    ]);
  });
});
