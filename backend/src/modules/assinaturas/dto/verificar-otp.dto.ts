import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class VerificarOtpDto {
  @ApiProperty({ example: '012345', description: 'Código de 6 dígitos enviado por e-mail' })
  @Matches(/^\d{6}$/, { message: 'código deve ter 6 dígitos' })
  codigo: string;
}
