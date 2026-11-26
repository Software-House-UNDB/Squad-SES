// Roda antes de cada arquivo de integração (setupFiles do vitest.config.e2e.ts),
// antes de qualquer import do AppModule.
//
// Os testes gravam no banco (usuários, processos, auditoria) e não apagam nada:
// a auditoria e as assinaturas são append-only, nem TRUNCATE passa. Por isso
// exigem um banco descartável, numa variável própria: o backend/.env pode
// apontar para o Neon, e o PrismaService o carrega.
const url = process.env.DATABASE_URL_TESTE;
if (!url) {
  throw new Error(
    'Defina DATABASE_URL_TESTE com um Postgres local e descartável, ex.: ' +
      'postgresql://postgres:postgres@localhost:5432/ses_teste',
  );
}

// Hosts locais (docker compose, service do CI). Outro host só com
// INTEGRACAO_HOST_PERMITIDO igual a ele, de propósito.
const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '[::1]', 'postgres'];
const host = new URL(url).hostname;
if (!HOSTS_LOCAIS.includes(host) && process.env.INTEGRACAO_HOST_PERMITIDO !== host) {
  throw new Error(
    `DATABASE_URL_TESTE aponta para "${host}". Os testes de integração só rodam em banco ` +
      'local (defina INTEGRACAO_HOST_PERMITIDO se for mesmo um banco descartável).',
  );
}

process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'integracao-access-secret-bem-longo';
process.env.JWT_REFRESH_SECRET = 'integracao-refresh-secret-bem-longo';
process.env.CORS_ORIGIN = '';
