import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Sem env() do Prisma: ele falha sem DATABASE_URL, e o CI roda
    // `prisma generate` sem banco configurado.
    url: process.env.DATABASE_URL ?? '',
  },
});
