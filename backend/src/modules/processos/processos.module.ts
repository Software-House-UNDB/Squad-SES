import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { EstagiariosController } from './estagiarios.controller.js';
import { EstagiariosService } from './estagiarios.service.js';
import { ProcessosController } from './processos.controller.js';
import { ProcessosService } from './processos.service.js';

@Module({
  imports: [AuditoriaModule, StorageModule],
  controllers: [ProcessosController, EstagiariosController],
  providers: [ProcessosService, EstagiariosService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
