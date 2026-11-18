import { useCallback, useEffect, useRef, useState } from 'react';
import { ArquivoRepetidoError } from '../../services/processoService.ts';
import { ArquivoRecusadoError, UploadCanceladoError } from '../../services/uploadService.ts';
import { MSG_ARQUIVO_REPETIDO } from './pacote.ts';

export type EstadoUpload =
  | { fase: 'enviando'; progresso: number }
  | { fase: 'enviado' }
  | { fase: 'erro'; mensagem: string };

export const MSG_FALHA_UPLOAD = 'Não foi possível enviar o arquivo. Confira a conexão e tente de novo.';

type Envio = (opcoes: { onProgresso: (percentual: number) => void; signal: AbortSignal }) => Promise<unknown>;

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ArquivoRepetidoError) return MSG_ARQUIVO_REPETIDO;
  if (e instanceof ArquivoRecusadoError) return e.motivo;
  return MSG_FALHA_UPLOAD;
}

/**
 * Estado de envio de cada arquivo (por chave de slot): progresso, erro e cancelamento.
 * `enviar` guarda a última tentativa de cada chave, então `tentarDeNovo` repete sem o chamador refazer nada.
 */
export function useUploads() {
  const [estados, setEstados] = useState<Record<string, EstadoUpload>>({});
  const controles = useRef(new Map<string, AbortController>());
  const tentativas = useRef(new Map<string, Envio>());

  useEffect(() => {
    const ativos = controles.current;
    return () => ativos.forEach((c) => c.abort());
  }, []);

  const definir = useCallback((chave: string, estado: EstadoUpload | null) => {
    setEstados((atual) => {
      if (estado) return { ...atual, [chave]: estado };
      const { [chave]: _removido, ...resto } = atual;
      return resto;
    });
  }, []);

  const enviar = useCallback(
    async (chave: string, envio: Envio): Promise<boolean> => {
      controles.current.get(chave)?.abort();
      const controle = new AbortController();
      controles.current.set(chave, controle);
      tentativas.current.set(chave, envio);
      definir(chave, { fase: 'enviando', progresso: 0 });
      try {
        await envio({
          signal: controle.signal,
          onProgresso: (progresso) => {
            if (!controle.signal.aborted) definir(chave, { fase: 'enviando', progresso });
          },
        });
        definir(chave, { fase: 'enviado' });
        return true;
      } catch (e) {
        // Cancelado pelo usuário ou por troca de arquivo: volta ao estado inicial, sem erro.
        if (e instanceof UploadCanceladoError || controle.signal.aborted) definir(chave, null);
        else definir(chave, { fase: 'erro', mensagem: mensagemDeErro(e) });
        return false;
      } finally {
        if (controles.current.get(chave) === controle) controles.current.delete(chave);
      }
    },
    [definir],
  );

  const cancelar = useCallback((chave: string) => controles.current.get(chave)?.abort(), []);

  const tentarDeNovo = useCallback(
    (chave: string) => {
      const envio = tentativas.current.get(chave);
      return envio ? enviar(chave, envio) : Promise.resolve(false);
    },
    [enviar],
  );

  const limpar = useCallback(
    (chave: string) => {
      controles.current.get(chave)?.abort();
      tentativas.current.delete(chave);
      definir(chave, null);
    },
    [definir],
  );

  return { estados, enviar, cancelar, tentarDeNovo, limpar };
}
