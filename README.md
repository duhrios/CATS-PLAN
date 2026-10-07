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
        └── /api/push/*
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

Cada instalação deve usar seu próprio projeto Neon. Nenhuma credencial ou
conexão de banco de dados é incluída no código distribuído.

```powershell
Copy-Item .env.example .env.local
# Preencha DATABASE_URL com a conexão direta do seu projeto Neon.
$env:DATABASE_URL = "SUA_URL_DIRETA_DO_NEON"
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run seed
```

Use a URL direta (sem `-pooler`) para aplicar o schema/migrações e a URL pooled
(`-pooler`) em `DATABASE_URL` no runtime serverless. Nunca versione `.env.local`.
O arquivo [COMERCIALIZACAO.md](./COMERCIALIZACAO.md) descreve o provisionamento
individual de Neon e Vercel para uma instalação comercial.

O estado inicial é deliberadamente limpo: o seed/reset remove reservas, usuários
auxiliares, Wi-Fi, históricos e configurações, mantendo apenas o catálogo padrão
de carrinhos/horários. Configure a autenticação do servidor antes do deploy:

```powershell
$env:SESSION_SECRET = (node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))")
node .\scripts\hash-password.mjs
# Copie o hash impresso para ADMIN_PASSWORD_HASH (e gere outro para TI).
```

Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SUPER_ADMIN`,
`OPERATOR_USERNAME`, `OPERATOR_PASSWORD_HASH` e `SESSION_SECRET` no ambiente
privado da API. Contas de professor devem existir em `campus_users` com
`role='user'`, senha armazenada no formato scrypt criado pelo script e
`active=true`. Nunca coloque hashes ou segredos em variáveis `VITE_*`, no
frontend, no banco local do navegador ou em arquivos versionados. Sem essas
configurações, o servidor nega o login.

No primeiro acesso administrativo, a credencial temporária configurada no
servidor só autentica quando a conta ainda não tem uma senha persistida. Esse
login recebe uma sessão restrita e precisa definir uma senha nova de pelo menos
6 caracteres antes de acessar qualquer outra área. A senha nova é gravada como
hash scrypt em `campus_users`; a partir daí, ela prevalece sobre a credencial
temporária e esta não volta a autenticar enquanto a senha persistida existir.
Senhas escolhidas para o Administrador e professores precisam ter pelo menos
6 caracteres. O Administrador, TI e professores podem optar por salvar suas
credenciais usando o gerenciador de senhas do navegador; o aplicativo não grava
senhas no armazenamento local do navegador.

A sessão é assinada no servidor e guardada em cookie `HttpOnly`, `Secure` em
produção e `SameSite=Strict`; o papel salvo no armazenamento do navegador não
concede acesso. Professores têm sessão de 45 minutos; TI e Administrador, 12
horas. A API valida a sessão e a origem antes de aceitar alterações de reservas.
Para repetir a limpeza explicitamente:

```powershell
$env:DATABASE_URL = $env:DATABASE_URL_UNPOOLED
pnpm --filter @workspace/db reset
```

## Histórico de funcionalidades

- **Acesso e perfis:** entrada do Administrador, perfis de professores,
  operadores e controle de permissões.
- **Sessões:** o servidor emite cookies assinados, com expiração e validação
  própria. O cliente não pode conceder a si mesmo uma função alterando
  `localStorage`.
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
  confirmação, reenvio e registro de movimentações. Todos os carrinhos com
  horário simultâneo aparecem em um único aviso navegável por setas (modo
  seleção) ou empilhados (modo clássico, configurável no dispositivo do TI).
  Lembretes valem somente durante a janela da aula; alterações de status não
  geram notificações do sistema. Notificações externas são reservadas para um
  novo pedido ativo do professor. Se o mesmo
  carrinho tem horários consecutivos na mesma sala e a entrega anterior já foi
  iniciada/concluída, as próximas aulas não pedem outra movimentação física e
  são concluídas automaticamente no horário. Se o carrinho for destinado a
  outra sala ou houver intervalo entre horários, uma nova movimentação é avisada.
- **Visão - Planilha:** bloco exclusivo do TI e da Administração, com acesso
  rápido em grade semanal inspirada na planilha de referência (carrinho,
  horários, turma e professor) e acesso completo com dados da reserva e do
  acompanhamento operacional. Acesso Rápido permite selecionar e arrastar
  uma aula para outro horário/carrinho disponível, salvando pela agenda
  compartilhada para atualizar também a área de movimentações. Para transferir
  várias aulas de uma vez, mantenha Ctrl pressionado ao selecioná-las e arraste
  a seleção até o título do carrinho de destino; os horários são mantidos e a
  seleção é validada antes de salvar. Se alguma gravação falhar, a interface
  informa quantas aulas foram salvas e sincroniza novamente os agendamentos.
  Ctrl+Z (ou Cmd+Z no Mac) desfaz a última movimentação enquanto a planilha
  estiver aberta. O filtro de período mostra manhã, tarde ou ambos; a visão geral
  separa as linhas em blocos visuais para cada período.
  A grade rápida
  segue os dias úteis; o acesso completo também inclui reservas do fim de semana,
  reúne tudo em **Ver todas** ou mantém abas específicas por carrinho e permite
  exibir todas as colunas ou personalizar a seleção. As sugestões de otimização
  por piso aparecem abaixo da planilha nesta mesma página.
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
As sessões acima controlam a interface no navegador e não substituem validação
de identidade/autorização na API. Os perfis atuais também são armazenados no
navegador; autenticação compartilhada entre dispositivos requer persistência de
contas e sessões no servidor.

### PWA e notificações push

O frontend registra `/manifest.webmanifest` e `/sw.js`, permitindo instalação como
PWA e recebimento de notificações pela Push API. O botão **Ativar notificações**
solicita permissão somente após uma ação explícita do usuário e registra a
subscription na API.

Para habilitar o envio real, configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` e `PUSH_ADMIN_TOKEN` no ambiente da API. Gere o par VAPID com:

```powershell
npx web-push generate-vapid-keys
```

Endpoints disponíveis:

- `GET /api/push/public-key` — retorna a chave pública VAPID.
- `POST /api/push/subscriptions` — registra o dispositivo.
- `DELETE /api/push/subscriptions` — remove o dispositivo.
- `GET /api/push/status` — verifica configuração e subscriptions; exige
  `Authorization: Bearer <PUSH_ADMIN_TOKEN>`.
- `POST /api/push/send` — envia uma notificação; exige
  `Authorization: Bearer <PUSH_ADMIN_TOKEN>`.

As subscriptions são persistidas na tabela `push_subscriptions`, permitindo
reinício da API e múltiplas instâncias sem perder os dispositivos registrados.
Execute a migração Drizzle antes de habilitar o recurso em produção.

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
ADMIN_USERNAME
ADMIN_PASSWORD_HASH
ADMIN_SUPER_ADMIN
OPERATOR_USERNAME
OPERATOR_PASSWORD_HASH
```

Não coloque credenciais no Git, no README ou em logs.
