import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Rejeita campos inválidos ou desconhecidos em todas as rotas
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

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