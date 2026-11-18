import axios from 'axios';
import { api } from './api.ts';
import { ArquivoRepetidoError } from './processoService.ts';
import type { TipoDocumento } from '../pages/NovoProcesso/pacote.ts';

/** A API recusou o arquivo (400/413/415): vazio, grande demais ou não é PDF. `motivo` vem da API. */
export class ArquivoRecusadoError extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = 'ArquivoRecusadoError';
  }
}

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
  dados: { arquivo: File; tipo: TipoDocumento; estagiarioId?: string },
  { onProgresso, signal }: OpcoesUpload = {},
): Promise<DocumentoEnviado> {
  const corpo = new FormData();
  corpo.append('tipo', dados.tipo);
  if (dados.estagiarioId) corpo.append('estagiarioId', dados.estagiarioId);
  // O arquivo vai por último para o servidor já ter os campos de texto quando começar a ler o conteúdo.
  corpo.append('arquivo', dados.arquivo);

  try {
    const { data } = await api.post<DocumentoEnviado>(`/processos/${processoId}/documentos`, corpo, {
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
      if (status === 409) throw new ArquivoRepetidoError();
      if (status === 400 || status === 413 || status === 415) {
        const motivo = (e.response?.data as { motivo?: unknown } | undefined)?.motivo;
        throw new ArquivoRecusadoError(typeof motivo === 'string' ? motivo : 'O servidor recusou este arquivo.');
      }
    }
    throw new UploadFalhouError();
  }
}
