import { Module } from '@nestjs/common';
import { AssinaturasController } from './assinaturas.controller.js';
import { AssinaturasService } from './assinaturas.service.js';

@Module({
  controllers: [AssinaturasController],
  providers: [AssinaturasService],
})
export class AssinaturasModule {}
