# CATS-PLAN — Controle de Carrinhos Chromebook

Sistema web para agendamento, reserva e movimentação de carrinhos Chromebook, com gestão de professores, TI, administradores, salas, horários e pontos de Wi‑Fi.

## Visão geral

```text
Navegador
  └── React + Vite + Wouter
        ├── Área do professor
        ├── Área do TI
        └── Área administrativa

API Express
  ├── /api/healthz
  └── /api/reservations
        │
        └── Drizzle ORM
              │
              └── Neon Postgres
```

O frontend possui dados locais para modo de demonstração e testes. A API já possui persistência real no Neon para reservas; a migração das telas para a API deve ser feita progressivamente.

## Estrutura do projeto

```text
CATS-PLAN/
├── artifacts/
│   ├── controle-carrinhos/       # Frontend React/Vite
│   │   ├── src/components/       # Componentes reutilizáveis e shell
│   │   ├── src/lib/              # Estado local e regras de domínio atuais
│   │   ├── src/pages/            # Telas de professor, TI e administração
│   │   ├── src/App.tsx           # Rotas do frontend
│   │   ├── vitest.config.ts      # Configuração dos testes
│   │   └── package.json
│   ├── api-server/               # API Express
│   │   └── src/
│   │       ├── routes/            # Health e reservas
│   │       ├── app.ts            # Middleware e roteador
│   │       └── index.ts          # Entrada HTTP local
│   └── mockup-sandbox/            # Sandbox visual isolado
├── lib/
│   ├── db/                       # Schema, migração e seed Drizzle
│   │   ├── src/schema/            # Tabelas do domínio
│   │   ├── src/seed.ts            # Seed idempotente
│   │   └── drizzle/               # Migrações versionadas
│   ├── api-zod/                  # Contratos Zod compartilhados
│   ├── api-client-react/         # Cliente React da API
│   └── api-spec/                 # OpenAPI
├── scripts/                      # Scripts auxiliares do workspace
├── neon.ts                       # Configuração declarativa do Neon
├── pnpm-workspace.yaml           # Workspace e catálogo de dependências
├── .env.example                  # Variáveis esperadas, sem segredos
└── README.md
```

## Requisitos

- Node.js 20+
- pnpm 11+
- Conta Neon com acesso ao projeto configurado
- PostgreSQL client (`psql`) apenas para operações manuais

## Instalação

```powershell
pnpm install
```

## Desenvolvimento local

Frontend:

```powershell
pnpm --filter @workspace/controle-carrinhos dev
```

API:

```powershell
$env:PORT = "3000"
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/api-server start
```

O frontend fica em `http://localhost:4173` e a API em `http://localhost:3000`.

## Banco Neon

O projeto usa Neon Postgres no projeto `orange-paper-53554576`, branch `production`.

```powershell
neon env pull
$env:DATABASE_URL = $env:DATABASE_URL_UNPOOLED
pnpm --filter @workspace/db push
pnpm --filter @workspace/db seed
```

Use `DATABASE_URL_UNPOOLED` para migrações e `DATABASE_URL` (pooler) para tráfego normal da aplicação. Nunca versione `.env.local`.

O estado inicial é deliberadamente limpo: o seed/reset remove reservas, usuários
auxiliares, Wi-Fi, históricos e configurações, mantendo somente o usuário
`Administrador` e o catálogo padrão de carrinhos/horários. A senha `admin123` ainda é uma credencial provisória do
protótipo local e deve ser substituída antes de qualquer uso em produção.
Para repetir a limpeza explicitamente:

```powershell
$env:DATABASE_URL = $env:DATABASE_URL_UNPOOLED
pnpm --filter @workspace/db reset
```

## Histórico de funcionalidades

- **Acesso e perfis:** entrada do Administrador, perfis de professores,
  operadores e controle de permissões.
- **Carrinhos:** cadastro, edição, disponibilidade geral, indisponibilidade,
  unidades indisponíveis/reservadas e atualização operacional. O Bloco
  Reservas é calculado pelas unidades marcadas pelo TI/Administrador, sem
  limite visual fixo de 20; B e C são priorizados e o uso do Carrinho A exige
  confirmação explícita. O card Reservas aparece junto ao inventário e permite
  selecionar unidades individualmente ou mover todas de uma vez de volta aos
  carrinhos de origem.
- **Horários:** faixas independentes por carrinho, com grade própria do
  Carrinho A, edição, exclusão, sincronização e importação/exportação de
  planilhas.
- **Agendamentos e reservas:** criação, edição, exclusão, validação de
  sobreposição, atribuição de unidades e regras especiais de transição do
  Carrinho A.
- **Operação do TI:** estados Não movido, Movendo, Concluído e Não atendida,
  confirmação, reenvio e registro de movimentações.
- **Infraestrutura:** cadastro de pontos Wi-Fi, salas, bloqueios de dia e
  configurações do campus.
- **Histórico:** consulta dos eventos reais de reservas e movimentações; a
  restauração de fábrica não recria eventos fictícios.
- **Restauração de fábrica:** limpa reservas, usuários auxiliares, Wi-Fi,
  salas, histórico e configurações, preservando apenas o Administrador e
  restaurando os carrinhos e os horários padrão, incluindo a configuração
  específica do Carrinho A.

### Modelo de dados

- `campus_users`: usuários e papéis.
- `chromebook_carts`: carrinhos.
- `chromebook_cart_units`: Chromebooks individualizados.
- `cart_reservations`: agendamentos e reservas.
- `cart_reservation_units`: unidades vinculadas a reservas.
- `cart_schedule_slots`: faixas de horários por carrinho.
- `cart_movements`: status operacional do TI.
- `wifi_points`: pontos fixos e antenas volantes.
- `cart_day_locks`: bloqueios de data e horário de corte.
- `campus_settings`: configurações do campus.
- `campus_activity`: trilha de auditoria.

## API disponível

### `GET /api/healthz`

Retorna o status da API.

### `GET /api/reservations?date=YYYY-MM-DD`

Lista reservas, opcionalmente filtradas por data.

### `POST /api/reservations`

Cria uma reserva e valida:

- campos obrigatórios;
- horário inicial anterior ao final;
- carrinho existente e disponível;
- conflito de intervalo no mesmo carrinho;
- inserção dentro de transação no PostgreSQL.

Autenticação e autorização server-side ainda são necessárias antes do uso em produção.

## Testes e validação

```powershell
pnpm --filter @workspace/controle-carrinhos typecheck
pnpm --filter @workspace/controle-carrinhos test
pnpm --filter @workspace/controle-carrinhos build
pnpm --filter @workspace/db typecheck
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server build
```

## Deploy

O frontend pode ser publicado como projeto Vercel apontando para `artifacts/controle-carrinhos`. A API deve ser publicada como função/serverless ou serviço Node separado; o servidor Express atual é adequado para execução Node tradicional e precisa de um adaptador de função para Vercel.

Variáveis mínimas da API:

```text
DATABASE_URL
DATABASE_URL_UNPOOLED
SESSION_SECRET
APP_BASE_URL
```

Não coloque credenciais no Git, no README ou em logs.
