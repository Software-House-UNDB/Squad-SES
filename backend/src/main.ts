import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { origensPermitidas } from './cors.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // O Render fica atrás de um proxy: sem isso, todo request parece vir do IP
  // do proxy (importa para o rate limiting da #34 e para as evidências de assinatura).
  app.set('trust proxy', 1);

  // Só os sites em CORS_ORIGIN podem chamar a API pelo navegador. A autenticação
  // é por header Authorization (não por cookie), por isso não liga credentials.
  const origens = origensPermitidas(process.env.CORS_ORIGIN);
  if (origens.length > 0) {
    app.enableCors({ origin: origens });
  }

  // Rejeita campos inválidos ou desconhecidos em todas as rotas
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Documentação automática em http://localhost:3000/docs
  const config = new DocumentBuilder()
    .setTitle('API Squad-SES')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
