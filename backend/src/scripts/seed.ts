// Cria (ou atualiza) um usuário de cada perfil para testar o login.
// Uso, na raiz do projeto:
//   npm run build --workspace=backend
//   npm run seed --workspace=backend
// Lê DATABASE_URL e SEED_SENHA do backend/.env. Rodar de novo atualiza os usuários (inclusive a senha).
import { hash } from '@node-rs/argon2';
import { Perfil } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const USUARIOS = [
  {
    nome: 'Coordenação SES (teste)',
    email: 'coordenacao@ses.ma.gov.br',
    perfil: Perfil.COORDENACAO_SES,
    instituicao: 'SES-MA',
  },
  {
    nome: 'Representante UNDB (teste)',
    email: 'representante@undb.edu.br',
    perfil: Perfil.REPRESENTANTE_UNDB,
    instituicao: 'UNDB',
  },
];

// O PrismaService já carrega o backend/.env (import 'dotenv/config').
const prisma = new PrismaService();

const senha = process.env.SEED_SENHA;
if (!senha) {
  throw new Error('Defina SEED_SENHA no backend/.env antes de rodar o seed.');
}

try {
  const senhaHash = await hash(senha);
  for (const usuario of USUARIOS) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      create: { ...usuario, senhaHash },
      // Atualiza tudo: o que está neste arquivo é o que fica no banco.
      update: { ...usuario, senhaHash },
    });
    console.log(`ok: ${usuario.email} (${usuario.perfil})`);
  }
} finally {
  await prisma.$disconnect();
}
