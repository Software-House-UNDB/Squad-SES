import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'node:crypto';
import { LembretesService } from './lembretes.service.js';

const digest = (valor: string) => createHash('sha256').update(valor).digest();

// Compara em tempo constante; o hash iguala os tamanhos.
export function tokenConfere(autorizacao: string | undefined, esperado: string): boolean {
  const recebido = /^Bearer (.+)$/.exec(autorizacao ?? '')?.[1];
  return !!recebido && timingSafeEqual(digest(recebido), digest(esperado));
}

// Disparo externo do job diário (workflow agendado do GitHub Actions). No
// Render free a API dorme sem acesso, e o node-cron sozinho pode não rodar:
// esta chamada acorda a API e executa o job. Sem LEMBRETES_TOKEN a rota
// não existe (404). Fora do Swagger: não é API do produto.
@ApiExcludeController()
@Controller('interno/lembretes')
export class LembretesController {
  constructor(
    private readonly lembretes: LembretesService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  executar(@Headers('authorization') autorizacao?: string) {
    const esperado = this.config.get<string>('LEMBRETES_TOKEN');
    if (!esperado) throw new NotFoundException();
    if (!tokenConfere(autorizacao, esperado)) throw new UnauthorizedException();
    return this.lembretes.executar();
  }
}
