# Prompt — Revisão e teste completo do WhatsApp (QR Code × API Oficial)

> Cole tudo abaixo da linha numa sessão NOVA do Claude Code, aberta em
> `/var/www/apps/gestao_financeira`. Escrito em 28/09/2026; se o CLAUDE.md da app
> tiver seções mais novas que isso, elas mandam.

---

Você vai revisar e testar **tudo o que envolve WhatsApp** no Gestão Financeira CRM, nos
dois canais: **QR Code** (Baileys, instâncias `whatsapp-30xx` em
`/var/www/apps/whatsapp-integration/api-multi-baileys.js`) e **API Oficial da Meta**
(Cloud API, porta virtual ≥ 49000). O objetivo é responder, com evidência, três
perguntas:

1. Cada funcionalidade funciona nos dois canais do jeito que o produto promete?
2. O código faz o que o `CLAUDE.md` diz que faz, e o `CLAUDE.md` diz o que o código faz?
3. O que está quebrado, arriscado ou inconsistente — em ordem de gravidade?

**Você não corrige nada nesta sessão.** Entrega um relatório. Correção é outra conversa,
depois que eu ler e aprovar.

## 0. Antes de tudo — leia

- `/var/www/apps/CLAUDE.md` e `/var/www/apps/gestao_financeira/CLAUDE.md` inteiros. As
  seções de WhatsApp, capacidades por plano, follow-up, disparo, grupos, onboarding e
  cota de mídia são a especificação contra a qual você vai comparar o código.
- `docs/META_TECH_PROVIDER.md`, `docs/MODELOS_ABORDAGEM_META.md`,
  `docs/INCIDENTE_CHIP2_ENVIO_SILENCIOSO.md`.
- A memória do projeto (`MEMORY.md` e os arquivos que ela aponta sobre WhatsApp).

## 1. Regras de segurança — valem acima de qualquer passo

Isto é **produção** com clientes reais. Não existe ambiente de teste separado.

- **Nunca envie mensagem para contato, lead ou grupo real** — nem "teste", nem "oi".
  Mensagem saída de chip de cliente não volta atrás e pode custar o número.
- Para testar envio sem atingir ninguém:
  - use **destino inexistente** (grupo `120363000000000000@g.us`, número
    `5511900000001`): o WhatsApp recusa e o fluxo inteiro roda até o registro da falha;
  - use **eventos simulados** no webhook (`POST /api/gestao/crm/webhook/whatsapp` com o
    `X-Webhook-Secret` do `.env` e `port` de um chip nosso) para testar entrada;
  - use **token JWT de teste** assinado com `JWT_ACCESS_SECRET` (validade de 10 min) para
    chamar a API como um usuário, fazendo **só leitura** ou ações que você desfaz.
- Contas que você pode usar:
  - **Empresa 31 (demo, Clínica Vida Leve)** — dados fictícios, sem chip. Pode criar e apagar.
  - **Empresa 32 (suporte@, chip 3019)** — é o número PESSOAL do Diogo, com 140+ grupos
    reais: leitura liberada, envio só para destino inexistente.
  - **Empresa 1 (conta institucional, número oficial +55 11 94052-4435, porta 49000)** —
    nosso; leitura liberada.
  - **Empresa 5 (Panteras) e Débora (usuário 22, número oficial +55 85 9205-1233, porta
    49001)** — cliente real: **somente leitura**. Nada de criar modelo, mudar perfil,
    enviar, reagir ou mexer em configuração.
- Envio real entre dois números NOSSOS (ex.: 3019 → número oficial da empresa 1) só com a
  minha autorização explícita, pedida antes, dizendo o texto e os dois números.
- Tudo o que você criar para teste leva o prefixo `TESTE-REVISAO` e é **apagado no fim**.
  Guarde o estado anterior antes de mudar qualquer linha e restaure depois. Liste no
  relatório o que criou e confirme que apagou.
- **Não reinicie** instâncias `whatsapp-30xx` nem a API sem me perguntar — reiniciar chip
  derruba a conexão de cliente por alguns segundos.
- Não chame a Graph API com escrita (criar/excluir modelo, registrar número, perfil). Só GET.
- Não faça commit, não faça push, não rode migration.
- `CREDENCIAIS.md` e `.env` podem ser lidos para testar, nunca copiados para o relatório.

## 2. Checagens automáticas (rode primeiro, anote o resultado)

```bash
cd api && npx tsc --noEmit -p . && npm test
cd ../frontend && npx tsc --noEmit -p . && npx eslint src/pages/whatsapp src/pages/grupos src/components/crm
cd ../api && node scripts/verificar_capacidades.js --api
node scripts/verificar_canal_oficial.js --meta
for p in $(pm2 jlist | python3 -c "import sys,json;print(' '.join(p['name'].split('-')[1] for p in json.load(sys.stdin) if p['name'].startswith('whatsapp-30')))"); do echo "$p $(curl -s -m 5 localhost:$p/status | head -c 160)"; done
```

Cada falha ou aviso entra no relatório com a saída real.

## 3. Matriz de funcionalidades — teste cada linha nos dois canais

Para cada item: **o que o CLAUDE.md promete → o que o código faz (arquivo:linha) → o que
o teste mostrou**. Marque QR e Oficial separadamente: ✅ funciona · ❌ quebrado ·
⚠️ funciona com ressalva · — não se aplica · 🔒 não testável sem envio real (diga por quê).

### 3.1 Conexão e canal
- Provisão de porta (`services/whatsapp-provision.service.ts`): conta nova, membro de
  equipe, autocura, porta com rastro nunca reusada, Enterprise sem instância automática.
- Escolha de canal (`EscolhaDeCanal.tsx`, `POST /whatsapp/qr/ativar`).
- QR: geração, laço 428 vs 408, 403 ≠ ban (3 recusas em ≥10 min), sonda de desbloqueio,
  "Tentar agora" / "Conectar outro número", textos de `diagnosticoConexao.ts`.
- Oficial: Embedded Signup nos 4 passos (sem executar), `subscribed_apps` conferido,
  `pagamento_ok`, ligar/desligar conta por id, `contaGerenciavel`.
- `enviaPeloOficial` (pela porta) × `contaAtivaDoUsuario` (com reserva da empresa):
  procure todo lugar em que os dois podem discordar e diga o efeito.

### 3.2 Entrada (webhook)
- `receberMensagem`: `port` obrigatório, empresa do dono da porta, contato do dono tem
  preferência, `copia_indevida` fora de toda leitura (procure leitores novos de
  `historico_mensagens` sem `AND NOT copia_indevida`).
- Primeira mensagem de número desconhecido vira card só com estágio `auto_criar_lead`.
- Grupo: gravado sem mídia, não vale como resposta de lead, não move estágio.
- Reação e citação (#188, migration 086), dedup por `whatsapp_message_id`, eco de envio.
- Evento de entrada em grupo (`group_participants`) → fila de boas-vindas.
- Áudio → transcrição Gemini → agente; sem chave Gemini, o que acontece.
- Oficial: assinatura `X-Hub-Signature-256` com `META_APP_SECRET`, janela de 24h aberta
  pela mensagem do cliente, status de entrega, erro 131047.
- Onboarding: mensagem com código de 4 caracteres responde com texto + PDF; sem código,
  `desfecho = 'sem_conta'`.

### 3.3 Saída
- Chat do card: sai pelo chip do RESPONSÁVEL; mídia; citar e reagir; histórico com
  `origem`; 503 × 422 × 400 × 500 com o tratamento documentado.
- Oficial: janela de 24h (faixa verde/amarela), envio de modelo fora da janela, variáveis,
  reação só dentro da janela, destino com `+` não ganha `55`.
- Todo caminho de envio preenche `historico_mensagens.origem`? Liste os que não preenchem.

### 3.4 Disparo em massa
- Capacidade `disparo_whatsapp` + `soPeloOficial` (403 `SO_PELO_OFICIAL`) em preview,
  criar e editar agendado; checagem de novo na hora do agendado sair.
- Com modelo: variáveis, modelo inexistente, conta desligada.
- Intervalo anti-ban, estágio pós-disparo via `moverPorAutomacao`, histórico gravado mesmo
  sem contato vinculado.
- `BotaoDoPlano exigeOficial` na tela (Kanban e CRM CX).

### 3.5 Cadência / follow-up (`jobs/followup/`)
- `despachar`: `sem_capacidade`, `so_oficial`, `sem_modelo` → `conflito_config` com
  mensagem certa; modelo de reserva com janela fechada; IA fora da janela.
- Claim atômico, reaper, teto de tentativas, disjuntor por chip, anti-ban por chip só com
  automação, janela operacional e conflito de dias, reancoragem (#77), retomada de chip
  que voltou (#78), pausar cadência cancela pendentes.
- Confira no banco: follow-up pendente de cadência DESLIGADA (não deveria existir).

### 3.6 Agente de IA
- Reativo: só depois de ligado, silêncio (`[SEM_RESPOSTA]`), grupo não conta, janela
  08–20h, contexto por contato. Oficial: resposta dentro da janela.
- Configurar Agente só para `creator` (`podeConfigurarAgenteIA`).

### 3.7 Modelos da Meta (Oficial)
- `problemaNoTemplate` barra o que a Meta recusaria; os 6 modelos prontos passam; criar e
  excluir exigem `modelos_meta`; cache invalidado depois de criar; status e motivo de
  recusa na tela. **Só leitura na conta da Débora.**

### 3.8 Página de Grupos (migration 088)
- Só QR; oficial vê o aviso da Meta (selo verde + 8 pessoas).
- Mensagem agora/agendada/recorrente (recorrência em Brasília), anexo, marcar todos,
  intervalo, histórico, pausar/retomar, só dono ou admin edita.
- Boas-vindas: uma por grupo, agrupada, no grupo, atraso; evento repetido não duplica.
- Grupo só-admins sem ser admin fica travado.
- Use o grupo inexistente e evento simulado; apague tudo depois.

### 3.9 Plano, papel e conta
- Starter sem WhatsApp nenhum; Profissional só QR; Enterprise com os dois.
- Conta bloqueada (trial vencido/suspensa): API responde 402 e webhooks seguem gravando.
- `comum` / `master` / `creator`: quem vê e faz o quê em WhatsApp, Grupos e Agente.
- Capacidades declaradas e **nunca checadas** (`agente_reativo`, `followup_morno`,
  `grupos_whatsapp` fora de `/grupos`, `disparo_email`, `smtp_proprio`) e rotas sem guarda
  de plano (`/automacoes`): diga o risco de cada uma.

### 3.10 Mídia e retenção
- Cota de 1 GB por empresa, arquivos protegidos (`SQL_PROTEGIDOS` inclui cadência,
  disparo, automação e `grupos_mensagens`?), backup exigido.

## 4. Revisão de código (leitura, não execução)

Leia de ponta a ponta, no mínimo:
`api/src/modules/whatsapp/**`, `api/src/modules/crm/webhook/webhook.controller.ts`,
`api/src/modules/crm/contatos/contatos.service.ts`, `api/src/modules/crm/disparos/**`,
`api/src/jobs/followup/**`, `api/src/modules/grupos/**`,
`api/src/modules/agente-ia/**`, `api/src/services/whatsapp-provision.service.ts`,
`api/src/shared/capacidades.ts`, `/var/www/apps/whatsapp-integration/api-multi-baileys.js`,
`frontend/src/pages/whatsapp/**`, `frontend/src/pages/grupos/**`,
`frontend/src/components/crm/{ChatBubble,DisparoMensagemModal,CadenciaConfig,LeadDetailsModal}.tsx`.

Procure especificamente:
- query que filtra por empresa onde deveria filtrar por chip/usuário (ou o contrário);
- leitura de `historico_mensagens` sem `copia_indevida` ou sem `grupo_whatsapp_id IS NULL`;
- placeholder SQL fixo (`$2`) em query com filtro opcional; parâmetro sem cast em
  `concat_ws`/comparação dupla (`42P18`/`42P08`);
- comparação de timestamp por igualdade entre JS e Postgres (precisão diferente);
- `numeric`/`bigint` tratado como número sem `Number()`;
- datas `timestamp` naive comparadas sem `AT TIME ZONE`;
- `setTimeout`/estado em memória onde há 3 instâncias no cluster;
- rota montada só em `/api/gestao/X` (o nginx tira o `/gestao` — precisa de `/api/X`);
- texto de usuário renderizado com `dangerouslySetInnerHTML` sem escapar;
- erro engolido sem log; `catch` que responde 200 escondendo falha;
- segredo em log ou em resposta de API.

## 5. Documentação × código

Para cada seção do `CLAUDE.md` da app que fala de WhatsApp, marque: **confere** /
**desatualizada** (o que mudou, com arquivo:linha) / **não verificável**. Inclua o prompt
do Duo (`chat-financeiro.service.ts`: menu e "o que não existe") e os textos das telas que
explicam regra (motivos de `CATALOGO`, `MSG_PRIMEIRO_CONTATO_SO_OFICIAL`, `ERRO_OFICIAL`).

## 6. Entrega

Um relatório em português, direto, nesta ordem:

1. **Resumo em 5 linhas**: está pronto para cliente? o que impede?
2. **Achados em ordem de gravidade** (crítico → baixo). Cada um com: o que acontece para o
   cliente, como reproduzir, evidência (saída, query, arquivo:linha), correção sugerida e
   tamanho (pequeno/médio/grande).
3. **Matriz da seção 3** preenchida (tabela funcionalidade × QR × Oficial).
4. **Divergências de documentação** (seção 5).
5. **O que não deu para testar sem envio real**, e o teste mínimo que eu precisaria
   autorizar para fechar cada um.
6. **Limpeza**: tudo o que foi criado para teste e a confirmação de que foi apagado/restaurado.

Não invente resultado: o que você não rodou é "não verificado", não "ok". Se uma checagem
automática falhar por motivo alheio (ex.: rede), diga isso em vez de pular.
