import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module.js';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AssinaturasController } from './assinaturas.controller.js';
import { AssinaturasService } from './assinaturas.service.js';
import { ValidacaoController } from './validacao.controller.js';
import { ValidacaoService } from './validacao.service.js';

@Module({
  imports: [AuditoriaModule, EmailModule, StorageModule],
  controllers: [AssinaturasController, ValidacaoController],
  providers: [AssinaturasService, ValidacaoService],
  // A máquina de estados (#55) chama iniciarAssinaturas() na transição
  // aprovado -> aguardando_assinaturas.
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
