import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cron, { type ScheduledTask } from 'node-cron';
import { FUSO_MARANHAO } from '../../common/dias-uteis.js';
import { LembretesService } from './lembretes.service.js';

// 08:30 em São Luís, de segunda a sexta. O workflow do GitHub Actions chama a
// rota interna às 08:00; se a API estiver acordada, o node-cron roda de novo
// e não acha nada (o job é idempotente). Feriados são pulados pelo próprio job.
export const HORARIO_LEMBRETES = '30 8 * * 1-5';

@Injectable()
export class LembretesAgendador implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LembretesAgendador.name);
  private tarefa?: ScheduledTask;

  constructor(
    private readonly lembretes: LembretesService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    // Desligado nos testes e quando LEMBRETES_CRON=desligado (ex.: mais de
    // uma instância da API; o workflow continua disparando).
    if (process.env.NODE_ENV === 'test' || this.config.get('LEMBRETES_CRON') === 'desligado') {
      return;
    }
    this.tarefa = cron.schedule(HORARIO_LEMBRETES, () => this.rodar(), {
      name: 'lembretes',
      timezone: FUSO_MARANHAO,
      noOverlap: true,
    });
  }

  async onApplicationShutdown() {
    await this.tarefa?.destroy();
  }

  async rodar() {
    try {
      await this.lembretes.executar();
    } catch (erro) {
      this.logger.error(
        'Falha no job de lembretes',
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }
}
