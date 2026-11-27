import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarioUtil,
  diaLocal,
  inicioDoDia,
  lerFeriadosExtras,
  somarDias,
} from '../../common/dias-uteis.js';
import { StatusProcesso } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AssinaturasService,
  type SignatarioParaLembrete,
} from '../assinaturas/assinaturas.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';

// Padrões: lembrete a cada 2 dias úteis sem assinatura, no máximo 5 por signatário.
const DIAS_UTEIS_PADRAO = 2;
const MAXIMO_PADRAO = 5;

export type ResultadoLembretes =
  | { executado: false; motivo: 'dia_nao_util'; dia: string }
  | { executado: true; dia: string; enviados: number; falhas: number };

// Cron diário de lembretes (Sprint 4): signatário de processo em
// aguardando_assinaturas que não assinou há N dias úteis recebe um lembrete.
// A contagem parte do último contato (link ou lembrete) e desconta fins de
// semana e feriados. Pode rodar mais de uma vez no dia (node-cron e o workflow
// do GitHub Actions): a trava no UPDATE garante um e-mail só.
@Injectable()
export class LembretesService {
  private readonly logger = new Logger(LembretesService.name);
  private readonly calendario: CalendarioUtil;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assinaturas: AssinaturasService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {
    this.calendario = new CalendarioUtil(this.feriadosExtras());
  }

  // Erro de digitação na variável não derruba a API: vai para o log, e o
  // calendário fica só com os feriados fixos.
  private feriadosExtras(): string[] {
    try {
      return lerFeriadosExtras(this.config.get<string>('FERIADOS_EXTRAS'));
    } catch (erro) {
      this.logger.error(erro instanceof Error ? erro.message : String(erro));
      return [];
    }
  }

  async executar(agora = new Date()): Promise<ResultadoLembretes> {
    const hoje = diaLocal(agora);
    // Fim de semana e feriado: ninguém recebe lembrete, e o dia não conta.
    if (!this.calendario.ehDiaUtil(hoje)) {
      return { executado: false, motivo: 'dia_nao_util', dia: hoje };
    }

    // Último contato até o fim do dia útil que fica N dias úteis antes de hoje.
    const diasUteis = this.numero('LEMBRETE_ASSINATURA_DIAS_UTEIS', DIAS_UTEIS_PADRAO);
    const diaLimite = this.calendario.voltarDiasUteis(hoje, diasUteis);
    const limite = inicioDoDia(somarDias(diaLimite, 1));
    // O link atual que vale até o fim do dia do próximo lembrete não é trocado.
    const proximoLembrete = this.calendario.avancarDiasUteis(hoje, diasUteis);
    const manterLinkAte = inicioDoDia(somarDias(proximoLembrete, 1));

    const pendentes = await this.prisma.signatario.findMany({
      where: {
        assinatura: { is: null },
        documento: { processo: { status: StatusProcesso.aguardando_assinaturas } },
        lembretesEnviados: { lt: this.numero('LEMBRETE_ASSINATURA_MAXIMO', MAXIMO_PADRAO) },
        AND: [
          { OR: [{ lembreteEnviadoEm: null }, { lembreteEnviadoEm: { lt: limite } }] },
          // Sem link enviado (representante da UNDB ou envio que falhou), conta
          // da criação do signatário, que é o início das assinaturas.
          {
            OR: [
              { linkEnviadoEm: { lt: limite } },
              { linkEnviadoEm: null, criadoEm: { lt: limite } },
            ],
          },
        ],
      },
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        lembreteEnviadoEm: true,
        linkEnviadoEm: true,
        tokenExpiraEm: true,
        otpExpiraEm: true,
        documento: { select: { processoId: true } },
      },
      orderBy: { criadoEm: 'asc' },
    });

    let enviados = 0;
    let falhas = 0;
    for (const signatario of pendentes) {
      const resultado = await this.lembrar(signatario, agora, manterLinkAte);
      if (resultado === 'enviado') enviados++;
      if (resultado === 'falha') falhas++;
    }
    if (pendentes.length > 0) {
      this.logger.log(`Lembretes de ${hoje}: ${enviados} enviados, ${falhas} falhas`);
    }
    return { executado: true, dia: hoje, enviados, falhas };
  }

  private async lembrar(
    signatario: SignatarioParaLembrete & {
      lembreteEnviadoEm: Date | null;
      documento: { processoId: string };
    },
    agora: Date,
    manterLinkAte: Date,
  ): Promise<'enviado' | 'falha' | 'ignorado'> {
    const { id, lembreteEnviadoEm: anterior } = signatario;
    // Trava: só quem muda a data que leu manda o e-mail. Uma execução
    // simultânea, ou uma assinatura feita neste meio-tempo, não passa.
    const { count } = await this.prisma.signatario.updateMany({
      where: { id, lembreteEnviadoEm: anterior, assinatura: { is: null } },
      data: { lembreteEnviadoEm: agora, lembretesEnviados: { increment: 1 } },
    });
    if (count === 0) return 'ignorado';

    let linkNovo: boolean;
    try {
      ({ linkNovo } = await this.assinaturas.enviarLembrete(signatario, manterLinkAte, agora));
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar o lembrete ao signatário ${id}`,
        erro instanceof Error ? erro.stack : String(erro),
      );
      // Devolve a vez: a próxima execução tenta de novo.
      try {
        await this.prisma.signatario.updateMany({
          where: { id, lembreteEnviadoEm: agora },
          data: { lembreteEnviadoEm: anterior, lembretesEnviados: { decrement: 1 } },
        });
      } catch (falha) {
        this.logger.error(`Lembrete do signatário ${id} ficou marcado sem envio`, falha);
      }
      return 'falha';
    }

    // E-mail já saiu: falha na auditoria só vai para o log.
    try {
      await this.prisma.$transaction((tx) =>
        this.auditoria.registrar(
          tx,
          {},
          {
            acao: 'LEMBRETE',
            entidade: 'signatario',
            entidadeId: id,
            dadosDepois: {
              papel: signatario.papel,
              processoId: signatario.documento.processoId,
              linkNovo,
            },
          },
        ),
      );
    } catch (falha) {
      this.logger.error(`Lembrete do signatário ${id} enviado sem auditoria`, falha);
    }
    return 'enviado';
  }

  private numero(variavel: string, padrao: number): number {
    const valor = Number(this.config.get<string>(variavel) ?? padrao);
    return Number.isInteger(valor) && valor > 0 ? valor : padrao;
  }
}
