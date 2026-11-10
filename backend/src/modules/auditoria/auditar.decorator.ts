import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import {
  AUDITAR_CHAVE,
  AuditoriaInterceptor,
  type OpcoesAuditar,
} from './auditoria.interceptor.js';

/**
 * Registra a ação na trilha de auditoria quando o handler conclui com sucesso.
 * O módulo que usa o decorator precisa importar o AuditoriaModule.
 *
 * @example
 * @Auditar({ entidade: 'documento' })
 * @Post()
 * enviar() {}
 */
export const Auditar = (opcoes: OpcoesAuditar) =>
  applyDecorators(SetMetadata(AUDITAR_CHAVE, opcoes), UseInterceptors(AuditoriaInterceptor));
