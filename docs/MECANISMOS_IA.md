# Mecanismos de IA — Gestão Financeira CRM

> Documentação técnica e conceitual para quem for entender, ajustar ou expandir os mecanismos de IA desta aplicação.
>
> **Última revisão:** Maio 2026

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Mecanismo 1 — Agente Reativo (WhatsApp)](#3-mecanismo-1--agente-reativo-whatsapp)
4. [Mecanismo 2 — Follow-up Agendado por IA](#4-mecanismo-2--follow-up-agendado-por-ia)
5. [Mecanismo 3 — Chat Financeiro (Sexta-feira)](#5-mecanismo-3--chat-financeiro-sexta-feira)
6. [Mecanismos Sem IA](#6-mecanismos-sem-ia)
7. [Configuração por Empresa](#7-configuração-por-empresa)
8. [Tabelas do Banco de Dados](#8-tabelas-do-banco-de-dados)
9. [Providers Suportados](#9-providers-suportados)
10. [Guia de Troubleshooting](#10-guia-de-troubleshooting)

---

## 1. Visão Geral

O sistema tem **três mecanismos que usam IA** e **três que não usam IA** mas fazem parte do mesmo ciclo de comunicação:

| # | Mecanismo | Usa IA | Trigger | Arquivo principal |
|---|-----------|--------|---------|-------------------|
| 1 | **Agente Reativo** | Sim | Mensagem WA chega | `modules/agente-ia/agente-ia.service.ts` |
| 2 | **Follow-up Agendado** | Sim (tipo `agente_ia`) | Cron 1 min | `jobs/followup-scheduler.ts` |
| 3 | **Chat Financeiro** | Sim | HTTP POST (usuário digita) | `modules/chat-financeiro/chat-financeiro.service.ts` |
| 4 | Follow-up Manual | Não | Cron 1 min | `jobs/followup-scheduler.ts` |
| 5 | Disparo em Lote | Não | Cron 1 min | `jobs/disparo-scheduler.ts` |
| 6 | Cobranças/Lembretes WA | Não | Cron diário 09h/10h | `jobs/whatsapp-cobrancas.ts` |

**Providers suportados:** Claude (Anthropic SDK nativo) e Gemini (via HTTP direto). A escolha é por empresa via `empresa_ia_credenciais`.

---

## 2. Arquitetura

```
                                   ┌─────────────────────────────────────────┐
                                   │            CONFIGURAÇÃO POR EMPRESA      │
                                   │  agente_ia_config + empresa_ia_credenciais│
                                   └──────────────────┬──────────────────────┘
                                                       │
              ┌──────────────────────────────────────┬─┴───────────────────────────────┐
              │                                      │                                 │
    ┌─────────▼─────────┐               ┌────────────▼───────────┐        ┌────────────▼──────────┐
    │  AGENTE REATIVO    │               │    FOLLOW-UP AGENDADO  │        │  CHAT FINANCEIRO       │
    │                   │               │                        │        │  (Sexta-feira)         │
    │ Msg WA → BullMQ   │               │ Cron 1min → processa   │        │ HTTP POST → processar()│
    │ → Worker → IA     │               │ followups_agendados     │        │ → IA → resposta HTTP  │
    └─────────┬─────────┘               └────────────┬───────────┘        └────────────┬──────────┘
              │                                      │                                 │
              │     ┌────────────────────────────────┤                                 │
              │     │         agente-ia.service.ts    │                                 │
              │     │  ┌───────────────────────────┐  │                                 │
              └─────►  │ processarMensagemSeAtivo() │  │                                 │
                    │  │ processarFollowUpIA()      │  │                                 │
                    │  └───────────────────────────┘  │                                 │
                    └────────────────────────────────────┘                               │
                                                                                         │
                                                              chat-financeiro.service.ts │
                                                              └────────────────────────◄─┘
                                  ┌───────────────┐
                                  │  LLM PROVIDER │
                                  │  Claude/Gemini│
                                  └───────────────┘
                                         │
                              Histórico → historico_mensagens
                              Logs     → agente_ia_acoes_log
                              CRM      → anotacoes_lead, tarefas, leads...
```

---

## 3. Mecanismo 1 — Agente Reativo (WhatsApp)

### Conceito

O agente reativo responde automaticamente quando um lead envia mensagem no WhatsApp. Funciona como se um vendedor real estivesse no WhatsApp, podendo mover leads no funil, criar tarefas, agendar sessões e registrar informações — tudo de forma invisível para o lead.

**Quando o agente não responde:**
- O agente está desativado globalmente (`agente_ia_config.ativo = false`)
- O agente está desativado para o estágio do lead (`estagios_funil.agente_ia_ativo = false`)
- O lead tem override individual de desativação (`leads.agente_ia_ativo = false`)
- O contato é o próprio número da instância WA (guard anti-loop)
- Um humano respondeu durante o delay de espera (guard anti-duplicação)

### Fluxo técnico

```
1. Msg WA chega → webhook do WhatsApp → salva em historico_mensagens
2. Verifica se lead tem agente ativo (estagio ou override individual)
3. adicionarJobAgente() → BullMQ queue "agente-ia"
   - Usa jobId = "lead-{id}" → uma única fila por lead
   - Se já há job em "delayed/waiting", NÃO cria novo (mensagem será agregada)
   - Delay configurável por empresa (agente_ia_config.delay_segundos)
4. Após o delay, Worker BullMQ executa:
   - processarMensagemSeAtivo()
   - Agrega TODAS as mensagens recebidas desde triggerAt (evita resposta para cada msg)
   - Checa se humano respondeu durante o delay → aborta se sim
5. Constrói system prompt com contexto do lead
6. Loop agentic (máx 10 iterações + deadline 2min):
   - IA decide: responder OU usar ferramenta
   - Ferramentas executadas no servidor, resultado volta para IA
   - Repete até end_turn
7. Envia resposta final via contatosService.enviarMensagem()
8. Loga ação em agente_ia_acoes_log
```

### Ferramentas disponíveis (17)

**CRM:**
- `criar_tarefa` — agenda ligações, reuniões, follow-ups, etc.
- `listar_tarefas` — lista tarefas do lead
- `concluir_tarefa` — marca tarefa como concluída
- `mover_lead_estagio` — move lead no funil de vendas
- `criar_anotacao` — registra nota interna sobre o lead
- `atualizar_lead` — atualiza temperatura, valor potencial, notas, etc.
- `marcar_lead_perdido` — move lead para estágio de perdido
- `buscar_atividades_lead` — histórico de atividades

**Sessões:**
- `criar_sessao` — agenda reunião/consultoria no módulo financeiro
- `listar_sessoes` — lista sessões agendadas

**Clientes:**
- `listar_clientes` — lista clientes do módulo financeiro
- `buscar_cliente` — busca cliente por ID

**Financeiro:**
- `criar_receita` — registra recebimento
- `listar_receitas` — lista receitas com filtros
- `criar_despesa` — registra gasto
- `listar_despesas` — lista despesas com filtros

### System Prompt

Construído por `buildSystemPrompt()` em `agente-ia.service.ts`. Inclui:
- **Identidade:** nome do responsável atual do lead (ou `nome_agente` da config) + área de negócio
- **Data atual** (fuso America/Sao_Paulo)
- **Tom de comunicação:** formal / casual / amigável (configurável)
- **Contexto do lead:** nome, telefone, email, temperatura, estágio, tags, notas, anotações
- **Estágios do funil com IDs** (para uso nas ferramentas)
- **Instruções do estágio** (`estagios_funil.instrucoes_agente_ia`)
- **Instruções gerais** (`agente_ia_config.system_prompt_extra`)
- **8 regras invioláveis:** foco principal em nunca revelar ao lead que existe um CRM ou que ações foram tomadas nos bastidores

### Configuração relevante

| Campo | Tabela | Descrição |
|-------|--------|-----------|
| `ativo` | `agente_ia_config` | Liga/desliga o agente globalmente |
| `delay_segundos` | `agente_ia_config` | Tempo de espera antes de responder (agregação de msgs) |
| `contexto_mensagens` | `agente_ia_config` | Quantas mensagens do histórico incluir |
| `max_tokens` | `agente_ia_config` | Limite de tokens na resposta |
| `tom` | `agente_ia_config` | `formal` / `casual` / `amigavel` |
| `system_prompt_extra` | `agente_ia_config` | Instruções adicionais livres |
| `agente_ia_ativo` | `estagios_funil` | Ativa agente para todos os leads neste estágio |
| `agente_ia_ativo` | `leads` | Override individual (null = herda do estágio) |
| `instrucoes_agente_ia` | `estagios_funil` | Instrução específica para o estágio |

---

## 4. Mecanismo 2 — Follow-up Agendado por IA

### Conceito

Permite agendar envios automáticos de mensagens para leads. Há dois tipos:
- **`manual`:** mensagem fixa pré-escrita, enviada no horário exato
- **`agente_ia`:** a IA gera uma mensagem contextualizada na hora do envio

O follow-up respeita janela de horário (`hora_inicio`/`hora_fim`) e dias da semana (`dias_semana`). Fora da janela, o registro fica pendente e é tentado novamente no próximo minuto.

### Fluxo técnico

```
Cron: toda 1 minuto (apenas instância PM2 #0)
  ↓
followupsService.buscarPendentes()
  → SELECT * FROM followups_agendados WHERE status='pendente' AND agendado_para <= NOW()
  ↓
Para cada follow-up:
  1. Verificar janela de horário → pular se fora (deixa pendente)
  2. Verificar contato_whatsapp_id → falhar se ausente
  3a. tipo='manual' → enviar mensagem diretamente → marcarEnviado
  3b. tipo='agente_ia':
      → processarFollowUpIA()
      → resultado 'enviado'  → marcarEnviado
      → resultado 'adiado'   → deixa pendente (conversa ativa nos últimos 60min)
      → resultado 'cancelado'→ cancelar (agente desativado para o lead)
      → throw Error          → marcarFalhou
```

### Guard anti-duplicação

Antes de processar, `processarFollowUpIA` verifica se houve mensagem de saída nos últimos 60 minutos. Se houve, retorna `'adiado'` — o follow-up permanece `pendente` e o scheduler tenta novamente no próximo minuto.

Isso evita enviar um follow-up se:
- O vendedor respondeu manualmente pouco antes
- O agente reativo acabou de responder
- Outro follow-up foi processado recentemente

### Diferença em relação ao Agente Reativo

O follow-up IA usa uma **chamada única** (sem loop agentic) porque seu objetivo é simples: gerar **uma mensagem** contextualizada. Não há necessidade de ferramentas ou múltiplas iterações.

| Aspecto | Agente Reativo | Follow-up IA |
|---------|----------------|--------------|
| Ferramentas | 17 tools | Nenhuma |
| Loop agentic | Sim (máx 10 iter) | Não (1 chamada) |
| Objetivo | Responder conversa | Iniciar contato |
| max_tokens | `config.max_tokens` | `min(config.max_tokens, 512)` |
| Temperatura | 0.7 | 0.75 |

Após o envio, uma **anotação é criada automaticamente** no lead (`anotacoes_lead`) registrando o texto enviado, garantindo rastreabilidade no CRM sem depender de ferramenta de IA.

### System Prompt

Construído por `buildSystemPromptFollowUp()`. Inclui:
- Identidade (responsável atual do lead ou `nome_agente`)
- **Data atual** (fuso SP)
- Tom de comunicação
- Contexto do lead (nome, empresa, cargo, temperatura, estágio, tags, notas, anotações)
- **Instrução específica do follow-up** (`followups_agendados.instrucao_ia`)
- Instrução explícita: "Escreva uma mensagem de follow-up natural" — a IA sabe que é ela quem inicia

### Campos da tabela `followups_agendados`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tipo` | `manual \| agente_ia` | Define se é mensagem fixa ou gerada por IA |
| `mensagem` | text | Texto fixo (tipo manual) |
| `instrucao_ia` | text | Instrução para a IA (tipo agente_ia) |
| `agendado_para` | timestamp | Data/hora do envio |
| `hora_inicio` | time | Início da janela de horário permitido |
| `hora_fim` | time | Fim da janela de horário permitido |
| `dias_semana` | int[] | Array de dias permitidos (0=Dom..6=Sáb) |
| `origem` | `lead \| estagio` | De onde veio o agendamento |
| `status` | `pendente \| enviado \| falhou \| cancelado` | Estado atual |
| `erro` | text | Mensagem de erro em caso de falha |

---

## 5. Mecanismo 3 — Chat Financeiro (Sexta-feira)

### Conceito

A "Sexta-feira" é uma assistente de IA acessível diretamente na interface web do sistema. Diferente do Agente Reativo (que opera no WhatsApp de forma autônoma), ela responde a perguntas feitas pelos **membros da equipe** no sistema.

Pode:
- Consultar e explicar receitas, despesas, saldo, parcelas
- Adicionar novas receitas/despesas quando confirmado pelo usuário
- Analisar padrões de gasto e fazer projeções
- Explicar como usar funcionalidades do sistema (CRM, automações, etc.)
- Criar scripts de abordagem para vendas
- Gerenciar assinaturas de empresas (apenas `super_admin`)

### Fluxo técnico

```
HTTP POST /api/gestao/chat-financeiro
  ↓
chatFinanceiroController → chatFinanceiroService.processar()
  ↓
1. Buscar config (empresa-específica → fallback global)
2. Verificar se ativo e com API key
3. Carregar histórico da conversa (chat_financeiro_historico)
4. Loop agentic (máx 10 iter + deadline 2min):
   - IA decide: responder OU usar ferramenta financeira
   - Ferramentas consultam/modificam dados do usuário
5. Salvar mensagem user + resposta IA em chat_financeiro_historico
6. Retornar texto da resposta
```

### Ferramentas disponíveis (8 + 1 admin)

| Ferramenta | Descrição |
|-----------|-----------|
| `buscar_resumo_financeiro` | Totais de receitas/despesas por período ou geral |
| `listar_despesas` | Despesas com filtros (categoria, mês, status) |
| `listar_receitas` | Receitas com filtros (fonte, mês, status) |
| `adicionar_despesa` | Cria nova despesa (requer confirmação antes) |
| `adicionar_receita` | Cria nova receita (requer confirmação antes) |
| `listar_categorias_despesas` | Categorias existentes |
| `listar_categorias_receitas` | Fontes/categorias de receitas existentes |
| `despesas_por_categoria` | Análise de gastos agrupados por categoria |
| `evolucao_mensal` | Evolução de receitas/despesas/saldo mês a mês |
| `parcelas_pendentes` | Parcelas a vencer nos próximos N dias |
| `gerenciar_assinatura_empresa` *(super_admin only)* | Suspende, cancela ou ativa assinatura |

### Diferenças em relação ao Agente Reativo

| Aspecto | Agente Reativo | Chat Financeiro |
|---------|----------------|-----------------|
| Audiência | Lead externo (WhatsApp) | Equipe interna (interface web) |
| Persona | Nome do responsável do lead | Fixa: "Sexta-feira" |
| Tools | CRM + financeiro | Apenas financeiro |
| Histórico | `historico_mensagens` | `chat_financeiro_historico` |
| Guard anti-loop | Sim | Não necessário |
| Config | `agente_ia_config` | `chat_financeiro_config` |

### Configuração

A config pode ser **por empresa** ou **global** (fallback). O campo `empresa_id = NULL` na tabela `chat_financeiro_config` define a configuração padrão para empresas sem config própria.

As credenciais de API key vêm sempre de `empresa_ia_credenciais` — a mesma tabela usada pelo Agente Reativo. Ou seja, configurar a API key uma vez serve para ambos os mecanismos.

---

## 6. Mecanismos Sem IA

### Follow-up Manual

Mesmo scheduler do follow-up IA. Quando `tipo = 'manual'`, simplesmente envia a mensagem pré-definida via `contatosService.enviarMensagem()`. Sem processamento de IA.

### Disparo em Lote (`disparo-scheduler.ts`)

- Cron a cada 1 minuto (apenas instância PM2 #0)
- Processa registros de `disparos_crm` com `status = 'agendado'` cujo horário chegou
- Atualiza status para `processando` via UPDATE atômico (proteção contra duplicação)
- Executa disparo WhatsApp (`disparosService`) ou e-mail (`disparosEmailService`)
- Usado para campanhas de marketing, avisos em massa, etc.

### Cobranças e Lembretes (`whatsapp-cobrancas.ts`)

- **09:00** — Lembretes de pagamento para parcelas que vencem **amanhã**
- **10:00** — Cobranças para parcelas **já vencidas**
- Mensagens pré-formatadas, sem IA
- Usa `WhatsAppNotificacoesService`

---

## 7. Configuração por Empresa

### Credenciais de API (`empresa_ia_credenciais`)

```sql
SELECT * FROM empresa_ia_credenciais WHERE empresa_id = <id>;
```

| Campo | Descrição |
|-------|-----------|
| `provider` | `claude` ou `gemini` |
| `api_key` | Chave da Anthropic (Claude) |
| `gemini_api_key` | Chave do Google AI (Gemini) |
| `modelo` | Ex: `claude-sonnet-4-6`, `gemini-2.5-flash` |

**Fallbacks de modelo:**
- Claude: `claude-sonnet-4-6`
- Gemini: `gemini-2.5-flash`

### Comportamento do Agente (`agente_ia_config`)

```sql
SELECT * FROM agente_ia_config WHERE empresa_id = <id>;
```

| Campo | Padrão sugerido | Descrição |
|-------|-----------------|-----------|
| `ativo` | `true` | Liga/desliga o agente |
| `nome_agente` | — | Nome exibido para o lead |
| `tom` | `amigavel` | `formal` / `casual` / `amigavel` |
| `area_negocio` | — | Ex: "Escola de Empreendedorismo Panthera" |
| `system_prompt_extra` | — | Instruções livres adicionadas ao prompt |
| `delay_segundos` | `15` | Aguarda X segundos antes de responder (agrega msgs) |
| `max_tokens` | `1024` | Limite de tokens na resposta |
| `contexto_mensagens` | `20` | Qtd de mensagens do histórico usadas como contexto |
| `usuarios_habilitados` | `[]` | IDs dos usuários que podem usar o agente (vazio = todos) |

### Ativação por Estágio

```sql
UPDATE estagios_funil SET agente_ia_ativo = true WHERE id = <id>;
```

Todos os leads neste estágio passam a ser respondidos pelo agente automaticamente. O campo `instrucoes_agente_ia` permite adicionar instrução específica para o comportamento naquele estágio (ex: "O lead está em avaliação de proposta, foque em responder objeções de preço").

### Override Individual por Lead

```sql
UPDATE leads SET agente_ia_ativo = true  WHERE id = <id>; -- forçar ON
UPDATE leads SET agente_ia_ativo = false WHERE id = <id>; -- forçar OFF
UPDATE leads SET agente_ia_ativo = NULL  WHERE id = <id>; -- herdar do estágio
```

---

## 8. Tabelas do Banco de Dados

### Tabelas de configuração

| Tabela | Propósito |
|--------|-----------|
| `empresa_ia_credenciais` | API keys e modelo por empresa (compartilhada entre agente e chat) |
| `agente_ia_config` | Comportamento do agente reativo e follow-up IA por empresa |
| `chat_financeiro_config` | Config do chat financeiro (Sexta-feira), com fallback global |

### Tabelas de operação

| Tabela | Propósito |
|--------|-----------|
| `historico_mensagens` | Todas as mensagens WA (entrada/saída). Fonte de contexto para o agente e follow-up IA |
| `agente_ia_acoes_log` | Log de todas as ações do agente (tool calls, respostas, erros, skips) |
| `followups_agendados` | Fila de follow-ups (manual e agente_ia) com janelas de horário |
| `chat_financeiro_historico` | Histórico de conversa do chat financeiro por usuário |
| `automacoes` | Tabela unificada de automações, sincronizada com estados do agente |

### Consultas úteis de diagnóstico

```sql
-- Ver últimas ações do agente para um lead
SELECT * FROM agente_ia_acoes_log
WHERE lead_id = <id>
ORDER BY created_at DESC LIMIT 20;

-- Follow-ups pendentes atrasados
SELECT f.*, l.nome AS lead_nome
FROM followups_agendados f
JOIN leads l ON l.id = f.lead_id
WHERE f.status = 'pendente' AND f.agendado_para < NOW()
ORDER BY f.agendado_para ASC;

-- Follow-ups que falharam hoje
SELECT * FROM followups_agendados
WHERE status = 'falhou'
AND DATE(updated_at) = CURRENT_DATE;

-- Histórico de conversa de um lead (fonte de contexto da IA)
SELECT direcao, conteudo, enviado_at
FROM historico_mensagens
WHERE lead_id = <id> AND tipo = 'texto'
ORDER BY enviado_at DESC LIMIT 30;

-- Verificar status do agente para um lead
SELECT l.agente_ia_ativo AS lead_override, ef.agente_ia_ativo AS estagio_ativo
FROM leads l
JOIN estagios_funil ef ON ef.id = l.estagio_id
WHERE l.id = <id>;
```

---

## 9. Providers Suportados

### Claude (Anthropic)

- Usa o **SDK oficial** `@anthropic-ai/sdk`
- Tool use nativo com `stop_reason === 'tool_use'`
- Suporta todos os modelos Claude 3/4 (ex: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`)
- Fallback padrão: `claude-sonnet-4-6`

### Gemini (Google)

- Chamadas via **HTTP direto** (axios) para a API REST
- Function calling via `functionDeclarations`
- Modelos disponíveis: `gemini-2.5-flash`, `gemini-2.0-flash`, etc.
- Fallback padrão: `gemini-2.5-flash`

### Troca de provider

O provider é definido por empresa em `empresa_ia_credenciais.provider`. Para trocar:

```sql
UPDATE empresa_ia_credenciais
SET provider = 'gemini', gemini_api_key = '<key>', modelo = 'gemini-2.5-flash'
WHERE empresa_id = <id>;
```

---

## 10. Guia de Troubleshooting

### O agente não responde às mensagens

1. **Verificar config ativa:**
   ```sql
   SELECT ativo, provider, modelo FROM agente_ia_config WHERE empresa_id = <id>;
   SELECT provider, api_key IS NOT NULL as tem_claude, gemini_api_key IS NOT NULL as tem_gemini
   FROM empresa_ia_credenciais WHERE empresa_id = <id>;
   ```

2. **Verificar status do lead/estágio:**
   ```sql
   SELECT l.agente_ia_ativo, ef.agente_ia_ativo
   FROM leads l JOIN estagios_funil ef ON ef.id = l.estagio_id
   WHERE l.id = <id>;
   ```

3. **Ver log de ações:**
   ```sql
   SELECT acao, sucesso, erro, created_at
   FROM agente_ia_acoes_log WHERE lead_id = <id> ORDER BY created_at DESC LIMIT 10;
   ```

4. **Verificar BullMQ (Redis):** O job pode estar travado. Verificar com `pm2 logs gestao-financeira-api`.

### Follow-up não é enviado

1. **Verificar se está pendente:**
   ```sql
   SELECT * FROM followups_agendados WHERE id = <id>;
   ```

2. **Se `status = 'falhou'`:** ver campo `erro` — geralmente é falta de `contato_whatsapp_id`, agente IA sem config ou API key inválida.

3. **Se permanece `pendente` após o horário:** pode estar sendo adiado pelo guard de conversa ativa (mensagem enviada nos últimos 60min). Verificar `historico_mensagens` recentes do lead.

4. **Verificar logs do PM2:** `pm2 logs gestao-financeira-api --lines 100 | grep "FollowUp"`

### Chat Financeiro sem resposta

1. **Verificar config:**
   ```sql
   SELECT * FROM chat_financeiro_config WHERE empresa_id = <id>;
   -- Se vazio, verifica fallback global:
   SELECT * FROM chat_financeiro_config WHERE empresa_id IS NULL;
   ```

2. **API key:** ver `empresa_ia_credenciais` — a mesma chave do Agente Reativo.

3. **Logs:** `pm2 logs gestao-financeira-api --lines 50 | grep "ChatFinanceiro"`

### Agente entra em loop ou responde múltiplas vezes

O guard anti-duplicação deve prevenir isso. Mas se acontecer:
- Verificar se `delay_segundos` está muito baixo (< 5s)
- O `jobId = "lead-{id}"` garante um único job por lead — se o Redis estiver instável, pode haver duplicação
- Verificar se há múltiplas instâncias PM2 sem o guard (`NODE_APP_INSTANCE`)

### Rebuild após alterações

```bash
cd /var/www/apps/gestao_financeira/api
npm run build
pm2 restart gestao-financeira-api
```

---

## Referência de Arquivos

```
api/src/
├── jobs/
│   ├── followup-scheduler.ts       # Cron 1min: follow-ups manual + agente_ia
│   ├── disparo-scheduler.ts        # Cron 1min: disparos em lote (instância 0 only)
│   └── whatsapp-cobrancas.ts       # Cron 09h/10h: lembretes e cobranças
│
├── modules/
│   ├── agente-ia/
│   │   ├── agente-ia.service.ts    # Lógica central do agente reativo e follow-up IA
│   │   ├── agente-ia.queue.ts      # BullMQ queue + worker (Redis)
│   │   ├── agente-ia.controller.ts # Endpoints: config, toggle estágio/lead
│   │   └── agente-ia.routes.ts
│   │
│   ├── chat-financeiro/
│   │   ├── chat-financeiro.service.ts  # Lógica da Sexta-feira
│   │   ├── chat-financeiro.controller.ts
│   │   └── chat-financeiro.routes.ts
│   │
│   └── crm/followups/
│       ├── followups.service.ts    # CRUD de followups_agendados
│       ├── followups.controller.ts
│       └── followups.routes.ts
│
└── server.ts                       # Registra todos os módulos e inicia os jobs
```
