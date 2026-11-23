import type { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailComRemetente, TransporteEmail } from './email.types.js';

// Só em development/test: o e-mail vai inteiro para o log, inclusive links
// e códigos, para dar para testar o fluxo sem servidor de e-mail.
export class TransporteLog implements TransporteEmail {
  constructor(private readonly logger: Logger) {}

  async enviar(mensagem: EmailComRemetente) {
    this.logger.log(
      `[e-mail não enviado: modo log]\nDe: ${mensagem.de}\nPara: ${mensagem.para}\n` +
        `Assunto: ${mensagem.assunto}\n\n${mensagem.texto}`,
    );
  }
}

export type ConfiguracaoSmtp = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
};

export class TransporteSmtp implements TransporteEmail {
  private readonly transporter: Transporter;

  constructor(config: ConfiguracaoSmtp) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // O Mailpit local não pede autenticação.
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async enviar(mensagem: EmailComRemetente) {
    await this.transporter.sendMail({
      from: mensagem.de,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: mensagem.html,
    });
  }
}
