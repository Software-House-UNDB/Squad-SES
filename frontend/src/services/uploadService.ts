import axios from 'axios';
import { api } from './api.ts';
import { ArquivoRepetidoError } from './processoService.ts';
import type { TipoDocumento } from '../pages/NovoProcesso/pacote.ts';
import type { TipoRetorno } from '../domain/retorno.ts';

/** A API recusou o arquivo (400/413/415): vazio, grande demais ou não é PDF. `motivo` vem da API. */
export class ArquivoRecusadoError extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = 'ArquivoRecusadoError';
  }
}

/** A API recusou por perfil (403): tipo não permitido para o perfil ou documento do outro lado. */
export class SemPermissaoError extends Error {
  constructor() {
    super('sem permissão para esta operação');
    this.name = 'SemPermissaoError';
  }
}

/** A API recusou por status (409): o processo não está num status que aceita esta operação. */
export class ProcessoForaDoStatusError extends Error {
  constructor() {
    super('processo fora do status permitido');
    this.name = 'ProcessoForaDoStatusError';
  }
}

/** Tipos que a API aceita no envio: os do pacote da UNDB e os de retorno da SES. */
export type TipoEnvio = TipoDocumento | TipoRetorno;

/** O envio foi interrompido pelo usuário. */
export class UploadCanceladoError extends Error {
  constructor() {
    super('envio cancelado');
    this.name = 'UploadCanceladoError';
  }
}

/** Falha de rede ou do servidor; vale tentar de novo. */
export class UploadFalhouError extends Error {
  constructor() {
    super('falha no envio');
    this.name = 'UploadFalhouError';
  }
}

export interface DocumentoEnviado {
  id: string;
  hashSha256: string;
}

interface OpcoesUpload {
  /** Percentual de 0 a 100 do que já subiu. */
  onProgresso?: (percentual: number) => void;
  signal?: AbortSignal;
}

/** Envia um arquivo ao processo (POST /processos/:id/documentos, multipart), com progresso e cancelamento. */
export async function enviarDocumento(
  processoId: string,
  dados: { arquivo: File; tipo: TipoEnvio; estagiarioId?: string },
  { onProgresso, signal }: OpcoesUpload = {},
): Promise<DocumentoEnviado> {
  const corpo = new FormData();
  corpo.append('tipo', dados.tipo);
  if (dados.estagiarioId) corpo.append('estagiarioId', dados.estagiarioId);
  // O arquivo vai por último para o servidor já ter os campos de texto quando começar a ler o conteúdo.
  corpo.append('arquivo', dados.arquivo);

  try {
    const { data } = await api.post<DocumentoEnviado>(`/processos/${processoId}/documentos`, corpo, {
      // Não remova: a instância `api` usa application/json por padrão e, com esse tipo, o axios converte o
      // FormData em JSON. Com multipart ele mantém o FormData e, no navegador, apaga o cabeçalho para o
      // próprio navegador acrescentar o boundary (resolveConfig do axios). Coberto em uploadService.test.ts.
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      onUploadProgress: (e) => {
        if (e.total) onProgresso?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      },
    });
    onProgresso?.(100);
    return data;
  } catch (e) {
    if (axios.isCancel(e)) throw new UploadCanceladoError();
    if (axios.isAxiosError(e)) {
      const status = e.response?.status;
      if (status === 403) throw new SemPermissaoError();
      if (status === 409) {
        // O 409 serve a dois casos: arquivo repetido e processo fora do status.
        const mensagem = (e.response?.data as { message?: unknown } | undefined)?.message;
        if (typeof mensagem === 'string' && /^Processo em /i.test(mensagem)) {
          throw new ProcessoForaDoStatusError();
        }
        throw new ArquivoRepetidoError();
      }
      if (status === 400 || status === 413 || status === 415) {
        const motivo = (e.response?.data as { motivo?: unknown } | undefined)?.motivo;
        throw new ArquivoRecusadoError(typeof motivo === 'string' ? motivo : 'O servidor recusou este arquivo.');
      }
    }
    throw new UploadFalhouError();
  }
}
