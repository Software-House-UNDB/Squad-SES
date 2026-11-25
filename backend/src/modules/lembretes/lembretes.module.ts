import { Module } from '@nestjs/common';
import { AssinaturasModule } from '../assinaturas/assinaturas.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { LembretesAgendador } from './lembretes.agendador.js';
import { LembretesController } from './lembretes.controller.js';
import { LembretesService } from './lembretes.service.js';

@Module({
  imports: [AssinaturasModule, AuditoriaModule],
  controllers: [LembretesController],
  providers: [LembretesService, LembretesAgendador],
})
export class LembretesModule {}
