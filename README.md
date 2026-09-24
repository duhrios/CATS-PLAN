# Controle de Carrinhos

Aplicação React/Vite para gestão de agendamentos, carrinhos Chromebook, movimentações e conectividade do campus.

## Desenvolvimento

O workspace usa pnpm:

```powershell
pnpm install
pnpm --filter @workspace/controle-carrinhos dev
```

A aplicação fica disponível em `http://localhost:4173`.

## Validação

```powershell
pnpm --filter @workspace/controle-carrinhos typecheck
pnpm --filter @workspace/controle-carrinhos test
pnpm --filter @workspace/controle-carrinhos build
```

## Configuração

Copie `.env.example` para `.env` quando o backend for habilitado. Nunca coloque senhas ou tokens reais no repositório.

O frontend atual ainda usa dados locais para compatibilidade de demonstração. Antes de produção, a autenticação e as operações devem ser atendidas por uma API com sessão `httpOnly`, autorização no servidor e banco de dados.

## Neon/PostgreSQL

O projeto está vinculado ao projeto Neon `orange-paper-53554576`, na branch `production`.

Para aplicar a estrutura inicial do banco, use a conexão direta (`DATABASE_URL_UNPOOLED`) para migrações:

```powershell
neon env pull
$env:DATABASE_URL = $env:DATABASE_URL_UNPOOLED
Get-Content .\lib\db\drizzle\0000_sloppy_lester.sql | psql $env:DATABASE_URL
```

O seed inicial cria os carrinhos A/B/C, suas unidades e as configurações básicas:

```powershell
pnpm --filter @workspace/db seed
```

A API já expõe `GET /api/reservations` e `POST /api/reservations`. O frontend ainda não foi trocado para consumir esses endpoints; essa migração deve ser feita por tela, começando pela agenda.
