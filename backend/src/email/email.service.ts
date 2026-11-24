import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MensagemEmail, TransporteEmail } from './email.types.js';
import { TransporteLog, TransporteSmtp } from './transportes.js';

const REMETENTE_PADRAO = 'SES-MA Estágios <nao-responda@ses.local>';
const AMBIENTES_COM_LOG = ['development', 'test'];

// Dois modos:
// - com SMTP_HOST: envia por SMTP (Mailpit local, ou o provedor em produção);
// - sem SMTP_HOST, em development/test: só escreve o e-mail no log.
// Fora de development/test e sem SMTP_HOST, recusa com 503: o log levaria
// links e códigos de assinatura para os logs de produção.
// O transporte nasce no primeiro envio, como o StorageService: sem SMTP_*
// a API sobe normalmente.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporte?: TransporteEmail;

  constructor(private readonly config: ConfigService) {}

  async enviar(mensagem: MensagemEmail): Promise<void> {
    await this.obterTransporte().enviar({ ...mensagem, de: this.remetente });
  }

  private get remetente(): string {
    return this.config.get<string>('EMAIL_REMETENTE') || REMETENTE_PADRAO;
  }

  private obterTransporte(): TransporteEmail {
    if (this.transporte) return this.transporte;

    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporte = new TransporteSmtp({
        host,
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: this.config.get('SMTP_SECURE') === 'true',
        user: this.config.get('SMTP_USER') || undefined,
        pass: this.config.get('SMTP_PASS') || undefined,
      });
    } else if (AMBIENTES_COM_LOG.includes(this.config.get<string>('NODE_ENV') ?? '')) {
      this.transporte = new TransporteLog(this.logger);
    } else {
      throw new ServiceUnavailableException('Envio de e-mail não configurado');
    }
    return this.transporte;
  }
}
