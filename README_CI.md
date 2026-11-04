# Setup da Sprint 0 — Squad-SES

Guia pro time entender o pipeline, o monorepo e a hospedagem proposta. Qualquer dúvida de CI/CD: Akira. Qualquer dúvida de infra (docker, migrations, env): Rondineli.

## Decisões fechadas (Sprint 0)

| Item | Decisão | Fonte |
|---|---|---|
| Monorepo | `backend/` + `frontend/` na raiz, com npm workspaces | Rondineli (Q1) + Akira |
| Package manager | npm | Rondineli (Q4) |
| Node | 20 LTS | Rondineli (Q5) |
| Lint | **oxlint** (back e front) | Rondineli (Q3) — já é o lint do frontend hoje |
| Branch de integração | `dev` | repo real (Rondineli respondeu `develop` na Q6, mas o repo já tem `dev` — manter `dev` até Rondineli decidir renomear) |
| Estratégia de branch | trunk-based, `feature/<nome>` | Rondineli (Q7, Q9) |
| Protection | 1 review + CI verde + sem force-push | Rondineli (Q8) |
| Commits | Conventional Commits | Rondineli (Q10) |
| CI dispara em | PR + push em `dev`/`main` | Akira |
| Framework teste | Jest (back e front) | Rondineli (Q15) |
| Coverage tool | Nenhum na Sprint 0 | Rondineli (Q16) |
| Playwright | Entra na Sprint 1 | Rondineli (Q17) |
| Docker tags | `latest` (não fixas) | Rondineli (Q18) |
| Credenciais dev | `postgres/postgres`, `minioadmin/minioadmin` | Rondineli (Q20) |
| MailHog/Mailpit | Não | Rondineli (Q22) |
| Husky | Não | Rondineli (Q27) |
| Hospedagem | **Vercel** (front) + **Render free** (back) + **Neon** (Postgres) + **Cloudflare R2** (storage prod) | Akira |

## Por que oxlint e não ESLint

O frontend das branches `feature/*` já usa oxlint (`.oxlintrc.json`, script `"lint": "oxlint"`). Para manter coerência e não forçar o time a aprender duas ferramentas, o backend NestJS também vai usar oxlint — o boilerplate do `nest new` vem com ESLint, mas trocamos por oxlint no setup.

**oxlint** é o linter do projeto Oxc (Rust). Prós: ~50-100x mais rápido que ESLint; zero config pra maioria dos casos. Contras: ainda não cobre 100% das regras do ESLint — pra o que precisamos agora (sintaxe, unused vars, imports), cobre folgado.

## Hospedagem — detalhes

Tudo em free tier. Sem custo até alguém decidir escalar.

| Serviço | Papel | Plano | Nota |
|---|---|---|---|
| Vercel | Frontend Vite | Hobby (free) | Deploy automático por PR com preview URL |
| Render | Backend NestJS | Free Web Service | Dorme após 15min inativo (cold start ~30s). Se virar problema na homologação (01–07/12), migrar pra Fly.io |
| Neon | Postgres gerenciado | Free (0.5GB) | Serverless, branching por PR combina com Prisma |
| Cloudflare R2 | Storage S3 em prod | Free (10GB + 10M req/mês) | API S3-compatível, substitui MinIO só em prod |
| MinIO | Storage dev local | Container docker | Continua sendo o storage em desenvolvimento |

**Impacto no docx**: o docx menciona MinIO em prod. A proposta aqui é usar R2 em prod (mesma API S3) e manter MinIO só em dev. Isso **não** muda nenhum requisito funcional nem viola a Portaria 1327 — ainda é storage S3-compatível. Precisa confirmar com Rondineli e professor.

## Estrutura do monorepo

```
Squad-SES/
├── .github/
│   ├── workflows/ci.yml
│   ├── ISSUE_TEMPLATE/
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── backend/              # NestJS + Prisma (gerado via `nest new`)
├── frontend/             # React 19 + Vite 8 (migrado das branches feature/*)
├── docker-compose.yml    # Postgres + MinIO para dev local
├── package.json          # Workspaces root
├── CONTRIBUTING.md
├── README.md
└── README_CI.md          # este arquivo
```

O `package.json` da raiz declara `"workspaces": ["backend", "frontend"]`. Um único `npm install` na raiz instala as deps dos dois workspaces. Scripts da raiz propagam via `--workspaces --if-present`.

## Pipeline do CI

Quatro jobs no `.github/workflows/ci.yml`:

1. **`changes`**: usa `dorny/paths-filter` pra detectar o que foi modificado no PR. Se mudou só `backend/**`, o job do frontend nem roda (economiza minutos do GitHub Actions free).
2. **`backend`**: sobe um Postgres 16 como service container, instala deps, roda `prisma generate`, `prisma migrate deploy`, `oxlint`, `build`, `jest`.
3. **`frontend`**: instala deps, roda `oxlint`, `vite build`, `jest`.
4. **`CI OK`**: job agregador. É o único check required na branch protection — se o backend/frontend nem rodaram (porque path filter os pulou), ele considera OK. Se algum falhou, ele falha também.

## Secrets do GitHub (adicionar depois do PR de setup)

Settings → Secrets and variables → Actions → New repository secret. Responsável: Akira.

Secrets provisórios (podem subir só quando os serviços forem provisionados):

- `DATABASE_URL_STAGING` — string de conexão Neon
- `RENDER_DEPLOY_HOOK` — URL do webhook Render
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — se for usar GH Actions pra deploy em vez do GitHub app do Vercel
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — Cloudflare R2

Deploy de staging **ainda não está no `ci.yml`** — adicionar quando a hospedagem estiver provisionada. Vercel e Render preferem integração via GitHub App (instala pelo painel, não precisa de secret).

## Protection da branch (ativar depois do primeiro merge)

Settings → Branches → Add branch protection rule:

**Para `dev`:**
- Branch name pattern: `dev`
- ☑ Require a pull request before merging
  - ☑ Require approvals: 1
  - ☑ Dismiss stale pull request approvals when new commits are pushed
  - ☑ Require review from Code Owners
- ☑ Require status checks to pass before merging
  - ☑ Require branches to be up to date
  - Status checks: `CI OK`
- ☑ Require conversation resolution before merging
- ☐ Allow force pushes (desligado)
- ☐ Allow deletions (desligado)

Mesma coisa para `main`.

## Comandos úteis (raiz do repo)

```bash
# Setup inicial (1x)
npm install

# Subir Postgres + MinIO
npm run db:up

# Derrubar
npm run db:down

# Reset completo (apaga volumes)
npm run db:reset

# Rodar o que o CI roda
npm run lint
npm run build
npm run test
npm run format:check

# Formatar tudo
npm run format
```

## Divergências entre docx e repo (pra Rondineli confirmar)

1. **Branch de integração**: docx não especifica, Rondineli respondeu `develop` na Q6, repo tem `dev`. Mantido `dev`.
2. **Frontend em JavaScript, não TypeScript**: branches `feature/*` usam `.jsx` puro. Docx sugere TypeScript. Mantido JS por enquanto (não é bloqueador do MVP); se migrar, é tarefa de Sprint futura.
3. **ESLint → oxlint**: docx não entra nesse nível. Rondineli respondeu ESLint na Q3 mas o repo já usa oxlint. Mantido oxlint (coerência com código existente).
4. **Storage prod**: docx = MinIO; proposta = Cloudflare R2 em prod, MinIO só em dev.
