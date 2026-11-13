import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'coordenacao@ses.ma.gov.br' })
  // Sem espaços e em minúsculas, do mesmo jeito que o e-mail fica gravado no banco.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email inválido' })
  email: string;

  @ApiProperty({ example: 'Senha@2026' })
  @IsString({ message: 'senha inválida' })
  @IsNotEmpty({ message: 'senha obrigatória' })
  senha: string;
}
