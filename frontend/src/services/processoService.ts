// Envio do processo de documentação. Ainda é simulado: troque o corpo pela chamada à API
// (criar o processo, subir os documentos e mudar o status para "enviado") quando o recurso existir.
// Quem chama já trata falha: a tela mostra o erro e mantém tudo o que foi preenchido.
/** A API respondeu 409: o mesmo arquivo (mesmo SHA-256) já foi enviado neste processo. */
export class ArquivoRepetidoError extends Error {
  constructor() {
    super('arquivo repetido no processo');
    this.name = 'ArquivoRepetidoError';
  }
}

export async function enviarProcesso(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
