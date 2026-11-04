# Squad-SES — Sistema de Gestão de Documentação de Estagiários SES-MA ↔ UNDB

Projeto piloto da Software House UNDB para digitalizar o fluxo de documentação de estagiários entre a Secretaria de Estado da Saúde do Maranhão (SES-MA) e a UNDB. Entrega prevista para a 1ª semana de dezembro de 2026.

## Status

Sprint 0 em andamento (27/10 – 02/11). Setup do monorepo, CI e docker-compose aplicados em `dev`. Veja o Daily Tracker no Google Sheets para o estado granular de cada entrega.

## Começar

Requer Node.js 20 LTS, npm 10+, Docker Desktop e GitHub CLI autenticado (`gh auth login`).

```bash
git clone https://github.com/Software-House-UNDB/Squad-SES.git
cd Squad-SES
npm install
npm run db:up
```

`npm install` usa `.npmrc` com `legacy-peer-deps=true` (necessário por conflito Vitest 4 x Vite 8). Após o setup inicial, rode os serviços em terminais separados:

```bash
npm run dev --workspace=backend
npm run dev --workspace=frontend
```

Credenciais locais:
- Postgres: `localhost:5432` (`postgres`/`postgres`, database `ses_dev`)
- Console MinIO: http://localhost:9001 (`minioadmin`/`minioadmin`)

## Estrutura

Monorepo com npm workspaces:

```
Squad-SES/
├── backend/    # NestJS 12 + Vitest + oxlint (Prisma: pendente)
├── frontend/   # React 19 + Vite 8 + oxlint
├── .github/    # CI workflow, CODEOWNERS, templates de PR/issue
├── docker-compose.yml
├── CONTRIBUTING.md    # Fluxo de branch, convenções, dúvidas comuns
└── README_CI.md       # Decisões, pipeline, hospedagem, protection
```

## Branches

- **`dev`** — branch de integração. Toda feature entra por PR aqui. É a default do repo.
- **`main`** — branch de produção/homologação. Recebe merge de `dev` apenas no final de cada sprint (promoção estável). Hoje está vazia por design — vai receber conteúdo quando houver a primeira versão mostrável para a coordenação SES.

## Como contribuir

Leia o [`CONTRIBUTING.md`](./CONTRIBUTING.md) antes de abrir o primeiro PR. Resumo:

- Branch a partir de `dev`: `feature/<descricao-curta>`
- Commits e título do PR em [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`
- CI (lint + build + test) precisa passar
- 1 revisão aprovada pelo CODEOWNER da área antes do merge

## Documentação

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — guia de contribuição
- [`README_CI.md`](./README_CI.md) — decisões de setup, pipeline de CI, hospedagem proposta, divergências
- Daily Tracker e cronograma — Google Sheets (acesso restrito ao time)
- Documento oficial do projeto — `Projeto_Software_Piloto_UNDB_SES-MA.docx` (fora do repo)

## Time

| Papel | Pessoa | GitHub |
|---|---|---|
| Professor / Tech Lead | Rondineli Seba | *(a definir)* |
| Scrum Master | Thiago Akira | [@AkiraGitDev](https://github.com/AkiraGitDev) |
| Backend | William | [@wirsokk](https://github.com/wirsokk) |
| Backend | Victor | [@vikviktorr](https://github.com/vikviktorr) |
| Fullstack | Hélio Levi | [@heliolevi](https://github.com/heliolevi) |
| Fullstack | Luís Felipe | [@luiscstro](https://github.com/luiscstro) |
| Frontend | Renan | [@renanpires](https://github.com/renanpires) |

## Stack

**Backend**: NestJS 12 · Prisma (a adicionar) · PostgreSQL 16 · MinIO (dev) / Cloudflare R2 (prod proposto) · Vitest · oxlint
**Frontend**: React 19 · Vite 8 · react-router-dom 7 · lucide-react · oxlint
**Infra**: Docker Compose · GitHub Actions · npm workspaces
