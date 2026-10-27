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

## Papéis de usuário — `comum < master < creator`

`usuarios.tipo_usuario` (ENUM `tipo_usuario_crm`). O `nivel = 'super_admin'` é do
SISTEMA e passa por cima de tudo — ele tem `empresa_id` (hoje a 1) e por isso aparece
na lista daquela empresa, mas nunca é gerenciável pela tela de administração.

| Papel | Pode |
|-------|------|
| `comum` | operação, limitada pelas permissões que o master define |
| `master` | tudo do comum + administra usuários (criar, promover até master, desativar, excluir comum) + vê e edita o financeiro de **todos** os usuários da empresa (`shared/escopoFinanceiro.ts`) |
| `creator` | tudo do master + **único que configura o agente de IA** — é o dono da conta |

Regras (`usuarios.service.ts`, espelhadas no frontend por `utils/roles.ts`):
atua-se sobre iguais e abaixo; **exclui-se só quem está abaixo**; ninguém promove
acima do próprio papel (master não cria creator); ninguém altera o próprio tipo nem
se desativa; e a empresa nunca fica sem administrador ativo.

**Nunca cheque `tipo_usuario === 'master'` direto** — use `isAdminEmpresa()` de
`shared/roles.ts` (API) ou `utils/roles.ts` (frontend), senão o creator fica de fora
de telas que são dele por direito. Foi o que quase aconteceu com o dashboard do Conta
Azul. `podeConfigurarAgenteIA()` é o único que separa creator de master.

O que é exclusivo do creator é a aba **Agente IA → Configurar Agente** (prompt geral,
tom, chave de API, modelo) — leitura e escrita, em `agente-ia.controller.ts`. As
instruções de agente **por estágio** e os prompts de **cada passo da cadência**
seguem abertos a qualquer usuário com acesso ao CRM, de propósito.

`tipo_usuario` viaja no JWT (8h, e o sistema não tem refresh): promover ou rebaixar
alguém só passa a valer **no próximo login** dele.

Migrations 064 (`ADD VALUE 'creator'` — precisa rodar como `postgres`, dono do ENUM)
e 065 (promove o master mais antigo de cada empresa a creator, para nenhuma conta
ficar sem quem configure o próprio agente).

Desde 13/09/2026 **o dono de conta nova já nasce `creator`** (`auth.service.registrar`,
no INSERT, no JWT e na resposta). Nascendo master, um cliente Enterprise recebia no
e-mail de boas-vindas a instrução de configurar o agente e esbarrava numa tela que
não era dele — sem ninguém acima para promovê-lo, porque ele É o dono da conta.

## Documentação por assunto — `docs/claude/`

O detalhe de cada área (decisões, incidentes, armadilhas) mora em `docs/claude/`. **Leia o arquivo do assunto antes de mexer nele** — não carregue todos.

| Arquivo | Assunto | Seções |
|---|---|---|
| `webhooks-captacao.md` | Webhooks de captação (Caixa Rápido, SendFlow, tags de origem, diagnóstico) | Webhooks de captação |
| `whatsapp.md` | WhatsApp — envio, webhook por porta, mídia, provisão, QR, canal oficial, Cloud API, reações, histórico | Envio de WhatsApp · Webhook de mensagem é por instância · Cota de mídia do WhatsApp e backup · Porta de WhatsApp por usuário · Conexão por QR · O canal do cliente Enterprise é o oficial · WhatsApp Cloud API · Reagir e responder citando no chat do card · Histórico de mensagens · Coexistência com o app WhatsApp Business · Um portfólio da Meta por empresa |
| `grupos.md` | Grupos do WhatsApp — página, campanhas, importar participantes | Página de Grupos do WhatsApp · Abrir e fechar por horário · Importar participantes de grupo |
| `crm-telas.md` | Telas do CRM — Kanban, F5/URL, planilha, disparo agendado, barra de ações, ordem e densidade | Arrastar card para coluna fora da tela · O F5 reabre onde estava · Importar planilha de leads · Editar disparo agendado · Barra de ações do CRM · Ordem dos cards do CRM · Densidade do quadro Kanban · Excluir leads em massa |
| `dashboards.md` | Financeiro e dashboards — parcelas, Conta Azul (dashboard e importação → Receitas/Despesas), Integrações, PDF, CRM Dashboard/produtividade | Lançamento à vista também tem parcela · Dashboard Conta Azul · Dashboard de Integrações · Dashboard "quem pagou / com o que foi gasto" · Relatório em PDF do Dashboard · Visão Geral (filtro fixo, comparação, filtros, master vê a empresa) · CRM Dashboard |
| `planos-e-conta.md` | Planos, capacidades, onboarding, trial/bloqueio, e-mail institucional, senha, suporte | Capacidades por plano · Planos, fidelidade e usuários inclusos · Boas-vindas de conta nova · Esqueci minha senha · Suporte por ticket |
| `email-assinatura.md` | Assinatura de e-mail | Assinatura de e-mail |
| `frontend-visual.md` | Frontend — Duo (avatar e chat), altura das páginas, modo escuro, material de onboarding | Interações do Duo · Altura das páginas · Modo escuro · Material de onboarding · Como o Duo escreve no chat · Ajuda em vídeo |
| `agenda-externa.md` | Reuniões do CRM no Google Agenda (Meet) e Microsoft 365 (Teams) — OAuth por usuário, sincronização, configuração | Agenda externa |
| `followup.md` | Motor de follow-up e respostas por botão | Motor de follow-up · Respostas por botão |
| `duo-agente.md` | Duo (chat) executando ações — cardápio, confirmação, créditos e recarga, afiliados, MCP, permissões no servidor | Regras · Como funciona · Permissões no servidor · Compra de crédito · Afiliados · MCP · Próximo |

## Regras que valem em qualquer tarefa

- Leitor novo de `historico_mensagens` que mostre conversa: `AND NOT copia_indevida` (e `grupo_whatsapp_id IS NULL` para 1:1).
- Todo envio grava em `historico_mensagens` **com `origem`** — sem ela fica fora do anti-ban.
- `numeric`/`bigint` do `pg` chegam como string: teste `Number(x) > 0`.
- Query com filtro opcional: numere pelo array (`params.push(x); $${params.length}`), nunca `$n` chumbado.
- Datas: `created_at`/`trial_expira_em` são naive em UTC → `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`; DATE no navegador → `dataPura()`.
- Webhook de captação novo entra também no `CATALOGO` do dashboard de Integrações.
- Capacidade nova: migration + `shared/capacidades.ts` + `frontend/src/utils/capacidades.ts`.
- Nenhuma conta usa configuração de outra (SMTP, chave de IA, agente).
- Mexeu em `api-multi-baileys.js`? `pm2 restart` em cada `whatsapp-30xx`.
- Credencial mora no `.env`, nunca repetida no `ecosystem.config.js`.

## Observações

- Módulos `integracoes` e `relatorios` foram removidos (ver git log)
- `notificacao-service` roda em paralelo — reiniciar junto se alterar config do banco
- Campo `empresa` na tabela usuarios — VIEW com campos calculados ativa
- RBAC implementado: roles admin/usuario com permissões distintas
