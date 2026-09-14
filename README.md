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

## Rodando o projeto

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```
