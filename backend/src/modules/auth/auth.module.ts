import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  // global: o JwtService fica disponível nos outros módulos que usam o JwtAuthGuard.
  // Sem segredo padrão de propósito: cada chamada informa qual segredo usar (access ou refresh).
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
