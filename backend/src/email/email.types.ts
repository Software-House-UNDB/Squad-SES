// Contrato estável do envio de e-mail. Quem chama (assinaturas, lembretes)
// só conhece `MensagemEmail`; trocar o transporte (SMTP, Resend, SendGrid)
// ou os templates não muda o fluxo de quem envia.
export type MensagemEmail = {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
};

export type EmailComRemetente = MensagemEmail & { de: string };

export interface TransporteEmail {
  enviar(mensagem: EmailComRemetente): Promise<void>;
}
