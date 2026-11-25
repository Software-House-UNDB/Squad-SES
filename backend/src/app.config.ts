import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { origensPermitidas } from './cors.js';

// Configuração comum ao main.ts e aos testes de integração: o teste passa
// pelo mesmo ValidationPipe, CORS e trust proxy que a API em produção.
export function configurarApp(app: NestExpressApplication) {
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
}
