# Gestão Financeira CRM — Claude Code

## Infra

| Item | Valor |
|------|-------|
| API porta | 4100 |
| PM2 name | `gestao-financeira-api` (cluster, 3 instâncias) |
| PM2 name | `notificacao-service` (fork, serviço auxiliar) |
| DB name | `gestao_financeira` |
| DB user | `gestao_financeira_user` |
| Nginx frontend | `/gestao/` → `frontend/dist/` |
| Nginx API | `/api/gestao/` → `localhost:4100/api/` |
| URL canônica | `https://duofuturo.tech/gestao/` — usar sempre esta em links, docs e comunicação |
| Domínios | Só `duofuturo.tech` (e www) serve a app — `sites-available/duofuturo-tech`. Legados **só com 301**: `duofuturo.mooo.com` (`duofuturo-mooo`, mas `/api/*` ainda é servido lá por causa de webhook) e `gestao.duofuturo.tech` (`gestao-duofuturo-tech`) |
| Identidade | Azul Navy + Dourado + **Esmeralda `#10b981`** |

## Estrutura

```
api/src/
├── config/         # database.ts, env.ts, jwt.ts
├── middlewares/    # auth.middleware.ts, rbac.middleware.ts
└── modules/
    ├── auth/       # Login, registro, JWT
    ├── clientes/   # CRUD clientes
    ├── despesas/   # Lançamentos de despesa
    ├── receitas/   # Lançamentos de receita
    ├── sessoes/    # Controle de sessões ativas
    └── usuarios/  # Gestão de usuários (admin)
```

## Deploy

```bash
# API
cd /var/www/apps/gestao_financeira/api
npm run build
pm2 restart gestao-financeira-api

# Frontend
cd /var/www/apps/gestao_financeira/frontend
npm run build
```

## WhatsApp Cloud API (Meta) — painel de homologação

`/gestao/whatsapp/meta` (`MetaCloudApi.tsx`), restrito a **`super_admin`** — não a
`masterOnly`. O token é um **System User da DuoFuturo**, global ao processo e sem
dono: master existe em toda empresa do banco, e liberar por ele daria a qualquer
cliente o poder de enviar pelo nosso número oficial e de criar modelo na nossa WABA.
O guard mora em `meta-whatsapp.routes.ts`; a página só usa o perfil para não piscar.
A exceção é `META_PAINEL_REVISORES` (ids no `.env`, `whatsapp/meta/acesso.ts`): a
conta do analista do App Review, numa empresa só dela — ver
`docs/META_TECH_PROVIDER.md`. Fica mesmo depois da aprovação: a Meta reanalisa o
app com a mesma credencial, e ela tem que valer por um ano.

A tela existe porque a Meta pede, para virar **Provedor de Tecnologia**, um vídeo
mostrando "seu app enviando a mensagem" (`whatsapp_business_messaging`) e outro
criando um modelo (`whatsapp_business_management`) — e `sendTextMessage()` existia
desde sempre em `meta-whatsapp.service.ts` sem **nenhum chamador**: não havia o que
gravar. Ela também é o banco de provas da migração Baileys → Cloud API.

O webhook (`GET`/`POST /webhook`) continua **público** e é registrado ANTES do
`router.use(authRequired, acessoCloudApi)` — a Meta chama sem JWT.

- **Cloud API não tem QR Code.** No Baileys o QR pareia um *device* a uma sessão que
  vive no nosso servidor; aqui o número vive no servidor da Meta e o que temos é um
  token. O número entra por verificação de código (SMS/voz) ou, para o cliente, pelo
  Embedded Signup. O único QR que existe nesse mundo é o do modo *coexistência*, e
  ele é escaneado dentro do fluxo da Meta, nunca do nosso.
- **Erro da Graph API traduzido** (`erroMeta`). O axios cru diz só "Request failed
  with status code 400" — inútil na tela e pior num vídeo de análise, onde o revisor
  precisa ver o app se comportando. O motivo real vem em `error.message` /
  `error_user_msg` / `error_data.details`.
- **`example` é obrigatório quando o corpo do modelo tem `{{n}}`.** `contarVariaveis`
  confere antes de chamar a Meta e devolve a frase certa; a tela gera um campo de
  exemplo por variável. Sem isso a Graph API responde "Invalid parameter" e não diz
  qual.
- O destino é normalizado por `comDDIParaEnvio` do `_shared/telefone.ts`, o mesmo
  caminho do Baileys — dígitos com DDI, sem `+` e sem máscara. **Digitado com `+`,
  segue como veio**: um `+1` americano tem os 11 dígitos de um celular com DDD e
  ganharia um `55` na frente (o analista da Meta não é brasileiro).

### `ecosystem.config.js` congelava a credencial (07/09/2026)

O bloco `env` do PM2 entra em `process.env` **antes** do dotenv, e o dotenv não
sobrescreve o que já existe. Havia `META_WA_*` nos dois lugares: o processo rodava
com um token vencido (`Error validating access token: the user logged out`) e o
`phone_number_id` de outro número, enquanto o `api/.env` já tinha o System User
permanente e válido. Mesmo tropeço do `ASAAS_API_KEY`.

> Credencial mora no `.env`, ponto. Repetir no `ecosystem.config.js` não é redundância
> — é uma versão que ganha em silêncio. Depois de mexer, `pm2 delete` + `pm2 start`:
> `pm2 restart` **reaproveita o env antigo do processo**.

### A WABA do `.env` não existia (07/09/2026)

`GET /{waba}/message_templates` devolvia `(#100) Object ... does not exist, cannot be
loaded due to missing permissions` com o MESMO token que respondia pelo
`phone_number_id`. O `META_WA_BUSINESS_ACCOUNT_ID` era `2051846135544667`, um ID que
não corresponde a nenhuma conta do portfólio.

| WABA | Número | Papel |
|------|--------|-------|
| **`1040471308694652` — DuoFuturo** | +55 11 94052-4435 (`1253283981208800`) | a nossa, `account_review_status: APPROVED` |
| `986275024420213` — Test WhatsApp Business Account | +1 555-199-6985 | a de brinquedo que a Meta cria junto com o app |

> **A mensagem de erro mente sobre a causa.** "does not exist **or** missing
> permissions" é a mesma frase para ID inexistente e para ativo não atribuído — e o
> palpite natural (mexer em permissão de System User) manda você para o lado errado.
> Desempate: liste as contas do portfólio antes de acusar permissão —
> `GET /{business-id}/owned_whatsapp_business_accounts`, com o `business_id` que está
> na URL do Gerenciador. Se a conta aparece ali, o problema é o ID, não o acesso.

Cuidado com o `user_id` do `debug_token`: ele NÃO é o ID que o Gerenciador mostra em
"Usuários do sistema", então `/{aquele-id}/assigned_whatsapp_business_accounts` volta
`{"data":[]}` mesmo com todos os ativos atribuídos. Vazio ali não prova nada.

## Observações

- Módulos `integracoes` e `relatorios` foram removidos (ver git log)
- `notificacao-service` roda em paralelo — reiniciar junto se alterar config do banco
- Campo `empresa` na tabela usuarios — VIEW com campos calculados ativa
- RBAC implementado: roles admin/usuario com permissões distintas
