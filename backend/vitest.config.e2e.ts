import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Testes de integração: API inteira (AppModule + ValidationPipe) contra um
// Postgres real. Ver test/integracao/ambiente.ts: exige DATABASE_URL_TESTE.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/integracao/ambiente.ts'],
    // Um arquivo por vez: todos usam o mesmo banco.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
