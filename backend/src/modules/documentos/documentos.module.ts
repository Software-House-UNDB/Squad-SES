import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ProcessosModule } from '../processos/processos.module.js';
import { DocumentosController } from './documentos.controller.js';
import { DocumentosService } from './documentos.service.js';

@Module({
  imports: [AuditoriaModule, ProcessosModule, StorageModule],
  controllers: [DocumentosController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
