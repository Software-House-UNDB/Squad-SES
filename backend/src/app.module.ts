import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProcessosModule } from './modules/processos/processos.module.js';
import { DocumentosModule } from './modules/documentos/documentos.module.js';
import { AssinaturasModule } from './modules/assinaturas/assinaturas.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';

@Module({
  imports: [AuthModule, ProcessosModule, DocumentosModule, AssinaturasModule, AuditoriaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
