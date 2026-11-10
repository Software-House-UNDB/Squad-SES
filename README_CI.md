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
| Hospedagem | **Vercel** (front) + **Render free** (back) + **Neon** (Postgres) + **Backblaze B2** (storage prod) | Akira (confirmado pelo time em 09/11) |

## Por que oxlint e não ESLint

O frontend das branches `feature/*` já usa oxlint (`.oxlintrc.json`, script `"lint": "oxlint"`). Para manter coerência e não forçar o time a aprender duas ferramentas, o backend NestJS também vai usar oxlint — o boilerplate do `nest new` vem com ESLint, mas trocamos por oxlint no setup.

**oxlint** é o linter do projeto Oxc (Rust). Prós: ~50-100x mais rápido que ESLint; zero config pra maioria dos casos. Contras: ainda não cobre 100% das regras do ESLint — pra o que precisamos agora (sintaxe, unused vars, imports), cobre folgado.

## Hospedagem — detalhes

Tudo em free tier. Sem custo até alguém decidir escalar.

| Serviço | Papel | Plano | Nota |
|---|---|---|---|
| Vercel | Frontend Vite | Hobby (free) | **Provisionado 10/11 em https://squad-ses-frontend.vercel.app** · Deploy automático por push em `dev` + preview URL por PR · Sem cartão no signup · Detalhes em [Provisionamento Vercel](#vercel-provisionado-em-1011) |
| Render | Backend NestJS | Free Web Service | Dorme após 15min inativo (cold start ~30s). Sem cartão. Substituiu Koyeb, que fechou free em fev/2026 pós-aquisição Mistral. Se cold start virar problema na homologação (01–07/12), avaliar Fly.io (exige cartão) |
| Neon | Postgres gerenciado | Free (0.5GB) | Serverless, branching por PR combina com Prisma. Sem cartão |
| Backblaze B2 | Storage S3 em prod | Free (10GB + egress até 3× storage médio) | API S3-compatível, substitui MinIO só em prod. **Sem cartão no signup** (R2 da Cloudflare exigia cartão — por isso trocamos pra B2 em 09/11) |
| MinIO | Storage dev local | Container docker | Continua sendo o storage em desenvolvimento |

**Impacto no docx**: o docx menciona MinIO em prod. A proposta aqui é usar Backblaze B2 em prod (mesma API S3) e manter MinIO só em dev. Isso **não** muda nenhum requisito funcional nem viola a Portaria 1327 — ainda é storage S3-compatível. Precisa confirmar com Rondineli e professor.

**Critério de escolha de todo o stack de hospedagem**: free tier real + **sem exigência de cartão de crédito no signup**, pra qualquer membro do time provisionar sem depender do cartão do Rondineli/professor. Isso descartou Koyeb (fechou free), Fly.io (exige cartão) e Cloudflare R2 (exige cartão).

## Provisionamento das contas (como compartilhar credenciais)

Cada serviço tem um modelo diferente de "quem é dono" e "como se compartilha acesso". Regra geral: **conta é uma, credenciais técnicas (connection strings, application keys) é que se compartilha**. Nunca compartilhar login/senha da conta owner.

### Regra do email owner

Ao criar qualquer conta (Neon, Render, Vercel, Backblaze), **evitar email pessoal do membro**. Se o membro sair do projeto, o recurso vai junto. Preferência, em ordem:

1. Email institucional da `softwarehouseundb` (pedir pro Rondineli)
2. Email compartilhado que já exista no time
3. **Se não houver**, criar com email pessoal **mas passar login/senha pro Rondineli guardar como backup**

### Neon (Postgres)

- **Conta owner**: 1 só (quem provisionou — hoje Victor)
- **O que se compartilha**: a *connection string* (`postgresql://user:pass@host/db`)
- **Quem recebe**: William (backend) e Luis (fullstack, precisa pra rodar local). Frontend puro (Hélio, Renan) não recebe
- **Também precisa**: entrar como env var `DATABASE_URL` nos secrets do Render (deploy do backend) e, mais pra frente, no CI se rodar testes de integração

### Backblaze B2 (storage prod)

Modelo diferente do que parece — **não é conta compartilhada**. Funciona tipo AWS:

- **1 conta owner** (login + senha) — administra
- Dentro da conta, cria **buckets** (o `ses-docs`)
- Para app acessar, cria **Application Keys** — pares `keyID + applicationKey`, análogo a AWS access key. **Essas keys é que vão pro `.env` e pros secrets do Render**, não o login da conta

**Processo pro Victor executar**:

1. Criar a conta com email institucional (ver regra acima)
2. Criar o bucket `ses-docs` (ou separar `ses-docs-dev` + `ses-docs-prod` — recomendado)
3. Gerar 2 Application Keys separadas:
   - `ses-dev` — escopo bucket dev, read+write — compartilhar com William e Luis
   - `ses-prod` — escopo bucket prod, read+write — só Victor + William colocam nos secrets do Render, mais ninguém vê
4. Variáveis que saem disso (pro `backend/.env.example` — alinhar com William):
   - `B2_KEY_ID`
   - `B2_APPLICATION_KEY`
   - `B2_BUCKET_NAME`
   - `B2_ENDPOINT` (ex: `https://s3.us-east-005.backblazeb2.com` — depende da região)
   - `B2_REGION`

B2 é S3-compatível → no NestJS usar `@aws-sdk/client-s3` apontando pro endpoint do B2. Nenhum SDK novo pra aprender.

### Vercel (provisionado em 10/11)

Executado pelo Akira (Scrum Master e Owner da org no GitHub) em vez do Hélio, como desbloqueio das tasks 6/13 da Sprint 0 que estavam atrasadas.

- **Conta owner**: `@AkiraGitDev` (GitHub pessoal do Thiago) · plano **Hobby**
- **Scope no Vercel**: `akiragitdev` (compartilha espaço com projetos pessoais do Thiago, mas isolado em nível de projeto)
- **GitHub App**: instalada na org `Software-House-UNDB` com escopo **"Only select repositories" → apenas `Squad-SES`**. Não enxerga outros repos da org
- **Projeto**: `squad-ses-frontend`
- **URL de staging**: https://squad-ses-frontend.vercel.app
- **Production Branch**: `dev` **temporariamente** — vai trocar pra `main` quando `main` receber a primeira promoção estável (fim da Sprint 2, ~16/11)
- **Transferência de ownership pra Gmail compartilhado da SH**: planejada pro **fim do projeto** (dezembro/2026). Não fazer durante as sprints pra evitar risco de quebrar deploys ativos

#### Configurações aplicadas no projeto Vercel

Importantes pra recriar o setup ou debugar:

| Campo | Valor | Por quê |
|---|---|---|
| Root Directory | `frontend` | Monorepo — Vercel só builda o workspace do frontend |
| Framework Preset | Vite | Autodetectado pelo `package.json` |
| Build Command | `npm run build` (default) | Script existente: `tsc -b && vite build` |
| Output Directory | `dist` (default) | Padrão do Vite |
| **Install Command (override)** | **`npm install --legacy-peer-deps`** | **Crítico.** Sem isso, build quebra por conflito peer deps Vitest 4 × Vite 8 (mesma razão do `.npmrc` do repo) |
| Node version | 20.x (default da Hobby) | Alinhado com CI |

#### Environment Variables no Vercel

Prefixo `VITE_*` **vai pro bundle do browser** — qualquer um abre DevTools e vê o valor. Por isso:

- **Nunca marcar como "Secret"** no Vercel — usar tipo **"Config"** (vars `VITE_*` são sempre públicas por natureza)
- Backend secrets (`DATABASE_URL`, `JWT_SECRET`, `B2_APPLICATION_KEY`) ficam **só no Render**, nunca aqui
- Marcar sempre nos 3 environments: Production + Preview + Development

| Variável | Valor atual | Environments | Nota |
|---|---|---|---|
| `VITE_AUTH_MOCK` | `true` | Prod + Preview + Dev | Feature flag que ativa o login mock do `authService.ts` enquanto o backend Render não existe. Desligar (`false`) quando William entregar `POST /auth/login` + `/auth/refresh` |
| `VITE_API_URL` | *(não setada)* | — | Pendente. Adicionar quando backend Render tiver URL real. Enquanto `VITE_AUTH_MOCK=true`, o `api.ts` usa fallback `localhost:3000` mas nunca chama a API, então não importa |

**Login mock** (válido enquanto `VITE_AUTH_MOCK=true`): email `coordenacao@espma.edu.br`, senha `Espma@2026` — definido em `frontend/src/services/authService.ts`. Perfil retornado: `coordenacao_ses`.

#### Risco plano Hobby (non-commercial use)

Hobby do Vercel tem política de uso não-comercial. Enquanto for staging com URL `*.vercel.app` sem domínio custom, baixo risco de Vercel flaggar. **Quando bater produção com domínio `.gov.br` ou tráfego real** → migrar pra **Pro** (US$20/user/mês) ou **Cloudflare Pages** (mantém o mesmo stack Vite, free, mas exige cartão no signup).

#### Trigger de redeploy após mudar env var

Vercel **não** redeploya automaticamente quando env var é adicionada ou mudada. Fluxo manual:

1. Vercel → `squad-ses-frontend` → aba **Deployments**
2. No deploy mais recente (badge Production), menu `⋯` → **Redeploy**
3. **Desmarcar "Use existing Build Cache"** — Vite inlina env vars no bundle em build time; reaproveitar cache pode manter bundle antigo sem a var nova
4. Confirmar

### Render (pendente)

William cria a conta; convida Thiago + Rondineli como membros. Deploy via webhook (adicionar `RENDER_DEPLOY_HOOK` nos secrets) ou via integração GitHub App. Configurar `trust proxy` (`app.set('trust proxy', 1)`) antes do primeiro deploy.

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
- `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` — Backblaze B2 (via API S3-compatível; endpoint tipo `s3.<region>.backblazeb2.com`)

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
5. **Storage prod**: docx = MinIO; proposta = Backblaze B2 em prod (mesma API S3), MinIO só em dev local. *(Decisão atualizada em 09/11 — antes era Cloudflare R2, trocado por B2 porque R2 exige cartão no signup.)*
6. **Branch protection**: planejada no docx; bloqueada pelo plano Free do GitHub (ver seção acima).

## Próximos passos (fora do PR de setup)

1. Rondineli passa o handle real dele pra substituir `@rondineli-handle` no `CODEOWNERS`
2. Decidir se o repo vira público (ou se operamos sem protection)
3. Adicionar Prisma ao backend (migrations do schema do docx — fase 1 das entidades)
4. Adicionar test runner no frontend (Vitest 3 compatível com Vite 8 ou Jest + babel)
5. Provisionar Render + Neon + Backblaze B2 (Vercel ✅ feito em 10/11)
6. Adicionar deploy no `ci.yml` (ou configurar via GitHub Apps do Vercel/Render)
7. Criar `backend/.env.example` com `DATABASE_URL`, `MINIO_*`, `JWT_SECRET`, etc.
8. Após primeira promoção `dev` → `main` (fim Sprint 2): trocar Production Branch no Vercel de `dev` pra `main`
9. Após William entregar `POST /auth/login`: desligar `VITE_AUTH_MOCK` no Vercel (Production + Preview) e setar `VITE_API_URL` apontando pra URL do Render
