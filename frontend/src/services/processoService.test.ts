import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarProcesso } from './processoService.ts';

describe('processoService (envio simulado)', () => {
  afterEach(() => vi.useRealTimers());

  it('só conclui depois de um tempo, como uma chamada de rede', async () => {
    vi.useFakeTimers();
    let concluiu = false;
    const envio = enviarProcesso().then(() => (concluiu = true));

    await vi.advanceTimersByTimeAsync(1000);
    expect(concluiu).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    await envio;
    expect(concluiu).toBe(true);
  });
});
