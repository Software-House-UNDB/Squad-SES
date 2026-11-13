import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VARIAVEIS_OBRIGATORIAS = [
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

// Funciona com o MinIO local e com o Backblaze B2, os dois pela API S3.
// O cliente nasce no primeiro uso: sem as variáveis S3_* a API sobe
// normalmente e só as rotas de documentos respondem 503.
@Injectable()
export class StorageService {
  private cliente?: S3Client;

  constructor(private readonly config: ConfigService) {}

  async enviar(chave: string, conteudo: Buffer, mimeType: string, hashSha256: string) {
    await this.obterCliente().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: conteudo,
        ContentType: mimeType,
        Metadata: { sha256: hashSha256 },
      }),
    );
  }

  async remover(chave: string) {
    await this.obterCliente().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  // O bucket é privado: o navegador só baixa o arquivo por esta URL, que expira.
  urlAssinada(chave: string, nomeArquivo: string, mimeType: string, segundos: number) {
    const comando = new GetObjectCommand({
      Bucket: this.bucket,
      Key: chave,
      ResponseContentType: mimeType,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
    });
    return getSignedUrl(this.obterCliente(), comando, { expiresIn: segundos });
  }

  private get bucket(): string {
    return this.config.getOrThrow<string>('S3_BUCKET');
  }

  private obterCliente(): S3Client {
    if (this.cliente) return this.cliente;

    const faltando = VARIAVEIS_OBRIGATORIAS.filter((nome) => !this.config.get(nome));
    if (faltando.length > 0) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado');
    }

    this.cliente = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT') || undefined,
      region: this.config.get('S3_REGION'),
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE') === 'true',
      credentials: {
        accessKeyId: this.config.getOrThrow('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow('S3_SECRET_ACCESS_KEY'),
      },
      // O SDK passou a mandar checksums CRC32 por padrão, e o B2 recusa
      // parte desses cabeçalhos. Só envia quando a operação exige.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.cliente;
  }
}
