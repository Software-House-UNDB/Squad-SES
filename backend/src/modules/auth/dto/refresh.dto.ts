import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'refreshToken recebido no login' })
  @IsString({ message: 'refreshToken inválido' })
  @IsNotEmpty({ message: 'refreshToken obrigatório' })
  refreshToken: string;
}
