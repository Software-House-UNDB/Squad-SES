import axios from 'axios';
import { api } from './api.ts';
import { ProcessoForaDoStatusError, SemPermissaoError } from './uploadService.ts';

/** Documento como a API devolve em GET /processos/:id/documentos (sem a chave de storage). */
export interface DocumentoDoProcesso {
  id: string;
  processoId: string;
  estagiarioId: string | null;
  tipo: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  hashSha256: string;
  /** Quem enviou: o criador do processo é da UNDB; qualquer outro usuário é retorno da SES. */
  enviadoPorId: string;
  criadoEm: string;
}

/** Pacote da UNDB e retornos da SES vêm juntos, na mesma listagem. */
export async function listarDocumentos(processoId: string): Promise<DocumentoDoProcesso[]> {
  const { data } = await api.get<DocumentoDoProcesso[]>(`/processos/${processoId}/documentos`);
  return data;
}

/** DELETE do documento. 403 = documento do outro lado; 409 = processo fora do status do seu lado. */
export async function removerDocumento(processoId: string, documentoId: string): Promise<void> {
  try {
    await api.delete(`/processos/${processoId}/documentos/${documentoId}`);
  } catch (e) {
    if (axios.isAxiosError(e)) {
      if (e.response?.status === 403) throw new SemPermissaoError();
      if (e.response?.status === 409) throw new ProcessoForaDoStatusError();
    }
    throw e;
  }
}
