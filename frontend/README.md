# SAGES - Fluxo de Autenticação

Front-end (React + Vite) do fluxo de login e cadastro do SAGES.

## Telas

- `/login` - Entrar na conta
- `/cadastro` - Criar conta
- `/cadastro/sucesso` - Confirmação de cadastro
- `/dashboard` - Tela de destino após login (placeholder)

### Área interna (Gerenciamento / Administração)

- `/gerenciamento/analise-oficios` - Análise de Ofícios: listagem, revisão (dados de unidade,
  estrutura de estágio e grupos) e aprovação/reprovação de ofícios
- `/gerenciamento/assinatura-termos` - reservada no menu, ainda sem fluxo implementado
- `/administracao/usuarios` - reservada no menu, ainda sem fluxo implementado
- `/administracao/configuracoes` - reservada no menu, ainda sem fluxo implementado

Os dados de Ofícios em `src/data/mockOficios.js` são fictícios — substituir pela integração
com a API assim que o recurso existir no back-end.

## Design system

Tailwind CSS + shadcn/ui, configurados em cima das cores e raios que já existiam em
`src/index.css` (nada de paleta nova). Para adicionar um componente novo da shadcn:

```bash
npx shadcn@latest add <componente>
```

Os componentes caem em `src/components/ui`, com o alias `@/` apontando para `src/`.

## Rodando o projeto

```bash
npm install
npm run dev
```

## Autenticação e rotas protegidas

- `src/services/api.ts` - cliente Axios: envia o access token (JWT) e, ao receber 401, renova com o
  refresh token e repete a requisição; se a renovação falhar, encerra a sessão.
- `src/lib/queryClient.ts` - configuração do TanStack Query (não repete erros 4xx).
- `src/auth/` - `AuthProvider` e `useAuth` (login, logout, perfil do usuário).
- `src/routes/ProtectedRoute.tsx` - exige login e, opcionalmente, um dos perfis permitidos. Quem não
  tem permissão vai para `/acesso-negado`; visitante vai para `/login` e volta à página pedida depois.
- `src/routes/permissions.ts` - quais perfis acessam cada área e a tela inicial de cada perfil.

Perfis com login no piloto: `coordenacao_ses` e `representante_ies`.

### Variáveis de ambiente

Copie `.env.example` para `.env`:

- `VITE_API_URL` - URL base da API (padrão `http://localhost:3000`).
- `VITE_AUTH_MOCK` - `true` usa a credencial fixa de demonstração (entra como coordenação) enquanto o
  `POST /auth/login` não existe. Remover o mock quando a API de autenticação estiver pronta.

## Testes

```bash
npm run test
```

## Build de produção

```bash
npm run build
```
