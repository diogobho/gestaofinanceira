# Relatório de Revisão — Gestão Financeira CRM

> Revisão de código, bugs e limpeza. **Data:** 30/05/2026
> Stack: API Express/TypeScript/PostgreSQL · Frontend React/Vite · PM2 (cluster 3x) + notificacao-service

---

## Sumário executivo

- ✅ **Limpeza** de arquivos desnecessários executada (scripts pontuais, código morto, artefatos de build, logs).
- ✅ **5 correções de bug não relacionadas a segurança** aplicadas, com builds (API + frontend) passando e API reiniciada.
- ⏸️ **Questões de segurança** documentadas porém **despriorizadas** a pedido do time (não aplicadas).
- ⏸️ **`uploads/whatsapp` (13 GB)** e demais `uploads/` preservados — precisam de política de retenção (decisão futura).

---

## 1. Segurança (DOCUMENTADO — não aplicado, despriorizado)

> Mantido para retomada futura. Nada aqui foi alterado.

### 🔴 1.1 Secret do webhook vaza sem autenticação
`GET /api/crm/webhook/secret` retorna o secret em texto puro **sem login**.
- `server.ts` monta `webhookRoutes` (público) **antes** do `crmRoutes` autenticado. O Express casa a rota pública primeiro (`webhook.routes.ts`).
- **Impacto:** qualquer um obtém o secret → injeta mensagens forjadas em `POST /webhook/whatsapp`.
- **Correção sugerida:** remover a rota `/webhook/secret` do `webhook.routes.ts` (manter só no `crm/index.ts` autenticado).

### 🔴 1.2 WEBHOOK_SECRET com fallback fixo no código
`webhook.controller.ts` → `process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024'`. A variável **não existe no `.env`** → usa o valor hardcoded (previsível/versionado).
- **Correção sugerida:** definir `WEBHOOK_SECRET` forte no `.env` e abortar o boot se ausente.

### 🔴 1.3 Verificação de assinatura nunca executa (paywall furado)
`checkSubscription` é registrado **globalmente** em `server.ts` antes de qualquer `authRequired`. Nesse ponto `req.user` é sempre `undefined`, então o middleware sempre libera.
- **Impacto:** empresas com assinatura expirada continuam usando o sistema.
- **Correção sugerida:** aplicar `checkSubscription` **após** o `authRequired`, dentro de cada router protegido.

### 🟠 Outros pontos de segurança (médio)
- Mídias do WhatsApp servidas publicamente (`/uploads` estático sem auth) — vazamento potencial (LGPD).
- Sem rate limiting no login (brute force) e sem `helmet` (headers de segurança).
- `zod` instalado porém **não usado** — nenhum body validado por schema.
- `error.message` repassado ao cliente em ~120 pontos (info disclosure).
- `crypto.ts` usa AES-256-CBC sem autenticação (considerar GCM).
- Refresh token configurado (`JWT_REFRESH_*`) mas **não implementado** (config morta).

---

## 2. Bugs corrigidos (APLICADO ✅)

| # | Correção | Arquivo |
|---|----------|---------|
| 1 | Pool do PostgreSQL **não derruba mais o processo** (`process.exit`) em erro de client ocioso — apenas loga | `api/src/config/database.ts` |
| 2 | Regra de senha padronizada para **mín. 8 caracteres** (antes o troca-senha exigia 6, inconsistente com o registro) | `api/src/modules/auth/auth.service.ts` |
| 3 | E-mail duplicado → **mensagem amigável** em vez de erro 500 do constraint (no `create` e no `update`) | `api/src/modules/usuarios/usuarios.service.ts` |
| 4 | `JSON.parse` do `localStorage` protegido com try/catch — localStorage corrompido **não quebra mais o app** no load | `frontend/src/contexts/AuthContext.tsx` |
| 5 | Fallback de `baseURL` corrigido de `http://localhost:3000/api` para `/api/gestao` | `frontend/src/api/client.ts` |

**Validação:** `tsc` (API) e `tsc -b && vite build` (frontend) compilaram sem erro. API reiniciada via PM2 (3 instâncias online, health check OK).

### Bugs documentados ainda não corrigidos (não-críticos)
- `registrar()` cria empresa+usuário+assinatura **sem transação SQL** (rollback manual) — risco de dados órfãos se o processo cair no meio. Refator de maior risco; deixado para uma janela dedicada.
- Frontend não trata `402` (assinatura) no interceptor — só relevante após corrigir o item 1.3 de segurança.

---

## 3. Limpeza executada (APLICADO ✅)

### Removidos
- **8 scripts pontuais** da raiz de `api/` (migração/import/validação da planilha Panthers — fora de `src/`, não compilados, com credenciais antigas hardcoded):
  `import-panthers-crm.js`, `inspect-columns.js`, `merge-imerso-estagios.js`, `populate-codigo-externo.js`, `reestrutura-estagios.js`, `validacao_crm.js`, `validacao_crm_corrigida.js`, `validacao_final.js`
- **Código morto:** `api/src/jobs/whatsapp-cobrancas.ts` (+ `.js` no dist) e o `import` comentado correspondente no `server.ts`.
- **Artefatos de build versionados do frontend:** `vite.config.js`, `vite.config.d.ts`, `tsconfig.node.tsbuildinfo`, `tsconfig.tsbuildinfo` (regeneráveis; `vite.config.ts` é a fonte real).

### Ajustes
- `frontend/.gitignore`: passou a ignorar `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`.
- **Logs truncados:** `logs/err.log` (37 MB → 0) e `logs/out.log`.
- **Docs consolidados em `docs/`:** `MECANISMOS_IA.md` e `fluxo_vendas_escola.html` movidos da raiz (preservados — contêm informação importante).

---

## 4. Pendências de decisão (NÃO alterado)

| Item | Observação |
|------|------------|
| **`uploads/whatsapp` = 13 GB** (11.917 arquivos desde fev/2026) | Dados reais de clientes. Sugestão simples: política de retenção (arquivar fev–mar em storage frio) + rotação. Decisão futura. |
| **Rotação de logs** | Recomendado `pm2 install pm2-logrotate` para evitar novo acúmulo (err.log chegou a 37 MB). |
| **`uploads/sheet/` e backup CSV** | Planilhas/CSV com dados de clientes — mantidos a pedido. |
| **Segurança (seção 1)** | Despriorizada; retomar quando houver janela. |

---

## 5. Pontos bem feitos (referência)

- Queries **parametrizadas** em todos os módulos revisados (sem SQL injection nos `WHERE` dinâmicos).
- Schedulers **cluster-aware** (`NODE_APP_INSTANCE === '0'`) evitam execução duplicada nas 3 instâncias PM2.
- Agente IA com **proteção anti-loop** e deadline de 2 min / `MAX_ITER=10`.
- Webhook Pluggy valida secret e responde `<5s` antes de processar.
- RBAC bem estruturado (super_admin / master / comum) com checagens de hierarquia consistentes.
- Senhas com `bcrypt` (cost 10) e isolamento multi-tenant por `usuario_id`/`empresa_id`.
