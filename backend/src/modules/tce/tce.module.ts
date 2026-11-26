import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { RenderizadorPdfService } from './renderizador-pdf.service.js';
import { TceController } from './tce.controller.js';
import { TceService } from './tce.service.js';

@Module({
  imports: [AuditoriaModule, StorageModule],
  controllers: [TceController],
  providers: [TceService, RenderizadorPdfService],
})
export class TceModule {}
