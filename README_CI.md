# Setup da Sprint 0 — Squad-SES

Guia pro time entender o pipeline, o monorepo e a hospedagem proposta. Qualquer dúvida de CI/CD: Akira. Qualquer dúvida de infra (docker, migrations, env): Rondineli.

> **Status**: Setup aplicado em `dev` via PR #4 em 04/11/2026. CI verde (changes + backend + frontend + CI OK). Branch protection **não ativada** — ver seção específica abaixo.

## Decisões fechadas (Sprint 0)

| Item | Decisão | Fonte |
|---|---|---|
| Monorepo | `backend/` + `frontend/` na raiz, com npm workspaces | Rondineli (Q1) + Akira |
| Package manager | npm | Rondineli (Q4) |
| Node | 20 LTS | Rondineli (Q5) |
| Lint | **oxlint** (back e front) | Rondineli (Q3) — já é o lint do frontend hoje |
| Branch de integração | `dev` | repo real (Rondineli respondeu `develop` na Q6, mas o repo já tem `dev` — manter `dev` até Rondineli decidir renomear) |
| Estratégia de branch | trunk-based, `feature/<nome>` | Rondineli (Q7, Q9) |
| Protection | 1 review + CI verde + sem force-push | Rondineli (Q8) — **bloqueado**: repo é privado no plano Free do GitHub. Opções na seção "Protection" abaixo |
| Commits | Conventional Commits | Rondineli (Q10) |
| CI dispara em | PR + push em `dev`/`main` | Akira |
| Framework teste | **Vitest** no backend (default do `nest new` moderno); frontend sem test runner por conflito de peer deps com Vite 8 — pendência | Rondineli (Q15) respondeu Jest, mas adaptamos ao default moderno |
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

1. **`changes`**: usa `dorny/paths-filter` pra detectar o que foi modificado no PR. Se mudou só `backend/**`, o job do frontend nem roda (economiza minutos do GitHub Actions free). Requer `permissions: pull-requests: read` no workflow.
2. **`backend`**: instala deps na raiz (`npm ci` com legacy-peer-deps), roda `oxlint`, `nest build`, `vitest run`. Steps `prisma generate` e `prisma migrate deploy` estão com `--if-present` — ativam automaticamente quando o Prisma for adicionado ao backend.
3. **`frontend`**: instala deps na raiz, roda `oxlint`, `vite build`. Step de teste com `--if-present` (frontend ainda não tem Vitest/Jest instalado).
4. **`CI OK`**: job agregador. É o único check required pra branch protection (quando ela for ativada) — se o backend/frontend nem rodaram porque o path filter os pulou, ele considera OK. Se `changes` ou qualquer um dos dois falhou, ele falha também.

## Dependências e `.npmrc`

O projeto tem um `.npmrc` com `legacy-peer-deps=true` na raiz. Isso é necessário porque:

- O backend NestJS traz **Vitest 4** (via `@vitest/coverage-v8`), que espera Vite 5–6
- O frontend usa **Vite 8** (versão nova)
- O resolvedor do npm 10 não consegue conciliar esses ranges num monorepo e dá `Cannot read properties of null (reading 'edgesOut')`

Com `legacy-peer-deps=true`, o npm ignora o conflito de peer e instala normalmente. Esse workaround vale pra dev e pro CI.

**Alternativa futura**: migrar o frontend pra Vite 6 ou subir o Vitest do backend pra uma versão que suporte Vite 8. Não é prioridade na Sprint 0.

## Secrets do GitHub (adicionar depois do PR de setup)

Settings → Secrets and variables → Actions → New repository secret. Responsável: Akira.

Secrets provisórios (podem subir só quando os serviços forem provisionados):

- `DATABASE_URL_STAGING` — string de conexão Neon
- `RENDER_DEPLOY_HOOK` — URL do webhook Render
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — se for usar GH Actions pra deploy em vez do GitHub app do Vercel
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — Cloudflare R2

Deploy de staging **ainda não está no `ci.yml`** — adicionar quando a hospedagem estiver provisionada. Vercel e Render preferem integração via GitHub App (instala pelo painel, não precisa de secret).

## Protection da branch — bloqueada no plano Free

**Status atual**: Tentativa de ativar via API em 04/11/2026 falhou com:

```
HTTP 403: Upgrade to GitHub Pro or make this repository public to enable this feature.
```

O GitHub só libera branch protection em repos privados nos planos **Pro/Team/Enterprise**. Em repos **públicos**, a feature é liberada no Free.

**Caminhos possíveis (decisão do Rondineli + professor)**:

1. **Tornar o repo público**. Projeto é acadêmico/piloto; não há informação sensível no código. Libera branch protection grátis e o resto segue como planejado. **Recomendação do Akira.**
2. **Upgrade pra GitHub Team** (US$4/mês por usuário). Caro pra projeto de faculdade.
3. **Operar sem protection**. O time respeita o fluxo de PR por convenção, mas tecnicamente qualquer um com write pode mergear direto em `dev`/`main`. Aceitável pra Sprint 0, perigoso pra homologação.

**Configuração a aplicar quando desbloqueado** (via Settings → Branches ou API):

Para `dev` e `main`:
- ☑ Require a pull request before merging
  - ☑ Require approvals: 1
  - ☑ Dismiss stale pull request approvals when new commits are pushed
  - ☑ Require review from Code Owners (**só ativar depois que o handle do Rondineli estiver no `CODEOWNERS`** — o fallback `*` ainda aponta pra `@rondineli-handle` fictício)
- ☑ Require status checks to pass before merging
  - ☑ Require branches to be up to date
  - Status checks: `CI OK`
- ☑ Require conversation resolution before merging
- ☐ Allow force pushes (desligado)
- ☐ Allow deletions (desligado)

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
3. **ESLint → oxlint**: Rondineli respondeu ESLint na Q3, mas o repo já usa oxlint e o `nest new` moderno também. Mantido oxlint (coerência com código existente, muito mais rápido).
4. **Jest → Vitest**: Rondineli respondeu Jest na Q15, mas o `nest new` moderno gera Vitest por default. Mantido Vitest no backend (API compatível com Jest — `describe`, `it`, `expect` iguais). Frontend sem test runner por conflito de peer deps com Vite 8 — adicionar numa task separada.
5. **Storage prod**: docx = MinIO; proposta = Cloudflare R2 em prod (mesma API S3), MinIO só em dev local.
6. **Branch protection**: planejada no docx; bloqueada pelo plano Free do GitHub (ver seção acima).

## Próximos passos (fora do PR de setup)

1. Rondineli passa o handle real dele pra substituir `@rondineli-handle` no `CODEOWNERS`
2. Decidir se o repo vira público (ou se operamos sem protection)
3. Adicionar Prisma ao backend (migrations do schema do docx — fase 1 das entidades)
4. Adicionar test runner no frontend (Vitest 3 compatível com Vite 8 ou Jest + babel)
5. Provisionar Vercel + Render + Neon + R2
6. Adicionar deploy no `ci.yml` (ou configurar via GitHub Apps do Vercel/Render)
7. Criar `backend/.env.example` com `DATABASE_URL`, `MINIO_*`, `JWT_SECRET`, etc.
