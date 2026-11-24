import { describe, expect, it } from 'vitest';
import { formatarData } from './data.ts';

describe('formatarData', () => {
  it('usa o horário de Brasília: 01h UTC ainda é o dia anterior', () => {
    expect(formatarData('2026-11-10T01:30:00Z')).toBe('09/11/2026');
    expect(formatarData('2026-11-10T14:20:00Z')).toBe('10/11/2026');
  });

  it('data ausente vira travessão', () => {
    expect(formatarData(null)).toBe('—');
  });
});
