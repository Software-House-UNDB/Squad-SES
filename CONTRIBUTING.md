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
npm install   # usa .npmrc com legacy-peer-deps (necessário pra Vitest + Vite 8)
npm run db:up # sobe Postgres + MinIO (requer Docker Desktop rodando)
```

Checar se subiu:
- Postgres: `localhost:5432` (user `postgres` / senha `postgres` / db `ses_dev`)
- Console MinIO: http://localhost:9001 (user `minioadmin` / senha `minioadmin`)

> **Nota**: copie o arquivo de ambiente antes de rodar o backend: `cp backend/.env.example backend/.env`.

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

> **Branch protection ainda não está ativada** (pendente — plano Free do GitHub não libera em repos privados; ver `README_CI.md` seção Protection). Enquanto isso, respeite o fluxo por convenção: **ninguém mergeia direto em `dev` ou `main` sem PR + review**.

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

Revisão obrigatória pela área que você mexeu (quando branch protection ativar):

- `/backend/` → William (`@wirsokk`) + Victor (`@vikviktorr`)
- `/frontend/` → Helio (`@heliolevi`) + Luis Felipe (`@luiscstro`) + Renan (`@renanpires`)
- `/docker-compose.yml`, `/backend/prisma/` → Rondineli + Akira (`@AkiraGitDev`)
- `/.github/` → Akira (`@AkiraGitDev`)

> Handle do Rondineli no `CODEOWNERS` ainda é placeholder (`@rondineli-handle`). Ele troca pro real quando puder.

## O que NÃO commitar

- `.env` (use `.env.example` como referência)
- `node_modules/`, `dist/`, `build/`
- Secrets, tokens, credenciais

## Dúvidas comuns

**CI quebrou e eu não entendo o erro:** chama Akira (CI/CD).

**`npm install` quebra com `Cannot read properties of null (reading 'edgesOut')`:** falta o `.npmrc` com `legacy-peer-deps=true` na raiz — deveria vir no clone. Se deletou por engano, recrie com essa linha e rode de novo.

**Prisma tá reclamando de drift no banco:** `npm run db:reset` (apaga volumes do docker-compose, sobe do zero).

**oxlint tá brigando:** roda `npm run format` e tenta de novo; se persistir, chama o CODEOWNER da área.
