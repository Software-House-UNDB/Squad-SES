import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNotEmpty, IsString, Matches } from 'class-validator';

const MENSAGEM_ACEITE = 'é preciso marcar "Li e concordo" para assinar';

// Aceite explícito ("Li e concordo"), exigido pelo RF-15.
class ComAceite {
  @ApiProperty({ example: true, description: 'Marcação de "Li e concordo"' })
  @Equals(true, { message: MENSAGEM_ACEITE })
  aceite: true;
}

export class AssinarPorLinkDto extends ComAceite {
  @ApiProperty({ example: '012345', description: 'Código de 6 dígitos enviado por e-mail' })
  @Matches(/^\d{6}$/, { message: 'código deve ter 6 dígitos' })
  codigo: string;
}

export class AssinarLogadoDto extends ComAceite {
  @ApiProperty({ description: 'Senha do representante, confirmada no ato da assinatura' })
  @IsString({ message: 'senha é obrigatória' })
  @IsNotEmpty({ message: 'senha é obrigatória' })
  senha: string;
}
