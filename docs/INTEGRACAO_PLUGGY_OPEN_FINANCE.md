# Integração Open Finance (Pluggy) — Levantamento e Plano

> **Status:** Documento de planejamento. **Nenhum código foi escrito ainda.**
> **App:** Gestão Financeira CRM (API porta 4100, DB `gestao_financeira`)
> **Objetivo:** Permitir que o usuário conecte sua conta bancária via Pluggy e que as transações de **débito** sejam importadas automaticamente como **despesas**, com atualização contínua via webhook.

---

## 1. Como a Pluggy funciona (resumo da documentação)

A Pluggy é um agregador de Open Finance. O fluxo tem 3 camadas: **autenticação server-side**, **widget de conexão no frontend** e **leitura de dados / webhooks**.

### 1.1 Autenticação (server-side, nunca no browser)

| Passo | Endpoint | Entrada | Saída |
|-------|----------|---------|-------|
| 1. API Key | `POST https://api.pluggy.ai/auth` | `{ clientId, clientSecret }` | `{ apiKey }` (validade ~2h) |
| 2. Connect Token | `POST https://api.pluggy.ai/connect_token` (header `X-API-KEY: <apiKey>`) | `{ options: { clientUserId, webhookUrl } }` | `{ accessToken }` (validade ~30min) |

- `clientId` / `clientSecret` ficam **somente no backend** (`.env`).
- O `connect_token` (accessToken) é descartável e é o único segredo que vai para o frontend.
- Todas as chamadas de dados usam o header `X-API-KEY: <apiKey>`.

### 1.2 Widget de conexão (frontend — Pluggy Connect)

- Biblioteca: `react-pluggy-connect` (`<PluggyConnect />`) ou o web component `pluggy-connect-sdk`.
- O widget recebe o `connectToken` gerado no passo 1.2 e abre a UI onde o usuário escolhe o banco e digita as credenciais **diretamente na Pluggy** (nós nunca vemos a senha do banco).
- Callback de sucesso: `onSuccess(itemData)` → `itemData.item.id` é o **`itemId`** (identificador da conexão).
- Um **Item** = uma conexão a uma instituição financeira. Um Item pode ter **várias contas** (corrente, poupança, cartão de crédito).

### 1.3 Leitura de dados

| Recurso | Endpoint | Observações |
|---------|----------|-------------|
| Status do item | `GET /items/{itemId}` | `status`: `UPDATING`, `UPDATED`, `LOGIN_ERROR`, `WAITING_USER_INPUT`, etc. |
| Listar contas | `GET /accounts?itemId={itemId}` | Cada conta: `id`, `type` (`BANK`/`CREDIT`), `subtype` (`CHECKING_ACCOUNT`, `CREDIT_CARD`…), `name`, `balance`, `marketingName` |
| Listar transações | `GET /transactions?accountId={accountId}&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=500` | Paginado: resposta `{ results, total, totalPages, page }` |

**Objeto Transaction (campos relevantes):**

| Campo Pluggy | Tipo | Significado |
|--------------|------|-------------|
| `id` | string (UUID) | ID único da transação na Pluggy → usado para **deduplicação** |
| `description` | string | Descrição tratada |
| `descriptionRaw` | string | Descrição bruta do banco |
| `amount` | number | Valor. **Em conta corrente, débito vem negativo; crédito positivo.** |
| `type` | string | `DEBIT` ou `CREDIT` |
| `date` | string (ISO) | Data da transação |
| `category` | string | Categoria sugerida pela Pluggy (ex.: "Food and drinks") |
| `categoryId` | string | ID da categoria Pluggy |
| `balance` | number | Saldo após a transação |
| `currencyCode` | string | Ex.: `BRL` |
| `status` | string | `POSTED` (efetivada) ou `PENDING` |
| `accountId` | string | Conta de origem |

> **Regra de despesa:** importamos apenas transações com `type === 'DEBIT'` (saída de dinheiro). Armazenamos `valor` sempre **positivo** (`Math.abs(amount)`), pois a tabela `despesas` trata valor como magnitude.

### 1.4 Webhooks (atualização automática)

- Registro: `POST /webhooks` com `{ url, event, headers }` — `url` precisa ser **HTTPS público** (localhost não é aceito). `event` pode ser específico ou `"all"`.
- Alternativa: passar `webhookUrl` na criação do `connect_token`/item.
- Eventos relevantes:
  - `item/created` — conexão criada.
  - `item/updated` — sincronização concluída.
  - `item/error`, `item/login_succeeded`, `item/waiting_user_input` — estados.
  - **`transactions/created`** — novas transações disponíveis (payload traz `itemId`, `accountId`, `transactionsCount`, `createdTransactionsLink`).
  - `transactions/updated`, `transactions/deleted`.
- Payload base: `{ event, eventId, itemId, triggeredBy, clientUserId, ... }`.
- **SLA:** o endpoint deve responder **2XX em até 5s**. Retentativas: até 9 tentativas (3 imediatas, 3 após 1h, 3 após 2h).
- **Segurança:** a Pluggy não assina o payload. Proteção recomendada via `headers` customizados (ex.: `X-Webhook-Secret`) configurados no registro do webhook — **mesmo padrão já usado no projeto** (`WEBHOOK_SECRET` em `crm/webhook`).

> **Implicação de arquitetura:** o webhook **não traz as transações no corpo** — ele apenas avisa. Ao receber `transactions/created`/`item/updated`, o backend deve disparar um **fetch das transações** (idealmente assíncrono via fila BullMQ, que o projeto já usa) e responder 2XX rápido.

---

## 2. Fluxo de integração ponta a ponta

```
┌─────────────┐   1. GET /pluggy/connect-token         ┌──────────────┐
│  Frontend   │ ─────────────────────────────────────▶ │  API 4100    │
│ (Despesas)  │                                          │              │
│             │ ◀─── { accessToken } ─────────────────── │  /auth +     │
│             │                                          │  /connect_token│
│  abre       │                                          └──────────────┘
│  <PluggyConnect connectToken=...>                              │
│             │   2. usuário escolhe banco + login (na Pluggy)   │
│             │ ◀─── onSuccess(itemId) ──────────────────────────┘
│             │
│             │   3. POST /pluggy/items { itemId }      ┌──────────────┐
│             │ ─────────────────────────────────────▶ │  API salva    │
│             │                                          │  conexão +    │
│             │                                          │  enfileira    │
│             │                                          │  sync inicial │
└─────────────┘                                          └──────┬───────┘
                                                                 │
        4. (async) GET /accounts → GET /transactions (DEBIT)     │
        5. upsert em `despesas` com origem=open_finance ◀────────┘

        ── DEPOIS, contínuo ──
┌──────────────┐  POST /api/gestao/pluggy/webhook   ┌──────────────┐
│   Pluggy     │ ─────────────────────────────────▶ │  API valida   │
│              │   { event:'transactions/created' }  │  secret →     │
│              │ ◀── 200 OK (em <5s) ─────────────── │  enfileira    │
└──────────────┘                                      │  sync job     │
                                                       └──────────────┘
```

**Sincronização (job assíncrono, BullMQ):**
1. Buscar `apiKey` (cachear em memória até expirar).
2. `GET /accounts?itemId` → para cada conta.
3. `GET /transactions?accountId&from=&to=` paginando.
4. Filtrar `type === 'DEBIT'` e `status === 'POSTED'`.
5. `INSERT ... ON CONFLICT (pluggy_transaction_id) DO NOTHING` em `despesas`.
6. Marcar candidatos a duplicata de lançamentos manuais (ver §4).

---

## 3. Análise do sistema atual (módulo de despesas)

### 3.1 Arquivos

- `api/src/modules/despesas/despesas.{routes,controller,service}.ts` — CRUD padrão (REST), autenticado por JWT (`authRequired`), com **multi-tenancy por `usuario_id`** (super_admin vê tudo).
- `api/src/server.ts` — rotas montadas em `/api/despesas` (legado) e `/api/gestao/despesas` (frontend atual).
- Frontend: `frontend/src/pages/despesas/ExpensesList.tsx` (tela única, ~25KB), `frontend/src/api/expenses.ts` (client axios), `frontend/src/types/expense.ts`.

### 3.2 Modelo de dados real (tabela `despesas`)

| Coluna | Tipo | Nota |
|--------|------|------|
| `id` | `uuid` (gen_random_uuid) | PK |
| `descricao` | `text` NOT NULL | |
| `valor` | `numeric(10,2)` NOT NULL | sempre positivo |
| `data` | `date` NOT NULL | |
| `categoria` | `varchar(100)` NOT NULL default `'Outros'` | texto livre |
| `pago` | `boolean` | legado (sincronizado com `status`) |
| `status` | `varchar(20)` | `pendente`/`pago`/`cancelado`/`estornado`/`atrasado` |
| `tipo_pagamento` | `varchar(20)` | `a_vista`/`parcelado` |
| `usuario_id` | `integer` NOT NULL → `usuarios(id)` | **multi-tenancy** |
| `id_fatura` | `varchar(50)` | **gerado por trigger** `trigger_gerar_id_fatura_despesa` no INSERT |
| `parcelado`, `numero_parcelas`, `parcela_atual`, `recorrente` | | parcelamento |
| `receita_origem_id`, `taxa_percentual` | | despesa derivada de receita |
| `created_at`, `updated_at` | timestamp | trigger de updated_at |

- Tabela auxiliar `parcelas_despesas` (1:N) para parcelamento.
- Tabela `categorias_despesas` (categorias customizadas por `usuario_id`) — usada pelo frontend no `<Select>` de categoria.
- **Não existe hoje nenhum campo de origem/fonte externa.** Toda despesa é assumida como lançamento manual.

### 3.3 Como despesas são criadas hoje

- `despesasService.create()` recebe `usuario_id` do JWT (`req.user.userId`), define `tipo_pagamento`/`status` e faz `INSERT`. Não há caminho de criação em lote nem idempotência.

### 3.4 Observações de infra reaproveitáveis

- **BullMQ** já está no projeto (worker do agente IA) → reusar para sync assíncrono.
- **Webhook público com secret** já existe (`crm/webhook` + `WEBHOOK_SECRET`, montado **antes** do middleware de auth) → mesmo padrão para o webhook Pluggy.
- `axios` já é dependência → usar para chamar a Pluggy.
- Rotas seguem o padrão duplo `/api/...` e `/api/gestao/...`.

---

## 4. Mapeamento de dados proposto

### 4.1 Pluggy Transaction → `despesas`

| Campo despesa | Origem Pluggy | Regra |
|---------------|---------------|-------|
| `descricao` | `description` (fallback `descriptionRaw`) | |
| `valor` | `Math.abs(amount)` | só `type === 'DEBIT'` |
| `data` | `date` | converter ISO → `date` |
| `categoria` | `category` mapeada | via tabela de-para (§4.2); fallback `'Outros'` |
| `status` | — | `'pago'` (transação já efetivada/`POSTED`) |
| `tipo_pagamento` | — | `'a_vista'` (transações de extrato não são parceladas aqui) |
| `usuario_id` | dono da conexão | obrigatório |
| **`origem`** *(novo)* | — | `'open_finance'` |
| **`pluggy_transaction_id`** *(novo)* | `id` | UNIQUE → deduplicação |
| **`conexao_pluggy_id`** *(novo)* | FK p/ conexão salva | rastreabilidade |

> Transações de **cartão de crédito** merecem decisão à parte (cada compra vira despesa "à vista" na data da compra, ou só a fatura?). **Proposta inicial:** importar apenas contas `BANK/CHECKING_ACCOUNT` na v1 e tratar cartão em fase 2.

### 4.2 Categorias

- A Pluggy retorna categorias em inglês ("Food and drinks", "Transportation"…). Criar uma **tabela de-para** `pluggy_categoria_map` (ou um dicionário no código) mapeando para as categorias já usadas no sistema (Fornecedores, Software, Lazer, Saúde, etc.).
- Sem correspondência → `'Outros'`. O usuário sempre pode reclassificar manualmente depois (a despesa importada é editável como qualquer outra).

### 4.3 Deduplicação

Dois níveis:

1. **Idempotência da própria importação** (Pluggy ↔ Pluggy):
   `pluggy_transaction_id` UNIQUE + `INSERT ... ON CONFLICT DO NOTHING`. Garante que reprocessar o mesmo webhook não duplica.

2. **Colisão com lançamento manual** (Pluggy ↔ usuário):
   Não há ID em comum. Usar **heurística** para *sinalizar* (não apagar automaticamente):
   - mesma `usuario_id`, mesmo `valor`, `data` dentro de ±2 dias, e despesa manual ainda sem `pluggy_transaction_id`.
   - Marcar a importada com `status_conciliacao = 'possivel_duplicata'` e exibir aviso na tela para o usuário decidir (manter, mesclar, descartar).
   - **Nunca** apagar/alterar lançamento manual de forma automática (princípio: o dado do usuário é soberano).

### 4.4 Identificar origem (Open Finance × manual)

- Campo `origem` (`'manual'` default / `'open_finance'`).
- Despesas importadas guardam também `instituicao` (nome do banco) e `conexao_pluggy_id` para exibir ícone/nome na tela.

---

## 5. Mudanças necessárias

### 5.1 Banco de dados (nova migration `045_pluggy_open_finance.sql`)

**Novas colunas em `despesas`** (todas opcionais, com default seguro — não quebram nada existente):
```
origem                VARCHAR(20)  DEFAULT 'manual'   -- 'manual' | 'open_finance'
pluggy_transaction_id VARCHAR(64)  UNIQUE             -- dedup
conexao_pluggy_id     UUID         REFERENCES conexoes_pluggy(id) ON DELETE SET NULL
instituicao           VARCHAR(120)                    -- nome do banco (cache p/ exibição)
status_conciliacao    VARCHAR(20)  DEFAULT 'ok'       -- 'ok' | 'possivel_duplicata'
```

**Nova tabela `conexoes_pluggy`** (uma linha por Item conectado):
```
id              UUID PK
usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
pluggy_item_id  VARCHAR(64) NOT NULL UNIQUE
instituicao     VARCHAR(120)
status          VARCHAR(30)        -- espelha status do item Pluggy
ultima_sync_em  TIMESTAMP
ativo           BOOLEAN DEFAULT true
created_at / updated_at
```

**(Opcional) `pluggy_categoria_map`** — de-para de categorias, ou manter em código.

> Migrations no projeto são `.sql` numerados, aplicados manualmente (não há runner em `package.json`). Seguir o mesmo padrão e usar `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`.

### 5.2 Backend (novo módulo `api/src/modules/pluggy/`)

| Arquivo | Responsabilidade |
|---------|------------------|
| `pluggy.client.ts` | wrapper axios da API Pluggy: `getApiKey()` (com cache de validade), `createConnectToken()`, `listAccounts()`, `listTransactions()`, `getItem()` |
| `pluggy.service.ts` | lógica: salvar/atualizar conexão, sync de transações, mapeamento → despesa, dedup, conciliação |
| `pluggy.controller.ts` | handlers HTTP |
| `pluggy.routes.ts` | rotas autenticadas (JWT) |
| `pluggy.webhook.ts` | rota **pública** do webhook (valida secret, enfileira job, responde 2XX) |
| `pluggy.queue.ts` | job BullMQ `sync-pluggy-transactions` (reusa infra existente) |

**Rotas (montar em `server.ts`, padrão duplo `/api` e `/api/gestao`):**
```
GET    /pluggy/connect-token        (auth)  → cria connect_token p/ widget
POST   /pluggy/items                (auth)  → registra itemId, dispara sync inicial
GET    /pluggy/conexoes             (auth)  → lista conexões do usuário
DELETE /pluggy/conexoes/:id         (auth)  → desconectar (opcional: DELETE /items na Pluggy)
POST   /pluggy/conexoes/:id/sync    (auth)  → forçar re-sync manual
POST   /pluggy/webhook              (público, valida X-Webhook-Secret) → enfileira sync
```
> A rota de webhook deve ser montada **antes** do `checkSubscription`/auth, como já é feito com `webhookRoutes` do CRM.

**Config/env (`.env` + `config/env.ts`):**
```
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...
PLUGGY_WEBHOOK_SECRET=...      (gerar; mínimo recomendado do projeto)
PLUGGY_BASE_URL=https://api.pluggy.ai
```
> **Nunca commitar.** Adicionar ao `CREDENCIAIS.md`.

**Nginx:** a rota `/api/gestao/pluggy/webhook` já cai no proxy existente (`/api/gestao/` → `:4100/api/`). Confirmar que o webhook é acessível via HTTPS público (`https://duofuturo.mooo.com/...`), exigência da Pluggy.

### 5.3 Frontend

- `frontend/src/api/pluggy.ts` — client (connect-token, items, conexões, sync).
- Instalar `react-pluggy-connect`.
- Em `ExpensesList.tsx`:
  - Botão **"Conectar banco (Open Finance)"** que abre o `<PluggyConnect>` e, no `onSuccess`, chama `POST /pluggy/items`.
  - Nova coluna/badge **Origem**: ícone de banco + nome da instituição quando `origem === 'open_finance'`; ações de editar/excluir permanecem.
  - Aviso visual quando `status_conciliacao === 'possivel_duplicata'`.
- `frontend/src/types/expense.ts`: adicionar `origem`, `instituicao`, `pluggy_transaction_id?`, `status_conciliacao?`.
- (Opcional) tela/aba **"Contas conectadas"** para gerenciar conexões e re-sync.

---

## 6. Riscos e pontos de atenção

| Risco | Mitigação |
|-------|-----------|
| **Quebrar o CRUD de despesas existente** | Todas as colunas novas são opcionais com default (`origem='manual'`). O `SELECT *` atual continua funcionando; o `create()` manual não muda de comportamento. |
| **Duplicação de despesas** | `pluggy_transaction_id` UNIQUE + `ON CONFLICT DO NOTHING`; heurística de conciliação apenas **sinaliza**, nunca apaga manual. |
| **Webhook estourar 5s** | Responder 2XX imediatamente e processar via **fila BullMQ** (infra já existente). Nunca buscar transações no handler do webhook. |
| **Segurança do webhook (sem assinatura Pluggy)** | Validar `X-Webhook-Secret` por header customizado (padrão já no projeto). Webhook precisa ser HTTPS público. |
| **Vazamento de credenciais** | `clientId/clientSecret` só no backend; ao frontend vai apenas o `connectToken` descartável. Sem `.env`/`CREDENCIAIS.md` no git. |
| **Custo/limites da Pluggy** | Cachear `apiKey` (não chamar `/auth` a cada request). Sync incremental por `from`/`to` desde a última `ultima_sync_em`, não o histórico inteiro toda vez. |
| **Sinal de `amount`** | Confiar em `type === 'DEBIT'` + `Math.abs(amount)`; validar com dados reais em sandbox antes de produção. |
| **Cartão de crédito** | Fora do escopo da v1 (semântica diferente: compra vs fatura). Importar só conta corrente primeiro. |
| **Exclusão de conexão** | Definir o que acontece com despesas já importadas ao desconectar (manter histórico vs. ON DELETE SET NULL na FK — proposto: manter). |
| **Multi-tenancy** | `conexao_pluggy_id` sempre amarrada a `usuario_id`; sync nunca cruza usuários. Webhook resolve o dono via `pluggy_item_id`. |
| **Fuso/data** | Converter `date` ISO para `date` local BR de forma consistente (já há precedente de manipulação de datas no `createComParcelas`). |

---

## 7. Sequência de implementação sugerida (fases)

1. **Fase 0 — Conta sandbox Pluggy**: obter `clientId/clientSecret`, testar `/auth`, `/connect_token`, `/accounts`, `/transactions` com banco sandbox (Pluggy Bank).
2. **Fase 1 — Migration + módulo backend (read-only)**: colunas/tabelas, client, connect-token, registro de item, sync inicial manual via endpoint. Validar importação de débitos.
3. **Fase 2 — Webhook + fila**: rota pública com secret, job BullMQ, sync incremental.
4. **Fase 3 — Frontend**: widget, badge de origem, aviso de duplicata.
5. **Fase 4 — Conciliação e cartão de crédito** (incremental).

> Nota: existe um MCP pessoal ("MCP do banco PF", adapter Pluggy) disponível no ambiente — útil para **explorar/validar dados** de Open Finance durante o desenvolvimento, mas é ferramenta de uso pessoal e **não substitui** a integração server-to-server que será construída no app.

---

## 8. Configurações do cadastro Pluggy (preencher ao ativar trial)

| Item | Valor |
|------|-------|
| Webhook URL | `https://duofuturo.mooo.com/api/gestao/pluggy/webhook` |
| Stack (technologies) | Web: **React**, **JavaScript** · Backend: **Node.js** |

> **Atenção:** o webhook foi salvo sem testar para não iniciar a contagem dos 20 dias gratuitos. O endpoint `/api/gestao/pluggy/webhook` ainda não existe — deve ser implementado antes de ativar o trial e clicar em "Test Webhook".
