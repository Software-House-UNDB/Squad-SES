import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module.js';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AssinaturasController } from './assinaturas.controller.js';
import { AssinaturasService } from './assinaturas.service.js';

@Module({
  imports: [AuditoriaModule, EmailModule, StorageModule],
  controllers: [AssinaturasController],
  providers: [AssinaturasService],
  // A transição aprovado -> aguardando_assinaturas chama criarSignatarios() e enviarLinks().
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
