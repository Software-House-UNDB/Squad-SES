import type { PapelSignatario } from '../../generated/prisma/enums.js';
import type { MensagemEmail } from '../../email/email.types.js';

// Templates em texto puro. A troca por HTML/provedor na Sprint 4 fica aqui,
// sem mexer no fluxo do AssinaturasService.
type Conteudo = Omit<MensagemEmail, 'para'>;

const PAPEL: Record<PapelSignatario, string> = {
  REPRESENTANTE_UNDB: 'representante da UNDB',
  SUPERVISOR: 'supervisor(a) do estágio',
  DIRETOR_ESP: 'diretor(a) da ESP-MA',
  ESTAGIARIO: 'estagiário(a)',
};

// O Maranhão usa o fuso de Fortaleza (UTC-3, sem horário de verão).
const dataHora = (data: Date) =>
  data.toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    dateStyle: 'short',
    timeStyle: 'short',
  });

export function emailLinkAssinatura(dados: {
  nome: string;
  papel: PapelSignatario;
  url: string;
  expiraEm: Date;
}): Conteudo {
  return {
    assunto: 'Termo de Compromisso de Estágio aguardando sua assinatura',
    texto: [
      `Olá, ${dados.nome}.`,
      '',
      `Você foi indicado(a) como ${PAPEL[dados.papel]} para assinar um Termo de ` +
        'Compromisso de Estágio (TCE) no sistema de estágios da SES-MA.',
      '',
      `Para ler e assinar o documento, acesse: ${dados.url}`,
      '',
      `O link é pessoal e vale até ${dataHora(dados.expiraEm)}. Ao abrir, você vai ` +
        'pedir um código de 6 dígitos, que chega neste e-mail.',
      '',
      'Se você não esperava esta mensagem, ignore-a.',
    ].join('\n'),
  };
}

export function emailCodigoOtp(dados: { nome: string; codigo: string; minutos: number }): Conteudo {
  return {
    assunto: `Código de verificação: ${dados.codigo}`,
    texto: [
      `Olá, ${dados.nome}.`,
      '',
      `Seu código para assinar o Termo de Compromisso de Estágio é: ${dados.codigo}`,
      '',
      `Ele vale por ${dados.minutos} minutos. Não compartilhe este código com ninguém.`,
      '',
      'Se você não pediu este código, ignore esta mensagem.',
    ].join('\n'),
  };
}
