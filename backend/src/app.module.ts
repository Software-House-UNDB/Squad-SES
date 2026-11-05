import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProcessosModule } from './modules/processos/processos.module.js';
import { DocumentosModule } from './modules/documentos/documentos.module.js';
import { AssinaturasModule } from './modules/assinaturas/assinaturas.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ProcessosModule,
    DocumentosModule,
    AssinaturasModule,
    AuditoriaModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
