# Como contribuir — Sistema SES-UNDB

Guia curto para a Software House UNDB. Qualquer dúvida, Tech Lead (Rondineli) ou Scrum Master (Akira) no grupo.

## Pré-requisitos

- Node.js 20 LTS (`node -v`)
- npm 10+ (`npm -v`)
- Docker Desktop (para Postgres e MinIO locais)
- Git

## Setup inicial (1x)

```bash
git clone https://github.com/Software-House-UNDB/Squad-SES.git
cd Squad-SES
git checkout dev
npm install
cp backend/.env.example backend/.env
npm run db:up
```

Checar se subiu:
- API Postgres: `localhost:5432` (user `postgres` / senha `postgres` / db `ses_dev`)
- Console MinIO: http://localhost:9001 (user `minioadmin` / senha `minioadmin`)

## Rodando

```bash
# Em terminais separados
npm run dev --workspace=backend
npm run dev --workspace=frontend
```

## Fluxo de trabalho (branches)

**Branch de integração: `dev`.** `main` é só produção/homologação.

```bash
git checkout dev
git pull
git checkout -b feature/<descricao-curta>
# ... codar ...
git commit -m "feat: adiciona upload de documento com hash"
git push -u origin feature/<descricao-curta>
```

Abra PR para `dev`. Aguarde:
- 1 review aprovado (CODEOWNER da área)
- CI verde

Trunk-based: PRs pequenos, merge rápido, nada de branch longa.

## Conventional Commits (obrigatório no título do PR)

| Prefixo    | Quando usar                                    |
|------------|------------------------------------------------|
| `feat:`    | Nova funcionalidade visível pro usuário        |
| `fix:`     | Bug fix                                        |
| `chore:`   | Mudança de infra/config/deps (sem feature)     |
| `docs:`    | Só documentação                                |
| `refactor:`| Mudança de código sem mudar comportamento      |
| `test:`    | Adiciona ou corrige testes                     |
| `style:`   | Formatação, sem mudar lógica                   |

Exemplo: `feat(backend): endpoint POST /processos/:id/documentos`

## Antes de abrir o PR

```bash
npm run lint
npm run test
npm run format
```

Se mexeu no schema do Prisma:

```bash
cd backend
npx prisma migrate dev --name descricao_da_mudanca
```

Commitar a pasta `prisma/migrations/`.

## CODEOWNERS

Revisão obrigatória pela área que você mexeu:

- `/backend/` → William + Victor
- `/frontend/` → Helio + Luis Felipe + Renan
- `/docker-compose.yml`, `/backend/prisma/` → Rondineli + Akira
- `/.github/` → Akira

## O que NÃO commitar

- `.env` (use `.env.example` como referência)
- `node_modules/`, `dist/`, `build/`
- Secrets, tokens, credenciais

## Dúvidas comuns

**CI quebrou e eu não entendo o erro:** chama Akira (CI/CD).
**Prisma tá reclamando de drift no banco:** `npm run db:reset` (apaga volumes, sobe do zero).
**oxlint tá brigando:** roda `npm run format` e tenta de novo; se persistir, chama o CODEOWNER da área.
