import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { EstagiariosController } from './estagiarios.controller.js';
import { EstagiariosService } from './estagiarios.service.js';
import { ProcessosController } from './processos.controller.js';
import { ProcessosService } from './processos.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [ProcessosController, EstagiariosController],
  providers: [ProcessosService, EstagiariosService],
})
export class ProcessosModule {}
