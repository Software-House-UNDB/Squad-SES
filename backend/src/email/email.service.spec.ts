import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

const sendMail = vi.fn();
const createTransport = vi.fn((_opcoes: unknown) => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport: (o: unknown) => createTransport(o) } }));

const MENSAGEM = { para: 'estagiario@exemplo.com', assunto: 'Assunto', texto: 'Corpo' };

function montar(variaveis: Record<string, string | undefined>) {
  const config = { get: (nome: string) => variaveis[nome] };
  return new EmailService(config as unknown as ConfigService);
}

describe('EmailService', () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it('em development sem SMTP_HOST, escreve o e-mail no log e não abre SMTP', async () => {
    const service = montar({ NODE_ENV: 'development' });
    const log = vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    await service.enviar(MENSAGEM);

    expect(createTransport).not.toHaveBeenCalled();
    const texto = String(log.mock.calls[0][0]);
    expect(texto).toContain('Para: estagiario@exemplo.com');
    expect(texto).toContain('Corpo');
  });

  it('em test sem SMTP_HOST também usa o log', async () => {
    const service = montar({ NODE_ENV: 'test' });
    vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    await expect(service.enviar(MENSAGEM)).resolves.toBeUndefined();
  });

  it.each(['production', undefined])(
    'com NODE_ENV=%s e sem SMTP_HOST, recusa com 503 em vez de logar',
    async (ambiente) => {
      const service = montar({ NODE_ENV: ambiente });

      await expect(service.enviar(MENSAGEM)).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('com SMTP_HOST, envia por SMTP com remetente, porta e autenticação', async () => {
    const service = montar({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.exemplo.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'usuario',
      SMTP_PASS: 'segredo',
      EMAIL_REMETENTE: 'SES <ses@exemplo.com>',
    });

    await service.enviar({ ...MENSAGEM, html: '<p>Corpo</p>' });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.exemplo.com',
      port: 465,
      secure: true,
      auth: { user: 'usuario', pass: 'segredo' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SES <ses@exemplo.com>',
      to: 'estagiario@exemplo.com',
      subject: 'Assunto',
      text: 'Corpo',
      html: '<p>Corpo</p>',
    });
  });

  it('SMTP sem usuário (Mailpit) não manda auth; porta padrão 587 e remetente padrão', async () => {
    const service = montar({ SMTP_HOST: 'localhost' });

    await service.enviar(MENSAGEM);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 587,
      secure: false,
      auth: undefined,
    });
    expect(sendMail.mock.calls[0][0].from).toContain('nao-responda');
  });

  it('cria o transporte uma vez só', async () => {
    const service = montar({ SMTP_HOST: 'localhost' });

    await service.enviar(MENSAGEM);
    await service.enviar(MENSAGEM);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('erro do SMTP chega a quem chamou', async () => {
    sendMail.mockRejectedValueOnce(new Error('conexão recusada'));
    const service = montar({ SMTP_HOST: 'localhost' });

    await expect(service.enviar(MENSAGEM)).rejects.toThrow('conexão recusada');
  });
});
