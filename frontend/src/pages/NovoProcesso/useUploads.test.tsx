import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ArquivoRepetidoError } from '../../services/processoService.ts';
import { UploadCanceladoError, UploadFalhouError } from '../../services/uploadService.ts';
import ArquivoSlot from './ArquivoSlot.tsx';
import { MSG_ARQUIVO_REPETIDO } from './pacote.ts';
import { MSG_FALHA_UPLOAD, useUploads } from './useUploads.ts';

describe('useUploads', () => {
  it('acompanha o progresso e termina como enviado', async () => {
    const { result } = renderHook(() => useUploads());
    let ok = false;
    await act(async () => {
      ok = await result.current.enviar('a', async ({ onProgresso }) => onProgresso(40));
    });
    expect(ok).toBe(true);
    expect(result.current.estados.a).toEqual({ fase: 'enviado' });
  });

  it('mostra mensagem de erro e tenta de novo com a mesma função', async () => {
    const { result } = renderHook(() => useUploads());
    const envio = vi.fn().mockRejectedValueOnce(new UploadFalhouError()).mockResolvedValueOnce(undefined);
    await act(async () => void (await result.current.enviar('a', envio)));
    expect(result.current.estados.a).toEqual({ fase: 'erro', mensagem: MSG_FALHA_UPLOAD });

    await act(async () => void (await result.current.tentarDeNovo('a')));
    expect(envio).toHaveBeenCalledTimes(2);
    expect(result.current.estados.a).toEqual({ fase: 'enviado' });
  });

  it('409 usa a mensagem de arquivo repetido', async () => {
    const { result } = renderHook(() => useUploads());
    await act(async () => void (await result.current.enviar('a', () => Promise.reject(new ArquivoRepetidoError()))));
    expect(result.current.estados.a).toEqual({ fase: 'erro', mensagem: MSG_ARQUIVO_REPETIDO });
  });

  it('cancelar aborta o envio e limpa o estado, sem erro', async () => {
    const { result } = renderHook(() => useUploads());
    let sinal: AbortSignal | undefined;
    let promessa!: Promise<boolean>;
    act(() => {
      promessa = result.current.enviar(
        'a',
        ({ signal }) =>
          new Promise((_, rejeitar) => {
            sinal = signal;
            signal.addEventListener('abort', () => rejeitar(new UploadCanceladoError()));
          }),
      );
    });
    expect(result.current.estados.a).toEqual({ fase: 'enviando', progresso: 0 });
    act(() => result.current.cancelar('a'));
    await act(async () => void (await promessa));
    expect(sinal?.aborted).toBe(true);
    expect(result.current.estados.a).toBeUndefined();
  });
});

describe('ArquivoSlot com envio', () => {
  const base = { rotulo: 'Apólice de seguro', onEscolher: vi.fn(), onRemover: vi.fn() };

  it('mostra barra de progresso e permite cancelar', async () => {
    const aoCancelar = vi.fn();
    render(
      <ul>
        <ArquivoSlot {...base} envio={{ fase: 'enviando', progresso: 60 }} onCancelarEnvio={aoCancelar} />
      </ul>,
    );
    expect(screen.getByRole('progressbar', { name: 'Enviando Apólice de seguro' })).toHaveValue(60);
    expect(screen.getByText('60%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }));
    expect(aoCancelar).toHaveBeenCalled();
  });

  it('mostra o erro do envio com botão de tentar de novo', async () => {
    const aoTentar = vi.fn();
    render(
      <ul>
        <ArquivoSlot {...base} envio={{ fase: 'erro', mensagem: MSG_FALHA_UPLOAD }} onTentarDeNovo={aoTentar} />
      </ul>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(MSG_FALHA_UPLOAD);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentar).toHaveBeenCalled();
  });
});
