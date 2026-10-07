# Pacote comercial — Controle de Carrinhos

Esta distribuição contém o código-fonte e os padrões iniciais do aplicativo,
mas não inclui contas, credenciais, dados de clientes, vínculo de Neon ou
configurações Vercel do ambiente original.

Para gerar novamente o arquivo ZIP limpo no Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-commercial.ps1
```

O arquivo `CATS-PLAN-COMERCIAL-<data-hora>.zip` será criado na pasta acima da
raiz do projeto. O empacotador exclui dependências, builds, diretórios `.vercel`
e `.git`, arquivos `.env` locais e metadados do ambiente de desenvolvimento.

## O que vem limpo

- Nenhum banco ou URL de conexão é fornecido.
- Não há conta Neon incluída. Cada comprador cria e administra seu próprio
  projeto Neon.
- As salas, pontos Wi-Fi, reservas, professores e operadores começam vazios.
- O conjunto de salas de teste não é carregado por padrão. Só é ativado em uma
  implantação explicitamente configurada com `VITE_ENABLE_CAMPUS_SEED=true`.
- O catálogo operacional padrão contém os carrinhos A, B e C e seus horários.
- Não há senha ou conta administrativa padrão incluída no código. Configure
  credenciais exclusivas e `SESSION_SECRET` no ambiente privado da API antes de
  disponibilizar o sistema; sem elas, o login falha de forma segura.

## Configurar banco próprio

1. Crie uma conta em [Neon](https://neon.tech/) e um projeto PostgreSQL.
2. Copie a connection string **direct/unpooled** para executar a configuração
   inicial do schema. Não compartilhe nem publique essa URL.
3. Na raiz do projeto, instale dependências e aplique o schema inicial:

   ```powershell
   pnpm install
   $env:DATABASE_URL = "SUA_URL_DIRETA_DO_NEON"
   pnpm --filter @workspace/db run push
   pnpm --filter @workspace/db run seed
   ```

   O comando `seed` recria os dados iniciais e é destrutivo; use-o somente em
   um banco novo ou quando realmente quiser limpar o banco inteiro.

4. Configure `DATABASE_URL` no ambiente de produção da API com a URL **pooled**
   do Neon (`-pooler`). Guarde a URL direta apenas para migrações/manutenção.
5. Configure `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`,
    `ADMIN_SUPER_ADMIN`, `OPERATOR_USERNAME`, `OPERATOR_PASSWORD_HASH` e
    `APP_BASE_URL` no ambiente privado da API. Gere hashes de senha sem expor o
    texto digitado:

    ```powershell
    $env:SESSION_SECRET = (node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))")
    node .\scripts\hash-password.mjs
    ```

    Execute o gerador separadamente para cada senha e cadastre os resultados
    somente nas variáveis de ambiente da API. O servidor usa cookies assinados
    `HttpOnly`/`Secure` e não aceita o papel salvo no navegador como autenticação.
    Professores precisam de contas ativas em `campus_users` com hash scrypt; a
    ativação pelo navegador está desabilitada até existir um fluxo de convite
    verificado pelo servidor.

## Notificações push

Para habilitar Web Push em sua própria instalação, gere outro par VAPID (não
reutilize chaves de terceiros):

```powershell
npx web-push generate-vapid-keys
```

Configure no projeto de hospedagem da API:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (por exemplo, `mailto:suporte@seudominio.com`)
- `PUSH_ADMIN_TOKEN` (segredo aleatório forte)
- `DATABASE_URL` (Neon pooled)

O frontend consulta a chave pública da API em `/api/push/public-key`. Para uma
publicação separada de frontend/API, configure o rewrite em
`artifacts/controle-carrinhos/vercel.json` para o domínio da API que você
controla. Nunca coloque `VAPID_PRIVATE_KEY`, `PUSH_ADMIN_TOKEN` ou
`DATABASE_URL` no frontend.

Após cadastrar as variáveis de ambiente, faça um novo deploy da API para que
ela as carregue. Verifique `/api/healthz` e `/api/push/public-key`. Cada usuário
precisa permitir notificações no navegador e ativá-las no aplicativo.

## Publicação no Vercel

Crie projetos Vercel próprios para a API e o frontend, conectados ao repositório
ou à cópia deste pacote. Configure os diretórios raiz:

- API: `artifacts/api-server`
- Frontend: `artifacts/controle-carrinhos`

Use os comandos e diretórios indicados pelos arquivos `vercel.json` de cada
aplicação. Ajuste o rewrite do frontend para o domínio da API criada pelo
comprador. Configure segredos separadamente em cada ambiente Vercel e nunca
versione arquivos `.env.local`.
