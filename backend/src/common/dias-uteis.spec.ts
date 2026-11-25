import {
  CalendarioUtil,
  diaLocal,
  inicioDoDia,
  lerFeriadosExtras,
  pascoa,
  somarDias,
} from './dias-uteis.js';

describe('pascoa', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i: %s', (ano, dia) => {
    expect(pascoa(ano)).toBe(dia);
  });
});

describe('CalendarioUtil', () => {
  const calendario = new CalendarioUtil();

  it('feriados de 2026, fixos e móveis', () => {
    expect([...calendario.feriados(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-02-16', // segunda de Carnaval
      '2026-02-17', // terça de Carnaval
      '2026-04-03', // Sexta-feira Santa
      '2026-04-21',
      '2026-05-01',
      '2026-06-04', // Corpus Christi
      '2026-07-28', // Adesão do Maranhão
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20', // Consciência Negra (Lei 14.759/2023)
      '2026-12-25',
    ]);
  });

  it('fim de semana e feriado não são úteis', () => {
    expect(calendario.ehDiaUtil('2026-11-25')).toBe(true); // quarta
    expect(calendario.ehDiaUtil('2026-11-28')).toBe(false); // sábado
    expect(calendario.ehDiaUtil('2026-11-29')).toBe(false); // domingo
    expect(calendario.ehDiaUtil('2026-11-20')).toBe(false); // sexta, feriado
  });

  it('volta dias úteis pulando fim de semana e feriado', () => {
    // Segunda 23/11: sexta 20/11 é feriado, então 2 dias úteis antes é quinta 19/11.
    expect(calendario.voltarDiasUteis('2026-11-23', 2)).toBe('2026-11-18');
    expect(calendario.voltarDiasUteis('2026-11-23', 1)).toBe('2026-11-19');
    expect(calendario.voltarDiasUteis('2026-11-26', 2)).toBe('2026-11-24');
  });

  it('feriados extras: MM-DD todo ano, AAAA-MM-DD só na data', () => {
    const comExtras = new CalendarioUtil(['09-08', '2026-12-24']);

    expect(comExtras.ehDiaUtil('2026-09-08')).toBe(false);
    expect(comExtras.ehDiaUtil('2027-09-08')).toBe(false);
    expect(comExtras.ehDiaUtil('2026-12-24')).toBe(false);
    expect(comExtras.ehDiaUtil('2027-12-24')).toBe(true);
  });
});

describe('lerFeriadosExtras', () => {
  it('aceita lista vazia ou ausente', () => {
    expect(lerFeriadosExtras(undefined)).toEqual([]);
    expect(lerFeriadosExtras(' ')).toEqual([]);
  });

  it('lê os dois formatos, sem espaços', () => {
    expect(lerFeriadosExtras(' 09-08 , 2026-12-24 ')).toEqual(['09-08', '2026-12-24']);
  });

  it('recusa formato inválido', () => {
    expect(() => lerFeriadosExtras('08/09')).toThrow('FERIADOS_EXTRAS inválido: "08/09"');
  });
});

describe('fuso do Maranhão', () => {
  it('00:30 UTC ainda é o dia anterior em São Luís', () => {
    expect(diaLocal(new Date('2026-11-26T00:30:00Z'))).toBe('2026-11-25');
    expect(diaLocal(new Date('2026-11-26T03:00:00Z'))).toBe('2026-11-26');
  });

  it('o dia começa às 03:00 UTC', () => {
    expect(inicioDoDia('2026-11-25').toISOString()).toBe('2026-11-25T03:00:00.000Z');
  });

  it('soma dias atravessando o mês e o ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});
