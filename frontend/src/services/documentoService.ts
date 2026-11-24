import { api } from './api.ts';

export interface UrlDocumento {
  url: string;
  /** ISO 8601 em UTC: depois disso a URL assinada deixa de funcionar. */
  expiraEm: string;
}

/** Pede ao backend uma URL assinada, de curta duração, para ler o arquivo (GET /processos/:id/documentos/:id/url). */
export async function obterUrlDocumento(processoId: string, documentoId: string): Promise<UrlDocumento> {
  const { data } = await api.get<UrlDocumento>(`/processos/${processoId}/documentos/${documentoId}/url`);
  return data;
}
