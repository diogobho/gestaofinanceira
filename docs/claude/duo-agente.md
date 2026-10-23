# Duo executando ações (21/10/2026)

O chat do Duo (`modules/chat-financeiro`) consulta, lança e edita no sistema. **Nunca exclui.**

## Regras (decisão do dono)
- Só o que a pessoa já pode fazer nas telas: papel (`escopoDono`) + permissões por módulo (`shared/permissoes.ts`).
- Todos os planos. Só Claude, sempre pela chave da DuoFuturo (`chaveDuo`: `DUO_ANTHROPIC_API_KEY` no .env ou,
  sem ela, a chave Claude da empresa 32 em `empresa_ia_credenciais`). Modelo `DUO_MODELO`, padrão `claude-sonnet-5-5`,
  thinking adaptativo com `effort: low`. A chave/modelo/provedor que a creator configura valem só para o agente de WhatsApp.
- Crédito por empresa em `duo_creditos_mov` (migration 110): teste de `DUO_CREDITO_TESTE_BRL` (padrão R$ 10) no 1º uso,
  consumo negativo por mensagem (câmbio `DUO_DOLAR_BRL`, margem `DUO_MARGEM`). `DUO_EMPRESAS_SEM_COBRANCA` (padrão 1,32).
  Saldo ≤ 0 → o Duo avisa e não chama a API. Compra de crédito pela plataforma: ainda não existe (lançar `tipo='compra'` à mão).

## Como funciona
- `acoes.ts` é o cardápio fechado. A IA não escreve SQL nem escolhe dono: o `ContextoDuo` vem do banco pelo id do JWT;
  o super_admin, no chat, fica na própria empresa como creator.
- Ação que grava só **propõe** (`duo_acoes`, pendente) e é executada por `confirmar_acao` numa mensagem SEGUINTE
  (`created_at < ctx.inicio`, claim atômico, validade 30 min). Resultado de ferramenta não confirma sozinho.
- `duo_acoes` guarda entrada, resumo, antes e depois — é a auditoria.
- Gravação pelos services das telas (`despesasService`, `receitasService`, `parcelasService`). Ids de lançamento/parcela são uuid.

## CRM (22/10/2026)
- Ações: `listar_funis` (etapas + equipe), `buscar_leads`, `ver_lead`, `listar_tarefas` (consulta) e `criar_lead`,
  `editar_lead`, `mover_lead`, `anotar_lead`, `criar_tarefa`, `concluir_tarefa`, `reagendar_tarefa` (com confirmação).
- Aparecem só com o plano com capacidade `crm` (`ctx.crm`) e o módulo `crm` nas permissões da pessoa.
- Escopo = empresa toda (o quadro mostra todos os cards a qualquer um com o módulo). Lead, tarefa e responsável são
  sempre conferidos contra `ctx.empresaId` antes de propor — os services de tarefa/anotação não conferem o lead sozinhos.
- Data/hora de tarefa chega em horário de Brasília ("AAAA-MM-DD HH:MM") e vira ISO UTC, como a tela manda.
- `mover_lead` roda as automações da etapa (follow-up, tarefas de entrada) como arrastar no quadro; em etapa de ganho
  cria cliente + card no CX, mas com `criar_receita: false` — o resumo avisa.
- Não envia WhatsApp, não agenda follow-up, não arquiva, não transfere de funil, não mexe em tag.

## Permissões no servidor
Desde 21/10 `server.ts` monta `exigePermissao` em clientes, sessoes, receitas, despesas, parcelas e dashboard (antes só o
menu escondia). Leitura aceita módulos vizinhos que as telas usam (Dashboard lê parcelas e clientes). CRM, WhatsApp e Agente
ainda sem checagem no servidor.

## Compra de crédito (111, 23/10/2026)
- Tela `/gestao/creditos-duo` (atalho na moeda do widget do Duo): saldo, pacotes, recargas e extrato por dia.
- Pacotes em `DUO_PACOTES_BRL` (padrão `20,50,100`). Só `isAdminEmpresa` compra; todos veem o saldo.
- `POST /chat-financeiro/creditos/comprar` cria `duo_creditos_compras` (pendente) e uma cobrança avulsa no Asaas com
  `billingType: UNDEFINED` (a pessoa escolhe PIX, boleto ou cartão na fatura) e `externalReference = duo_credito:<id>`.
  Sem customer no Asaas e sem CNPJ na empresa → 422 `PRECISA_DOCUMENTO`, a tela pede CPF/CNPJ.
- O crédito entra pelo webhook `/webhook/asaas` (desviado antes da assinatura em `assinaturas.controller`). O webhook é
  público: o status e o valor são relidos na API do Asaas, e `pendente → paga` numa UPDATE só — crédito uma vez.
- Sem saldo, o Duo responde com o link da tela de créditos.

## Indicação (111; regra de 113, 23/10/2026)
- Tela `/gestao/indique` (menu "Indique o Duo"). Link `duofuturo.tech/gestao/register?ref=<codigo>`, um código por empresa
  (`afiliados`), gerado na primeira visita. Só conta com assinatura paga e ativa gera link.
- O cadastro guarda o `ref` (URL ou localStorage) e grava `empresas.indicada_por_empresa_id`.
- **Recompensa fixa de R$ 20** (`AFILIADO_RECOMPENSA_BRL`) por indicada, no primeiro pagamento CONFIRMADO no Asaas
  (`processarWebhook` → `aoPagamentoAssinatura`, relido na API do Asaas). Uma por indicada (`afiliado_comissoes`,
  nome de 111; `valor_comissao` = a recompensa). Até 23/10 de manhã era 20% em dinheiro — mudou antes de existir linha.
- Quem administra a conta escolhe o destino de cada recompensa (`POST /afiliados/recompensas/:id/escolher`):
  - `credito_duo` → entra na hora em `duo_creditos_mov` com tipo `indicacao` (saldo de uso da IA).
  - `desconto` → `desconto_pendente`; abatido na próxima cobrança PENDING da assinatura recorrente
    (`updatePaymentValue`, só aquela cobrança), nunca abaixo de R$ 5. Aplica na escolha, no webhook
    `PAYMENT_CREATED` e num cron de hora em hora (`jobs/afiliados-desconto-scheduler.ts`) que cobre o webhook que não vier.
    Quem paga parcelado ou não tem assinatura recorrente só vê a opção de crédito.
- O abatimento no Asaas não foi testado com cobrança real (23/10): conferir na primeira vez.

## MCP — o Duo dentro do Claude (112, 23/10/2026)
- Conector: `https://duofuturo.tech/api/gestao/mcp` (Streamable HTTP sem sessão e sem SSE; POST JSON-RPC → JSON).
- OAuth 2.1 em `modules/mcp/oauth.ts`: emissor = `https://duofuturo.tech`; metadados em `/.well-known/oauth-*` da raiz
  (location do nginx → `/api/.well-known/…`); registro dinâmico; tela de login própria com PKCE S256; access 24h,
  refresh 90 dias com rotação; tokens só como sha256. Login: 10 tentativas por IP a cada 15 min por instância.
- As ferramentas são o `acoes.ts` com `carregarContexto` do dono do token (mesmo escopo, permissões e plano). `inicio`
  é renovado a cada `tools/call`: proposta de uma chamada anterior pode ser confirmada; a da mesma chamada, não. As
  `instructions` do `initialize` mandam só confirmar depois do "sim" da pessoa.
- Conta bloqueada (`bloqueioDaEmpresa`) → `tools/call` devolve erro. Não consome crédito do Duo.
- Na tela de créditos, seção "Usar o Duo dentro do Claude": endereço e conexões, com "Desconectar" (`/mcp-conexoes`).

## Próximo
CRM: follow-up, tags, arquivar (ainda fora); checar `crm` no servidor (`exigePermissao`). Tela de admin para marcar comissão paga.
