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

// Lembrete do cron quando o link atual vence antes do próximo lembrete (ou
// nunca chegou): o link é novo e o anterior deixa de valer, então o texto diz isso.
export function emailLembreteAssinatura(dados: {
  nome: string;
  papel: PapelSignatario;
  url: string;
  expiraEm: Date;
}): Conteudo {
  return {
    assunto: 'Lembrete: Termo de Compromisso de Estágio aguardando sua assinatura',
    texto: [
      `Olá, ${dados.nome}.`,
      '',
      `O Termo de Compromisso de Estágio (TCE) em que você é ${PAPEL[dados.papel]} ` +
        'ainda aguarda a sua assinatura no sistema de estágios da SES-MA.',
      '',
      `Para ler e assinar o documento, acesse: ${dados.url}`,
      '',
      `Este é o seu link atual: ele vale até ${dataHora(dados.expiraEm)}, e os links ` +
        'de e-mails anteriores deixaram de valer. Ao abrir, você vai pedir um código ' +
        'de 6 dígitos, que chega neste e-mail.',
      '',
      'Se você não esperava esta mensagem, ignore-a.',
    ].join('\n'),
  };
}

// Lembrete do cron quando o link do e-mail anterior ainda vale até o próximo
// lembrete: o token não muda (uma falha de envio não derruba o link antigo, e
// quem está no meio do código não perde o link), então o e-mail não leva URL.
export function emailLembreteMesmoLink(dados: {
  nome: string;
  papel: PapelSignatario;
  expiraEm: Date;
}): Conteudo {
  return {
    assunto: 'Lembrete: Termo de Compromisso de Estágio aguardando sua assinatura',
    texto: [
      `Olá, ${dados.nome}.`,
      '',
      `O Termo de Compromisso de Estágio (TCE) em que você é ${PAPEL[dados.papel]} ` +
        'ainda aguarda a sua assinatura no sistema de estágios da SES-MA.',
      '',
      'Para ler e assinar o documento, use o link do último e-mail de assinatura que ' +
        `você recebeu do sistema: ele continua valendo até ${dataHora(dados.expiraEm)}. ` +
        'Ao abrir, você vai pedir um código de 6 dígitos, que chega neste e-mail.',
      '',
      'Se não encontrar o e-mail ou o link não abrir, peça um novo link à coordenação ' +
        'de estágios da SES-MA.',
      '',
      'Se você não esperava esta mensagem, ignore-a.',
    ].join('\n'),
  };
}

// O representante da UNDB assina logado (com a senha), então o lembrete não
// leva link de assinatura, só o endereço do sistema.
export function emailLembreteRepresentante(dados: { nome: string; url: string }): Conteudo {
  return {
    assunto: 'Lembrete: Termo de Compromisso de Estágio aguardando sua assinatura',
    texto: [
      `Olá, ${dados.nome}.`,
      '',
      'Um Termo de Compromisso de Estágio (TCE) em que você é o(a) representante da ' +
        'UNDB ainda aguarda a sua assinatura no sistema de estágios da SES-MA.',
      '',
      `Entre no sistema com o seu login para assinar: ${dados.url}`,
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
