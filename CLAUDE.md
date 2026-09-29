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
| `master` | tudo do comum + administra usuários (criar, promover até master, desativar, excluir comum) |
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

## Webhooks de captação (`modules/crm/webhook/`)

Rotas públicas, autenticadas por secret no header `X-Webhook-Secret` (ou
`?secret=` / `?token=`, porque o Elementor não manda header customizado). Cada
um tem seu bloco de constantes `*_FORM_*` no topo de `webhook.controller.ts`,
com empresa/funil/estágio/responsável configuráveis por `.env`.

| Rota | Destino |
|------|---------|
| `/webhook/form-leadership` | funil Club (5), empresa 5 |
| `/webhook/form-escola` | funil Escola Empreendedorismo (24), empresa 5 |
| `/webhook/form-caixa-rapido` | funil Escola Empreendedorismo (24), empresa 5, origem própria |
| `/webhook/form-diagnostico` | funil Funil Principal (46), empresa 32 (DuoFuturo) |
| `/webhook/sendflow` | funil Escola Empreendedorismo (24), empresa 5, campanha Desafio 52 Semanas |
| `/webhook/hotmart` | roteado pelo `product.id` da compra |

`form-caixa-rapido` recebe o formulário do WordPress/Elementor da campanha Caixa
Rápido. Vai para o **mesmo funil e estágio do `form-escola`**, mas com a Débora (22)
como proprietária e origem `Caixa Rápido` — é o que separa a campanha no relatório.
Por padrão usa o **mesmo secret do form-escola** (mesmo site); defina
`CAIXA_RAPIDO_FORM_WEBHOOK_SECRET` para dar um token só dele.

Duas diferenças em relação aos outros webhooks de formulário:

- **Payload qualificado**: além de nome e telefone, aproveita e-mail, negócio (vai em
  `leads.empresa`) e as três respostas (faturamento atual, objetivo em 6–12 meses e
  maior desafio), que viram o bloco de notas do lead. Só nome e telefone são
  obrigatórios — perder um lead porque um rótulo mudou no WordPress seria pior do que
  recebê-lo incompleto.
- **Duplicata anexa em vez de ignorar**: o funil 24 recebe outras campanhas, então quem
  já está lá tem as respostas acrescentadas às notas do card existente, com carimbo de
  data. Estágio e origem do card antigo não mudam — um lead em "Fechamento" não volta
  para a entrada.

#### A campanha vem do `utm_source` da URL (18/09/2026)

A landing é divulgada por semana (`escolapanthers.com.br/desafio/?utm_source=semana2`),
e é isso que separa uma semana da outra no relatório. O lead nasce com
`origem = 'Caixa Rápido - semana2'` **e** com `Origem (URL): semana2` no bloco de notas
— os dois, porque respondem em lugares diferentes: a origem aparece no card e no filtro
do CRM, o campo das notas é o que o dashboard de Integrações transforma em gráfico e
filtro. Sem utm na URL o valor é **`outros`**, sempre presente: um campo que só aparece
às vezes vira gráfico com buraco em vez de balde.

- `normalizarUtmSource` (`_shared/utm.ts`, com teste) reduz a minúsculas sem acento,
  `a-z0-9-`, teto de **30** — o que sobra em `leads.origem` (VARCHAR(50)) depois do
  prefixo `Caixa Rápido - `. O texto vem da barra de endereços, ou seja, de quem quiser,
  e vira chave de relatório: "Semana2", "semana 2" e "semana2" partiriam o recorte em três.
- **`origem` do corpo NÃO é lido.** A página já manda nesse campo uma constante sua
  (`landing-seu-plano-de-liberdade-financeira`) que não é campanha. Valem só
  `utm_source`, `utm`, `utm_origem`, `source` e `origem_url`.
- O catálogo do dashboard ganhou **`origemPrefixo`** (`'Caixa Rápido - '`): o match era
  exato (`origens.includes`) e o lead novo deixaria de ser reconhecido pela origem,
  caindo calado no primeiro bloco das notas. Os 88 leads anteriores ao utm continuam
  casando pelo valor exato em `origens`. O `LIKE ANY` entrou junto no SQL.
- **Duplicata não muda a origem do card antigo** (a regra de sempre): a campanha nova
  chega pelas notas anexadas, com carimbo.
- O lado do WordPress é **do cliente** e tem que guardar o utm na chegada
  (`sessionStorage`): a pessoa entra por `/desafio/?utm_source=…` e envia o formulário
  em `/liberdade-financeira/`, onde a URL já não tem nada. Trecho pronto em
  `docs/SNIPPET_UTM_CAIXA_RAPIDO.js`. **Enquanto a página não mandar o campo, todo lead
  entra como `Caixa Rápido - outros`** — que é o comportamento correto, não uma falha.

As duas perguntas de faturamento têm a mesma palavra-chave. Quando o Elementor manda o
**rótulo** em vez do Field ID, o desempate é pelo resto do texto (`hoje/atual/medio/mensal`
contra `objetivo/meta/proximos/meses`) — ver `pickByTokens`.

> Ao anexar em notas com `concat_ws`, **case o parâmetro** (`$2::text`): sem isso o
> Postgres devolve `42P18` (tipo indeterminado) e o webhook responde 500.

### O lead entrava e o formulário dizia que falhou (31/08/2026)

`escolapanthers.com.br/liberdade-financeira/` mostrava "Não conseguimos enviar agora"
enquanto o lead **era criado** — o visitante reenviava e o card ganhava a resposta
anexada de novo (3 envios do mesmo teste, 1 lead + 2 anexos).

A página posta do **JavaScript**, não pelo webhook nativo do Elementor (aquele sai do
servidor do WordPress e não tem CORS nenhum). `POST` urlencoded é *simple request*: sai
sem preflight, chega e executa. O que faltava era `Access-Control-Allow-Origin` na
resposta — sem ele o navegador **cumpre a requisição e proíbe a página de ler o
resultado**, o `fetch` estoura e o `catch` do formulário anuncia falha.

> Webhook público que responde 200 e o cliente jura que falhou: olhe CORS antes de olhar
> o handler. `grep form-caixa-rapido /var/log/nginx/*access*.log` — se o 201 está lá, o
> problema é do lado do navegador, não do webhook.

A liberação em `server.ts` vale **só** para `/crm/webhook/form-*` (`origin: '*'`, sem
`credentials`): a rota é autenticada por secret e a resposta não passa de
`{success, lead_id}`. É **um** middleware `cors` com a origem decidida por requisição,
não dois empilhados — dois mandariam `Access-Control-Allow-Origin` **duplicado** quando a
origem também estivesse na lista do `.env` (o caso de `/crm/webhook/secret`, que a app
chama autenticada), e navegador nenhum aceita o header repetido. Ele também vem antes do
`cors` global porque o global responde o preflight e encerra.

### SendFlow — campanha Desafio 52 Semanas (02/09/2026)

`/webhook/sendflow` recebe os eventos de usuário do SendFlow e cria o lead no mesmo
destino do `form-escola` (funil 24, estágio 208), com a **Débora (22)** como
proprietária e origem **`Desafio 52 semanas`** — a string é exatamente a dos 76 leads
que a campanha já tinha no funil, senão o relatório partiria em dois.

Autenticado pelo **Sendtok** (`SENDFLOW_WEBHOOK_SENDTOK`), aceito em header
(`X-Sendtok`, `X-Sendflow-Sendtok`, `X-Webhook-Secret`, `Authorization: Bearer`),
query (`?sendtok=` / `?token=` / `?secret=`) **ou** corpo. O painel do SendFlow não
diz onde o token viaja, e a URL entregue ao cliente já leva `?sendtok=` embutido —
assim autentica mesmo que a plataforma não mande nada.

O formato do payload do SendFlow também não é documentado e muda com o evento, então
nada de caminho fixo: `achatarPayload` achata o corpo inteiro (raiz, `data`,
`contact`, listas `{name,value}`, arrays de tags) em pares chave→valor e
`acharCampo`/`acharTelefone` procuram pelo nome do campo onde quer que ele esteja.
Telefone só vale com 10–15 dígitos, e chaves de ruído (`campanha`, `grupo`, `fluxo`,
`instancia`…) ficam fora da busca por nome — senão o lead nasceria chamado
"Desafio 52 Semanas". Sem nome, o card fica com o número.

- **Evento sem telefone responde 200** (`ignorado: true`) com o corpo no log: um 4xx
  faria a plataforma marcar o webhook como quebrado e desligá-lo, e é pelo log que se
  ajusta o mapeamento quando o payload real chegar. Todo POST loga o corpo
  (`[SendFlow] evento "x" recebido:`) justamente por isso.
**No SendFlow a campanha É um grupo de WhatsApp** — o evento que interessa é
`group.updated.members.added`, e quem entrou vem em `data.number`. O `groupJid`/
`groupId` ao lado é o GRUPO, não a pessoa. Payload real:

```json
{ "id": "…", "event": "group.updated.members.added", "version": "1.0.0",
  "data": { "campaignId": "…", "campaignName": "Campanha Natal",
            "groupName": "Grupo de Natal #1", "groupJid": "…@g.us",
            "groupId": "…", "number": "5511999999999",
            "createdAt": "…", "createdAt_with_timezone_br": "…" } }
```

- **Descartar "evento de grupo" seria descartar a campanha inteira** — foi o erro da
  primeira versão, desfeito assim que o payload real apareceu. O que se descarta é o
  jid `@g.us` e qualquer chave com `group`/`grupo` como candidatos a TELEFONE.
- **Contar dígitos não valida telefone.** O exemplo da doc do SendFlow traz
  `number: "0000000000000"` e o primeiro disparo real (02/09/2026, 18:00) veio assim —
  criou um lead chamado 0000000000000. `telefonePlausivel` recusa dígito repetido,
  número começando com 0, e DDI 55 com comprimento diferente de 12/13.
- **O botão "Testar" do SendFlow manda o payload de exemplo da doc** — campanha
  "Campanha Natal", `number: "0000000000000"`. Ele é ignorado de propósito, mas a
  resposta diz `teste: true` e "Conexao OK", senão o painel mostra só "ignorado" e o
  cliente entende que falhou.
- **Evento de SAÍDA não cria lead** (`removed`, `left`, `blocked`, `unsubscribe`…):
  vira anotação carimbada no card de quem já está no funil, e nada quando a pessoa não
  está. Criar lead de quem acabou de sair é entregar ao comercial o oposto do lead.
- **O evento só traz o número, nunca o nome.** Antes de deixar o card com cara de
  telefone, `nomeDoContatoConhecido` procura o nome em `contatos_whatsapp` da empresa
  (fora `is_grupo`); nome sem uma letra sequer ("+55 85 9176-2563") é telefone gravado
  como nome e não conta. Sem nada, o card fica com o número.
- `campaignName` e `groupName` vão para as notas — é o que diz por qual campanha e
  qual grupo a pessoa entrou quando a conta roda mais de um.
- **Duplicata anexa**, como no `form-caixa-rapido`: estágio e origem do card antigo
  não mudam.
- `GET /webhook/sendflow` responde `{success, configurado}` — é o teste que o cliente
  faz colando a URL no navegador.

#### Club do Livro e dono por URL (24/09/2026)

Uma conta do SendFlow roda várias automações ("Comercial - Clube do Livro", "- Workshop",
"- Desafio 52 Semanas"), todas pelo mesmo webhook. `campanhaDoEvento`
(`_shared/sendflow.ts`, com teste) decide a origem pelo nome do **grupo ou da campanha**:
`/livro/i` → `Clube do Livro` (a grafia dos 46 leads que a Débora cadastrou à mão); o
resto segue `Desafio 52 semanas`. Mesmo funil e estágio (24/208).

- **O evento não diz por qual número a automação disparou** — só quem entrou. O dono vem
  da URL: `&dono=<usuario_id>` (ou `responsavel`/`proprietario`), um URL por conta/número
  no SendFlow. Id que não é usuário ativo da empresa 5 cai na Débora, com aviso no log.
- Duplicata continua anexando: o dono do card antigo não muda.
- Até 24/09 **nenhum evento do grupo do Club do Livro tinha chegado** — a automação dele
  enviava mensagem, mas o webhook do SendFlow não estava ligado àquele grupo. Conferir
  com `grep -o '"groupName":"[^"]*"' logs/out.log | sort | uniq -c`.

#### Workshop, nome pelo WhatsApp e tags (29/09/2026, #195/#196/#218)

- **Workshop tem origem própria**: `/workshop/i` → `Workshop Liberdade Financeira` (no
  catálogo de Integrações também). Até aqui caía em `Desafio 52 semanas`; os 5 cards
  nascidos assim (15936, 15937, 15940, 15941, 15950) **não** foram remarcados.
- **O SendFlow nunca manda nome** (634 eventos lidos). O card nasce com o número, e o
  webhook de mensagem troca o nome **na primeira mensagem da pessoa**, pelo `pushname`
  (`_shared/nome.ts`, com teste) — só em card cujo nome não tem letra nenhuma; nome
  digitado por gente nunca é trocado. Passado: `scripts/nomear_leads_pelo_whatsapp_20260929.js`
  (315 cards: 214 na empresa 5, 100 na 46, 1 na 32).
- **O dono por URL continua sem uso**: todos os eventos chegam sem `&dono=`, e as três
  automações da Panteras usam o mesmo webhook — separar o responsável depende de a Débora
  dizer quem cuida de cada uma (#195), e provavelmente de um mapa campanha → dono no código.
- **Tags** (`TagsDoLead.tsx`, no card do lead): a API e a tabela existiam, faltava a tela.
  A tag é da EMPRESA — criar uma que já existe (sem caixa) devolve a existente —, e
  `addTag` passou a recusar tag de outra empresa. Criar tag falhava sempre antes disso
  (`usuario_id` NOT NULL nunca era preenchido).

`form-diagnostico` é chamado pelo app de Diagnóstico (`/var/www/apps/diagnostico`)
em dois eventos: `iniciado` cria o lead e `concluido` anexa uma anotação com
score, perfil e plano recomendado no lead existente (achado pelo telefone no
funil). Detalhes em `diagnostico/CLAUDE.md`.

Cuidado ao criar outro: `leads.origem` é **VARCHAR(50)**, e
`POST /api/crm/leads` **não valida** se o `funil_id` do body pertence à empresa
do token — daí a preferência por webhook com secret em vez de JWT de serviço.

## Envio de WhatsApp — o `success` não prova entrega

`POST /send` da instância devolve `success: true` com `messageId` **gerado
localmente**: não é confirmação de entrega. `entregue_at`/`lido_at` em
`historico_mensagens` nunca são preenchidos, porque a instância escuta
`messages.upsert` e ignora `messages.update` (onde vem o SERVER_ACK). Para provar
entrega, envie para um número que também seja instância nossa e confira se ela
gravou a `entrada`.

Caso de referência (trava `463 SenderReachoutTimelocked` da Meta no chip 2 da
Jéssica, 06–12/08/2026, com método de diagnóstico e pendências):
→ `docs/INCIDENTE_CHIP2_ENVIO_SILENCIOSO.md`

### Falha de envio: o que é definitivo e o que é só esperar

A instância separa os dois casos pelo HTTP: **503** = chip fora do ar (transitório) e
**422** = número sem conta no WhatsApp (definitivo). O corpo traz só o texto, então
`enviarMensagem` devolve o `status` junto e `enviarMensagemOuFalhar` anexa ele ao
`Error` — sem isso o `followup-scheduler` lê apenas "WhatsApp não conectado", não casa
com nenhuma regra de transitório e **queima** o follow-up (status terminal, sem retry).
Foi o que aconteceu com 286 follow-ups da Panteras entre 06/07 e 21/08/2026.

Erro 503 também **não** grava linha em `historico_mensagens`: nada saiu do app e o job
repete a cada 15 min — gravaria um balão "Falha no envio" por tentativa no mesmo card.

## Webhook de mensagem é por instância — o `port` manda

`receberMensagem` resolve o dono da porta (`usuarios.whatsapp_porta = port`, carimbado
por `dispatchWebhooks` em `api-multi-baileys.js`) e só aceita contatos **da empresa
dele**. Sem isso ele achava o contato **só pelo número** e gravava a mesma mensagem em
toda empresa que tivesse aquele número — conversa da Panteras aparecendo no CRM da
DuoFuturo e vice-versa (4.451 mensagens até 19/08/2026). **Desde 15/09/2026 o `port` é
obrigatório**: sem ele, ou com porta sem usuário ativo dono, a mensagem é descartada
(`sem_porta` / `porta_sem_dono`). Os dois casos caíam no comportamento antigo — e a 3010
tinha ficado órfã quando a master@ passou para o número oficial, ou seja, o que chegasse
nela seria gravado em toda empresa com o número. Toda instância no ar carimba `port` desde
01/09, e o canal oficial também. Ao mexer em `api-multi-baileys.js`, `pm2 restart` em cada
`whatsapp-30xx`.

### Primeira mensagem de número desconhecido vira card (23/09/2026, #177)

Mensagem de quem não tem contato nem lead era descartada (`contato_nao_encontrado`)
**antes** de chegar ao "Criar lead automaticamente" — o estágio só capturava quem já era
contato. Agora, quando algum estágio da empresa tem a criação automática ligada para o
dono da porta, `contatoParaPrimeiraMensagem` cria o contato (`<numero>@c.us`, no nome do
dono) e o fluxo segue normal: card com o `pushname`, mensagem vinculada e não lida.
Sem estágio ligado continua descartando — senão toda conversa pessoal do chip viraria
contato. `@lid` não resolvido, grupo e número implausível ficam fora
(`podeSerContatoNovo`, `_shared/telefone.ts`, com teste). Estágios ligados hoje:
empresas 1 (Cloud API, outro caminho), 38, 40 e 45.

### O passado vazado é separado, não apagado (migration 075)

As cópias que o vazamento gravou até 19/08 ficam no banco com
`historico_mensagens.copia_indevida = true` e saem de toda leitura: histórico do card,
contagens da lista de contatos, a view `contatos_nao_convertidos`, contexto do agente,
janela de 24h e dono da mídia (`midia.routes`). **Leitor novo de `historico_mensagens` que
mostre conversa precisa de `AND NOT copia_indevida`.**

Quem é cópia foi decidido pelos logs das instâncias (`logs/porta-30xx-out.log` registra
cada mensagem 1:1 com o segundo exato): linha gravada numa empresa cujo chip estava no ar e
não carregou a mensagem. 2.139 linhas — 1.069 na suporte@ (32), 487 na Panteras (5), 583 na
master@ (1). Conversa entre dois chips nossos fica nas duas pontas; o que nenhum chip registrou
fica como está. `api/scripts/marcar_copias_indevidas_20260915.js` (duas listas em
`scripts/dados/`, simula sem `--aplicar`, volta com `--desfazer`).

> **Nem todo log de chip se chama `porta-30xx-out.log`.** A 3012 (Panteras) grava em
> `gestao-douglas-out.log` e a 3010 em `out.log` (esta não registra mensagem nenhuma, só QR).
> A primeira lista não leu a 3012 e deixou 85 cópias à vista — o "Olá Eli" de 19/08 no card
> da Elisangela, na suporte@. O mapa certo é o do PM2:
> `pm2 jlist` → `pm_out_log_path` de cada `whatsapp-30xx`. O log também quebra texto longo
> (só a 1ª linha vem no `Texto:`) e, em mídia de remetente `@lid`, só traz o nome.

**Não tratado por falta de evidência:** ~8,1 mil mensagens de fev–ago/2026 duplicadas entre
Panteras e master@ (contatos pessoais do Diogo e da Débora, chips 3010 e 3011). Não há log
dessas instâncias no período para dizer qual chip carregou cada uma.

## Cota de mídia do WhatsApp e backup (migration 076, 15/09/2026)

Cada empresa guarda até `empresas.limite_midia_mb` (**1024 por padrão**, vale para conta
nova e antiga) de mídia de conversa 1:1. Passou disso, sai o **arquivo mais antigo,
sempre** — a mensagem fica, com texto e legenda, marcada em `midia_expirada_em`, e o
`ChatBubble` mostra "Imagem não está mais guardada" no lugar de um `<img>` quebrado.
Texto não tem limite (a Panteras tinha 137 MB de texto em 17 meses contra 10 GB de mídia).

- **Grupo não guarda arquivo**: o webhook grava a mensagem de grupo sem mídia. Não aparece
  em tela nenhuma e era 2/3 da mídia da Panteras. A instância ainda baixa e manda o
  base64 — só não é gravado.
- **A unidade é o arquivo, não a linha.** Follow-up com anexo grava no histórico o MESMO
  `media_url` do anexo da cadência; apagar esse arquivo tiraria o anexo de todo envio
  seguinte. Fica fora da cota, e nunca é apagado, arquivo citado por
  `followups_agendados`, `estagios_funil.followup_config`/`reuniao_lembretes`,
  `automacoes.config` ou `disparos_crm.configuracao_json` (caminhos varridos no JSONB
  como texto). Também arquivo referenciado por outra empresa e as `copia_indevida`.
- **Duplicata é checada ANTES de gravar a mídia** no webhook. Antes o arquivo era escrito
  e o `continue` vinha depois — cada eco virava órfão.
- Job `jobs/midia-retencao-scheduler.ts`, 04:30 de Brasília, instância 0; serviço em
  `modules/midia/retencao.ts`; manual: `node api/scripts/retencao_midia.js` (simula) /
  `--aplicar`.

**Backup** — `api/scripts/backup_diario.sh`, pelo `/etc/cron.d/gestao-financeira-backup`
às 03:00 de Brasília (log em `/var/log/gestao-financeira-backup.log`): `pg_dump -Fc` do
banco inteiro (14 dias) e `rsync --link-dest` de `uploads/` (7 dias, hard link no que não
mudou) em `/var/backups/gestao_financeira/`. **A cota não apaga nada se o `ULTIMO_OK` do
backup tiver mais de 26h** — todo arquivo que sai ainda existe 7 dias no backup. É o
mesmo disco: protege de erro nosso, não de perda da VPS.

Primeira aplicação (15/09): 25 GB → 6,2 GB em `uploads/whatsapp` — 8,0 GB de grupo, 8,8 GB
da master@ (mídia desde 05/04 mantida), 2,2 GB da Panteras (mantida desde 16/07); a
suporte@ usava 211 MB. Sobram ~3,6 GB de **órfãos** (5.899 arquivos sem referência em
tabela nenhuma) — não entram na cota e não foram apagados.

**O recorte é por empresa, nunca por usuário.** De 19 a 21/08/2026 o filtro foi
`usuario_id === dono.id` e derrubou 508 mensagens 1:1 em dois dias: 466 números da
Panteras têm contato em mais de um operador, e quando o contato era de outro operador
a mensagem era descartada inteira — nem histórico, nem contato novo, e o card
congelava enquanto a conversa seguia no WhatsApp (caso Ana Paula/lead 2951: contato da
Débora, conversa no chip do Financeiro). Dentro da empresa o contato do próprio dono da
porta tem preferência, para a mensagem não ser gravada em dois cards.

Duplicidade se detecta por `whatsapp_message_id` repetido com `empresa_id` diferente
em `contatos_whatsapp` — só vale para conversa 1:1: em grupo, duas instâncias nossas
no mesmo grupo recebem a mesma mensagem legitimamente.

## Porta de WhatsApp por usuário — provisão automática (16/09/2026)

Cada usuário Baileys tem sua instância (`whatsapp-<porta>`, PM2), e quem cuida disso é
`services/whatsapp-provision.service.ts` → `garantirWhatsApp(usuarioId)`: idempotente,
nunca lança, devolve a porta já reservada e sobe a instância em segundo plano.

| Quem chama | Quando |
|---|---|
| `auth.service.registrar` | todo cadastro — o dono chega na tela e o QR já está lá |
| `usuarios.service` (`criarInstancia`) | usuário novo da equipe |
| `GET /whatsapp/config` e `GET /whatsapp/empresa/usuarios` | autocura: quem está sem porta ganha uma; quem tem, a instância é religada se estiver parada (no máximo 1× a cada 5 min por processo) |

Até esta data **o dono de conta nova nunca ganhava porta** (só membro da equipe), e a
tela dizia "entre em contato com o administrador". As 4 contas do lançamento (37–40)
foram provisionadas nas portas 3020–3023.

- **Porta livre = sem dono no banco, sem processo no PM2, sem rastro em disco e sem
  ninguém escutando.** A 3016 está sem dono, mas com a sessão de outra pessoa em
  `.baileys_auth/` — entregá-la a uma conta nova subiria a instância logada no número
  alheio. `portasComRastro` lê sessão, `.contacts-`, `.lid-map-`, `.webhook-config-`,
  `.conn-status-` e `ecosystem.porta-*`. Faixa 3013–3200.
- **Escolha serializada por `pg_advisory_xact_lock`** — são 3 processos no cluster.
- **Só conta `trial`/`ativa`/`aguardando_pagamento`** ganha porta nova: cada instância
  é um processo de ~100 MB parada no QR e 150–400 MB conectada.
- **Empresa no número oficial** recebe a porta virtual (`portaParaUsuarioNovo`), sem
  instância.
- **Instância nascia sem webhook.** `api-multi-baileys.js` lê
  `.webhook-config-<CLIENT_ID>.json` só no boot, e o script não gravava o arquivo: o
  chip conectava e enviava, mas toda mensagem recebida era descartada até alguém abrir
  o CRM (`CRMKanban` registra o webhook ao montar). Agora `create-instance.sh` grava o
  arquivo antes do `pm2 start`, e o serviço ainda chama `/webhook/register`.
- **`create-instance.sh` confundia parado com rodando** (`grep` na lista do PM2 →
  `ALREADY_RUNNING`). Agora lê o status pelo nome exato e religa o que estiver parado.
- O script roda com **ambiente mínimo** (PATH, HOME, webhook): `pm2 start` repassa o
  env de quem chama, e o da API carrega credenciais que a instância não precisa ver.
- Sem porta devolvida, a porta recém-reservada volta a NULL e a próxima visita tenta de
  novo. Logs: `[WhatsApp] usuário N · porta P:` no `gestao-financeira-api`.
- **Não tratado:** excluir/cancelar conta não derruba a instância nem limpa a sessão.
  A porta fica com rastro e nunca é reusada — seguro, mas o processo continua no ar.
  Testes em `tests/whatsapp-provisao.test.ts`.

## Conexão por QR — o QR na tela pode estar órfão

Uma instância saudável **desconectada** emite um QR novo a cada ~60s pelo
**mesmo** socket vivo, e cai com **408** (timeout de QR não lido). Se ela cai com
**428 de 3 em 3 segundos**, está no laço em que a própria reconexão mata o socket
que acabou de gerar o QR: o código aparece na tela (o frontend faz poll de 5s),
mas o celular pareia com um socket que já morreu. Corrigido em 13/08/2026 com
contador de geração + `sock.end()` em `api-multi-baileys.js` — antes disso a 3011
(Débora) acumulou 60.386 QRs, a 3013 179.554 e a 3018 124.823.

Diagnóstico em um comando, na pasta `whatsapp-integration`:

```bash
grep -c "QR Code gerado" logs/porta-<porta>-out.log   # dezenas de milhares = laço
curl -s localhost:<porta>/status                       # lastDisconnect.code: 428 vs 408
```

A porta de cada usuário está em `usuarios.whatsapp_porta`.

### Um 403 não é um ban — e ban nenhum pode travar o QR (01/09/2026)

A tela da Débora mostrava *"Desconectado — aguardando QR Code..."* junto com
*"Número bloqueado pela Meta. A reconexão automática foi suspensa"* e **nenhum QR
aparecia**, mesmo com o número já desbloqueado. Três defeitos empilhados:

1. **O 403 era declarado ban na primeira ocorrência.** Nos dois casos reais
   (3014 em 28/08, 3011 em 31/08) ele chegou **4 segundos depois de um 503** do
   próprio WhatsApp, em chips que estavam recebendo mensagem no minuto anterior.
   Não era bloqueio de número: era o servidor recusando reconexão imediata
   durante a instabilidade dele. Na 3011 a segunda conexão nasceu de uma corrida
   nossa — o 503 agendou reconexão para 12:20:01 e o **vigia** disparou às
   12:20:00, porque `ultimaTentativaConexao` não era renovado enquanto a conexão
   vivia e o relógio dele estava 2,9h atrasado.
2. **O ban era porta de mão única.** O handler de close fazia `return` sem
   reagendar nada, `banido` desligava os dois watchdogs **e era relido do disco no
   boot** — então nem `pm2 restart` devolvia QR. Instância parada 4 dias (3014) e
   1 dia (3011), sem uma linha de log depois do ban.
3. **`creds.registered` é sempre `false`** nesta versão do Baileys, mesmo em
   sessão pareada e conectada (conferido nas 3 instâncias online). Com o campo
   errado, TODA sessão caía no ramo "sem backoff" e reconectava de 3 em 3
   segundos, e o 403 era rotulado sem saber se havia número. Quem prova
   pareamento é **`creds.me.id`**.

O que passou a valer:

| Antes | Agora |
|---|---|
| 1 × 403 = ban permanente | `BAN_CONFIRMACOES = 3` recusas **espalhadas por ≥10 min** sem nenhuma conexão bem-sucedida (~21 min para acusar). Backoff 1min → 5min → 15min. Qualquer `open` zera a contagem |
| 403 sem número pareado = ban | categoria `handshake`: não existe conta nessa sessão para bloquear — segue gerando QR |
| ban suspende reconexão para sempre | sonda de desbloqueio a cada **30 min**; volta sozinha quando a Meta libera |
| `banido` desligava os watchdogs | nunca impede QR; quem segura o vigia é o timer agendado, não o ban |
| sem saída manual | `POST /reconectar` (mesmo número) e `POST /reconectar?novo=1` (apaga sessão, QR novo) — expostos como **"Tentar agora"** e **"Conectar outro número"** na tela |

> **QR na tela mata qualquer marca de ban.** Se há QR, a sessão não tem número
> vinculado — logo não há número dela para estar bloqueado. A instância descarta
> a marca herdada do disco nesse momento, e o diagnóstico do frontend testa
> `pareado === false` **antes** de `banido`, como rede de segurança.

Os textos da tela saíram do `WhatsAppConfig.tsx` para
`frontend/src/pages/whatsapp/diagnosticoConexao.ts`: um estado, um texto, um tom
e a ação que resolve. Estado de espera diz **a hora da próxima tentativa**
(`proximaTentativaEm` no `/status`); estado que exige gente diz o que fazer.
`/status` também passou a devolver `pareado`, `numero`, `recusas403`,
`banidoDesde` e `aguardandoQr`.

**Desfecho:** nenhum dos dois números estava banido. Ao subir com o código novo,
os dois receberam **401 (logout)** — a Meta havia encerrado a sessão do device —,
a auth foi limpa e o QR voltou. O código antigo nunca descobriria isso, porque
nunca tentava de novo.

> `chip.ts` consultava `created_at` numa tabela cuja coluna é **`criado_at`**
> (migration 060): a consulta lançava `42703` e derrubava o diagnóstico inteiro
> justamente no caminho em que ela é a única fonte (porta fora do ar). E
> `recusado` fica **fora** de `CATEGORIAS_TERMINAIS` de propósito — é suspeita,
> não veredito, e follow-up de suspeita se adia, não se queima.

## O canal do cliente Enterprise é o oficial (migration 084, 20/09/2026)

Até aqui o número oficial era **da empresa** (`whatsapp_cloud_contas.empresa_id`
UNIQUE), e só a DuoFuturo tinha um: o cliente Enterprise assinava o canal oficial e
recebia um QR Code, porque não havia caminho nenhum para conectar a conta dele. A
084 resolve os dois lados — a conta passa a ser **por número, com dono**, e o
cliente conecta a própria WABA pelo **Embedded Signup**.

| Peça | Arquivo |
|---|---|
| Conta por número (dono, token, PIN, origem) | `api/migrations/084_whatsapp_cloud_por_numero.sql` |
| Contas e ligar/desligar | `api/src/modules/whatsapp/canal/contas.ts` |
| Os 3 passos do onboarding na Meta | `.../whatsapp/meta/embedded-signup.service.ts` |
| Rotas do cliente | `.../whatsapp/canal/oficial.controller.ts` |
| Provisão por plano | `api/src/services/whatsapp-provision.service.ts` |
| Janela do Embedded Signup | `frontend/src/pages/whatsapp/ConectarNumeroOficial.tsx` |
| Escolha de canal | `.../whatsapp/EscolhaDeCanal.tsx` |
| Testes | `api/tests/canal-oficial.test.ts` |
| Conferência em produção | `api/scripts/verificar_canal_oficial.js` (`--meta` bate na Graph API) |

**`usuario_id` preenchido = o número é daquele operador**; nulo = número da empresa
inteira, que é o caso da empresa 1 (o canal do funil Suporte) e não foi tocado. Os
dois convivem de propósito: a migração do QR para a Cloud API é **um operador de
cada vez**, e no meio do caminho a mesma empresa tem gente nos dois canais. Por isso
todo mundo que perguntava "qual o número desta EMPRESA?" passou a perguntar "qual o
número desta PESSOA?" — `contaAtivaDoUsuario` (com a conta da empresa como reserva)
no canal, no follow-up e na provisão, e `contaAtivaDoContato` onde só existe o
contato (tique azul e "digitando…"), porque a conversa entrou pelo número do dono
dele. Perguntar pela empresa faria o operador que ainda está no QR ser cobrado pela
janela de 24h, que não é regra dele.

**Conta com direito ao oficial não ganha instância Baileys sozinha.** Era o
contrário: todo usuário sem porta recebia uma instância e um QR — para quem assinou
o Enterprise, exatamente o canal que o plano dele existe para não usar, e ~400 MB
parados num código que ninguém ia ler. Agora `garantirWhatsApp` devolve `null` nesse
caso e a tela mostra **a escolha**: conectar o número oficial ou pedir o QR
(`POST /whatsapp/qr/ativar`, e `POST /whatsapp/empresa/usuarios/:id/qr/ativar` para o
administrador). O QR continua ali de propósito — grupos e sincronização de contatos
só existem nele. `GET /whatsapp/config` devolve `aguardandoEscolhaDeCanal` para a
tela separar **escolha pendente** de **falha de provisão**: sem isso ela voltaria a
dizer "entre em contato com o administrador" a quem acabou de assinar.

### Os quatro passos do Embedded Signup

Tudo depois que a janela devolve `code`, `waba_id` e `phone_number_id`:

```
1. GET  /oauth/access_token          troca o code pelo token DO CLIENTE (app id + secret)
2. POST /{waba_id}/subscribed_apps   sem isto NENHUMA mensagem chega
3. POST /{phone_number_id}/register  ativa o número, com um PIN de 6 dígitos
4. (o cliente) cadastra a forma de pagamento no WhatsApp Manager
```

- **O passo 2 é o que não avisa.** Sem ele a conexão parece pronta, o envio funciona
  e o CRM fica vazio — foi o que deixou a nossa própria WABA muda até 09/09/2026. O
  teste prende a ordem, e o verificador confere `subscribed_apps` número a número.
- **O `code` vive ~30 segundos e a troca é servidor a servidor** (é literal na
  documentação, e o App Secret não pode existir no navegador). Por isso ele vai
  direto para a API, sem tela de confirmação no meio.
- **A janela responde por dois caminhos**: `postMessage` traz `waba_id` e
  `phone_number_id`, o callback do `FB.login` traz o `code`. Chegam fora de ordem, e
  nada é enviado antes de os dois existirem — só o callback deixaria a gente sem
  saber qual número conectar.
- **O passo 4 não é nosso e não trava a conexão.** Sem forma de pagamento o cliente
  responde quem escreve e só a conversa iniciada por ele é recusada — por isso
  `pagamento_ok` é aviso na tela, não bloqueio no cadastro.
- **Desde 01/10/2026 a Meta cobra também a resposta** (mensagem de serviço, R$ 0,0350 no
  Brasil, 1.000 grátis por mês por número) e a utilidade dentro da janela de 24h. Sem forma
  de pagamento, passada a franquia do mês **a resposta deixa de ser entregue** — o aviso de
  `pagamento_ok` passou a importar para quem só responde. Tabela no passo 4 de
  `landing/panteras/whatsapp-oficial.html` (marketing R$ 0,3217; fonte: rate card BRL da Meta).
- O PIN é aleatório e fica cifrado (`pin_enc`, mesma chave dos outros segredos do
  processo). Número que já tem verificação em duas etapas com outro PIN devolve
  **133005**, e a mensagem diz o que fazer — não é erro nosso.
- Teto da Meta: **10 clientes novos a cada 7 dias**, 200 com a Verificação de Acesso.
  É um teto que se descobre tarde, no dia em que o décimo primeiro não conecta.

> **Sem `META_APP_ID`, `META_APP_SECRET` e `META_ES_CONFIG_ID` no `api/.env` a janela
> não abre** — e isso é configuração nossa, no painel da Meta, não do cliente.
> `configES()` diz qual variável falta, a tela cai no caminho por chamado em vez de
> oferecer um botão que quebra, e o verificador reprova. O `META_APP_SECRET` é o
> mesmo que faz o webhook conferir assinatura: enquanto faltar, um POST forjado vira
> mensagem no card de um cliente.

### A tela do número oficial do cliente (25/09/2026)

`NumeroOficialPainel.tsx` virou três abas (`?aba=visao|modelos|perfil`), tudo com as
credenciais da conta do usuário (`contaAtivaDoUsuario` → `credenciaisDa`), nunca as nossas:

| Aba | O quê | Rotas |
|---|---|---|
| Visão geral | `health_status` da Meta: limite (TIER_250…), pendências por nível (número, WABA, portfólio), status do nome | `GET /whatsapp/canal/oficial/saude` |
| Modelos | todos os status, motivo da recusa, **criar** (cabeçalho de texto, corpo com `{{n}}`, rodapé, botões resposta/link fixo/ligar) e **excluir** | `POST`/`DELETE /whatsapp/canal/modelos[/:nome]` (`modelos_meta`) |
| Perfil | foto, recado, descrição, endereço, e-mail, 2 sites, categoria | `GET`/`PUT /whatsapp/canal/oficial/perfil`, `POST .../perfil/foto` |

- **"Desconectar do CRM" não apaga nada na Meta** — só `desligarConta`. Quem pode:
  o dono do número; o administrador (master/creator) com `conta_id` de um operador;
  o número da empresa inteira (`usuario_id` nulo), só `super_admin` — `contaGerenciavel`
  em `oficial.controller.ts`.
- **Só se cria o que o CRM consegue enviar.** Cabeçalho de imagem e link com variável
  ficam fora de propósito: aprovados, cairiam como "não suportado" em `modelos.ts`.
  `problemaNoTemplate` barra antes da Meta o que ela recusaria com "Invalid parameter"
  (teste em `tests/modelos-meta.test.ts`); resposta rápida vai antes dos botões de ação.
- Erros de chamada por SIP (138024/138025) saem da lista de pendências: aparecem em todo
  número e o CRM não usa chamadas.
- **Seis modelos prontos no Criar modelo** (`oficial/modelosProntos.ts`, 25/09/2026): abordagem,
  convite, reativação, material, lembrete de reunião e retomada de atendimento — carregam o
  formulário e o cliente ajusta. Conta nova sem modelo aprovado só responde quem escreveu, e
  folha em branco é onde nasce a recusa (UTILITY para vender). O teste passa os seis pelo
  `problemaNoTemplate`. Textos e razões: `docs/MODELOS_ABORDAGEM_META.md`.
- A WABA do cliente **não** responde `primary_funding_id` ao nosso token (exige BSP) —
  forma de pagamento não é consultável; a tela aponta para o WhatsApp Manager.

O painel `/gestao/whatsapp/meta` continua sendo **só nosso** e continua cadastrando à
mão número que já esteja na WABA da DuoFuturo (`origem = 'manual'`). São caminhos
diferentes para coisas diferentes — um conecta a conta do cliente, o outro administra
a nossa. `ligar`/`desligar` passaram a ser **por id da conta**, não da empresa: o id
da empresa deixou de identificar um número.

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
`router.use(authRequired, acessoCloudApi)` — a Meta chama sem JWT. Desde 13/09/2026
ele tem um trabalho de verdade: `handleIncomingMessage` (que era um TODO) entrega o
material de boas-vindas a quem pediu no cadastro — ver "Boas-vindas de conta nova".
`sendDocumentMessage` (PDF por link público) entrou junto.

> **Acesso avançado aprovado pela Meta em 19/09/2026** — o que ele destrava é operar
> a WABA de cada CLIENTE via Embedded Signup, e nada disso existe no código ainda.
> Estado, próximos passos e armadilhas: `docs/META_TECH_PROVIDER.md`.
>
> **`META_APP_SECRET` está no `.env` desde 19/09/2026** e o webhook confere a
> assinatura (conferido com mensagem real em 25/09). Se um dia faltar,
> `assinaturaValida` libera e avisa uma vez no log — e um POST forjado viraria
> mensagem no card de um cliente.
>
> **Embedded Signup em produção desde 25/09/2026** — primeira conexão real: +55 85
> 9205-1233 (conta 2, empresa 5, usuário 22). O que travou a primeira abertura foi
> *Login com o SDK do JavaScript* desligado no painel do app (ver `docs/META_TECH_PROVIDER.md`).

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

### O número oficial é o suporte da DuoFuturo (14/09/2026)

O número oficial (`whatsapp_cloud_contas` id 1, porta virtual 49000) está na
**empresa 1 — master@gestao.com** (e a Débora, usuário 20, que é da mesma empresa);
`portas_anteriores` guarda a 3010 do master. A **empresa 32 (suporte@duofuturo.tech)
voltou ao Baileys**, porta 3019, com o número pessoal do Diogo (24 98834-4048) — por
isso ela não tem mais estágio com `auto_criar_lead`: toda conversa pessoal viraria card.

Quem escreve para +55 11 94052-4435 vira card no funil **Suporte (58, empresa 1)**:
Novo contato (323, `auto_criar_lead`) → Em atendimento (324) → Aguardando cliente
(325) → Resolvido (326). Não há caixa de entrada à parte — o Kanban é a fila, e o chat
do card responde. Desde a migration 084 a conta é **por número** (`empresa_id` deixou de ser UNIQUE) e
`ligarConta`/`desligarConta` recebem o **id da conta**: trocar o número de empresa é
`desligarConta(conta.id)` → `UPDATE empresa_id` (zerando `portas_anteriores`) →
`ligarConta(conta.id)`.

- `estagio_apos_resposta_id`: Aguardando cliente → Em atendimento, e **Resolvido →
  Novo contato** (quem volta a escrever reabre o card; dedup por funil impede card novo).
- O `auto_criar_lead` do estágio 307 (VENDAS · Classificação) foi **desligado**: com
  os dois ligados, cada contato de suporte nascia também como lead de venda.
- A empresa 1 não tem `agente_ia_config` — nada responde sozinho no número oficial. Quem
  pede o material de onboarding pelo código também cai aqui (a mensagem vai ao CRM).
- **A empresa 32 tem agente configurado desde 15/09/2026** (Claude, mesma chave da
  Panteras, instruções da empresa em `docs/agente_ia_duofuturo.md` — edite lá e cole em
  Agente IA → Configurar Agente). Está ligado na empresa e **desligado em todo estágio**: o
  número dela é o pessoal do Diogo, e o estágio 307 (VENDAS · Classificação), que estava com
  agente ligado, tinha 46 leads auto-criados de contatos pessoais (família, sócios,
  fornecedores). Ligar o agente num estágio é decidir quem recebe resposta de IA.
- **O agente pode ficar em silêncio** (`agente_ia_config.pode_ficar_em_silencio`,
  migration 077, chave em Configurar Agente; ligada só na empresa 32). A regra 8 do
  prompt base mandava SEMPRE responder — e na simulação o agente respondeu à Ive, pelo
  número do Diogo, aceitando um convite do Club. Com a chave ligada ele devolve
  `[SEM_RESPOSTA]` para "ok"/figurinha/"vejo depois" e para assunto pessoal; nada sai,
  a ação vai para `agente_ia_acoes_log` como `silencio` e a mensagem fica não lida.
  Qualquer texto junto do marcador também não sai. Desligada, o prompt é o de antes.
- **Áudio só chega ao agente transcrito, e a transcrição é sempre Gemini** (`transcreverEEnfileirar`
  no webhook, `empresa_ia_credenciais.gemini_api_key`). Sem essa chave o áudio é ignorado em
  silêncio — o caso da empresa 32. Com provider `claude` o modelo cai num Gemini fixo: era o
  `gemini-2.0-flash`, desligado pelo Google, e de 09/07 a 15/09/2026 **755 áudios da Panteras**
  voltaram 404 e o agente nunca soube o que foi dito. Hoje é `gemini-2.5-flash`.
  Até 29/09/2026 a tela **escondia** o campo da chave do Gemini com o Claude escolhido —
  era impossível ligar áudio no Claude pela interface. Agora ele aparece nos dois
  provedores ("Chave do Gemini para entender áudio", opcional no Claude).
- O agente só reage a mensagem que chega **depois** de ligado. Mensagem anterior à
  ativação fica com "agente inativo — mensagem ignorada" no log e não é reprocessada.
- **Contato duplicado do mesmo dono grava a mensagem duas vezes.** `receberMensagem`
  prefere os contatos do dono da porta, mas quando o MESMO usuário tem o número com e
  sem DDI (`5524…` e `24…`) os dois recebem a mensagem, e o auto-lead pode nascer no
  pior deles ("+249 88344048"). São 339 grupos assim na Panteras e 1 na empresa 1.
  Não corrigido (14/09/2026) — muda por onde a Panteras recebe, e é decisão do dono.
- **O card criado pela própria mensagem nascia sem selo de não lida** e com o
  histórico sem `lead_id`: o webhook atualiza os leads que JÁ existiam e só depois
  cria o auto-lead. Corrigido no bloco do auto-lead (vale para o Baileys também).
- Depois de 24h sem mensagem do cliente, a Meta só entrega modelo aprovado. Os que
  existem são de boas-vindas (marketing); falta um de **utilidade** para retomar
  atendimento.

## Assinatura de e-mail — é do usuário, não do sistema

Mora em `usuarios.assinatura_email` (migration 063) e é editada em
`/gestao/perfil` (`UserProfile.tsx`). O disparo de e-mail
(`DisparoEmailModal.tsx`) só **lê** dali; editar no modal vale para aquele
disparo (rascunho em `localStorage`, chave `crm_email_signature_draft`).

Quem não tem assinatura salva recebe um padrão **gerado na hora** com os dados
da própria empresa — `frontend/src/utils/assinaturaEmail.ts` usa
`empresas.{nome,email,telefone,endereco,logo_url,cor_primaria}` + nome do
usuário. Nunca chumbar assinatura de cliente como padrão: até 13/08/2026 o
`DEFAULT_SIGNATURE` era o HTML do Instituto Totem (empresa 5) e ele aparecia
para **todas** as empresas. A da Panteras foi preservada no banco por
`api/scripts/seed_assinatura_email_panteras_20260813.sql`.

Assets: os da Panteras/Totem em `frontend/public/signature/` (SVG, servido em
`/gestao/signature/`); os da DuoFuturo em `/var/www/apps/landing/signature/`
(PNG + página de preview em `duofuturo.tech/signature/`). **PNG, não SVG** —
Gmail e Outlook bloqueiam SVG em e-mail.

### A assinatura nunca passa pelo editor de texto rico (09/09/2026)

Ela é HTML de e-mail — tabelas com `<td>` lado a lado — e o `EmailEditor` é TipTap
**sem nó de tabela**: recebendo o template inteiro ele descarta `<table>/<tr>/<td>`,
promove cada filho a bloco e devolve isso no `onUpdate`, que era gravado por cima do
original. `EditarAgendamentoModal` fazia exatamente isso; a criação sempre fez certo,
com a assinatura num textarea à parte.

O template gravado é `corpo + SEPARADOR_ASSINATURA + assinatura`, e os dois lados
moram em `utils/assinaturaEmail.ts` (`montarEmailComAssinatura` / `separarAssinatura`).
**Quem edita um disparo tem que separar antes e recompor depois** — só o corpo entra
no editor.

- **O que se perdia não era o empilhamento.** Ícone empilhado é do editor, onde a
  imagem é bloco; no e-mail os `<img>` são inline e ficam lado a lado. Perdiam-se o
  alinhamento central, a tipografia da marca e os `<a href>` em volta dos ícones — as
  redes deixavam de ser clicáveis.
- **Impressão digital do achatamento:** o editor carimba `max-w-full rounded` no que
  serializa (`Image.configure`). Num disparo íntegro a classe aparece só no CORPO; num
  achatado, nos ícones da ASSINATURA. É esse o teste — "não tem `<table>`" daria falso
  positivo em quem nunca teve assinatura.
- Passado corrigido por `api/scripts/reparar_assinatura_disparos_20260909.js`
  (idempotente, simula sem `--aplicar`; a assinatura de referência sai do disparo
  íntegro mais recente do mesmo usuário, não de `usuarios.assinatura_email` — a da
  Panteras é a do perfil menos o logo, tirado de propósito).

`setImage({ src })` também insere `<img>` **sem largura** e nada pós-processa o HTML:
imagem entra no tamanho natural e estoura o cabeçalho. Arte de e-mail vai publicada já
em 600px (largura padrão) em `uploads/email-images/` — a única árvore de `uploads/`
que é pública, porque a imagem precisa abrir para quem não tem login.

## Reagir e responder citando no chat do card (migration 086, 25/09/2026, #188)

A reação é **atributo da mensagem reagida**, nunca uma linha nova: `reacao_contato` e
`reacao_minha` em `historico_mensagens` (a última de cada lado vale; vazio remove). Uma
linha por reação era o que poluía a conversa antes, e por isso a instância descartava
tudo — 1.081 reações só no chip da Alcione. Agora ela manda um evento próprio
(`{event:'reaction', targetId, emoji, fromMe}`) e `receberMensagem` faz um `UPDATE` pelo
`whatsapp_message_id` **dentro da empresa do dono da porta**, antes de qualquer lógica
de mensagem. Reação em grupo não é anotada.

- **Citação:** `resposta_a_message_id` guarda o id da mensagem citada (`contextInfo.stanzaId`
  no Baileys, `context.id` na Cloud API). `getHistoricoMensagens` acha o texto dela num
  `LATERAL` pelo mesmo id na mesma conversa; citada anterior ao CRM não é achada e o balão
  diz "a uma mensagem anterior ao CRM".
- **Envio:** `/send` aceita `quoted: {id, fromMe, text}` e há `/react` — nas instâncias
  e na porta virtual do número oficial (`context.message_id` / `type: reaction`, que
  também exige a janela de 24h). `enviarMensagem` só cita mensagem **desta** conversa.
- Rotas: `resposta_a` no `POST /crm/leads/:id/mensagem` e
  `POST /crm/leads/:id/mensagens/:mensagemId/reacao` (`{emoji}`), pelo chip do responsável.
- Tela: `ChatBubble` ganha os botões (hover/foco; sempre visíveis em tela de toque) só
  com `onResponder`/`onReagir` e mensagem com `whatsapp_message_id` sem erro. Janela de
  24h fechada esconde os dois.

## Arrastar card para coluna fora da tela (25/09/2026, #123)

**Não existe auto-scroll horizontal, e não é esquecimento.** O quadro rola na horizontal e
cada coluna na vertical: scroll aninhado, que o `@hello-pangea/dnd` não suporta — rolar o
quadro no meio do arrasto dessincroniza as medidas e o card cai na coluna errada. No lugar,
enquanto um CARD é arrastado, `KanbanBoard` mostra no rodapé do quadro uma faixa com todas
as etapas (`atalho-<id>`); soltar numa delas manda o card para o topo daquela coluna pelo
mesmo `onMoverLead` (etapa de ganho abre a conversão, como no arrasto normal). A faixa é
montada no `onBeforeCapture` com `flushSync`: Droppable que nasce depois de a lib medir
não existe para ela.

## Histórico de mensagens — quem grava

Todo envio tem que gravar em `historico_mensagens`, e o card só mostra a conversa
quando `leads.contato_whatsapp_id` está preenchido (`getHistoricoWhatsApp`
devolve `[]` sem vínculo). Lead importado nasce **sem** vínculo — quem manda
mensagem para ele precisa resolver o contato antes de gravar, com
`contatosService.resolverContatoParaLead(leadId, usuarioId, empresaId)`
(acha pelo telefone com variantes, cria se faltar e vincula o lead).

Writers: `contatos.service.ts` (manual, follow-up, mídia — sempre gravam),
`disparos.service.ts` (disparo em massa) e `webhook.controller.ts` (entrada,
que já auto-vincula o lead).

Bug corrigido em 12/08/2026: o disparo em massa gravava o histórico dentro de um
`if (lead.contato_whatsapp_id)` — para lead importado a mensagem saía e não
ficava registro nenhum (o card mostrava "Nenhuma mensagem ainda"). Foram 20.723
envios perdidos desde 05/03/2026, reconstruídos a partir de
`disparos_crm.template` + `disparo_leads.enviado_at`
(`api/scripts/reconstruir_historico_disparos_20260812.js`).

## O F5 reabre onde estava (15/09/2026)

Funil, visão e aba moram na **query string**, via `hooks/useEstadoNaUrl.ts`:
`/crm?funil=57&visao=list&aba=agenda`. Vale no CRM, no CRM CX, nas abas dos dois
dashboards e na tela do Duo. Estado de tela novo que deva sobreviver ao F5 usa
`useAbaNaUrl`, não `useState`.

- **Funil** (`useFunilNaUrl`): a URL manda; sem ela (entrou pelo menu), volta o último
  funil daquele usuário (`localStorage` `crm:funil:<tipo>:<userId>` — o mesmo navegador
  alterna suporte@ e master@). Id fora da lista da empresa sai da URL e o quadro cai na
  memória ou no padrão. O id guardado vale **antes** da lista chegar: esperar faria o
  quadro abrir no Funil Principal e trocar depois.
- Mexer na query string sempre com o **updater funcional** do `setSearchParams`: a URL
  carrega vários estados, e montar a partir de uma cópia velha apaga os outros.
- **Ordem dos cards** (`?ordem=recentes|mensagem`, #59): seletor `OrdenarCards` ao lado de
  Filtros, **fora** de `filtros` (limpar filtro não desfaz a ordem). Vai à API como
  `ordenar`, e `normalizarOrdem` reduz a uma lista branca antes de virar `ORDER BY`. A
  manual ganhou `id` de desempate: lead de webhook nasce com `ordem_estagio = 0`.

## Importar planilha de leads — origem e acento (23/09/2026, #175/#176)

- **A origem da planilha é do cliente.** `normalizarOrigem` trocava tudo que não fosse
  uma das 10 chaves fixas por `importacao` (os 873 leads da Anchor perderam a
  classificação). Agora: chave conhecida vira chave, nome do catálogo (`crm_origens`,
  sem caixa/acento) usa a grafia de lá, o resto entra como veio (teto 50). Origem nova
  entra no catálogo da empresa, que é de onde o card monta a lista.
- **Planilha é lida pelos bytes** (`lerPlanilha`). O SheetJS abre CSV como Latin-1 e o
  CSV exportado pelo Excel/Google é UTF-8: "MENDONÇA" virava "MENDONÃ\u0087A". Texto é
  decodificado como UTF-8 e, se inválido, Latin-1; xlsx/xls seguem binários. O multer
  grava sem extensão, por isso a detecção é pelo cabeçalho (PK / D0CF).
- A planilha é apagada depois de importar: origem perdida só volta com o arquivo.

## Página de Grupos do WhatsApp (migration 088, 28/09/2026)

`/gestao/grupos` (menu **Grupos**, capacidade `grupos_whatsapp`, permissão `whatsapp`):
**Mensagens** para vários grupos (agora / agendada / repetindo em dias+hora de Brasília,
com anexo e "marcar todos"), **Boas-vindas** a quem entra e **Meus grupos**. Referência de
produto: SendFlow. API em `modules/grupos/` (montada em `/api/grupos` **e**
`/api/gestao/grupos` — o nginx tira o `/gestao`), regras puras em `agenda.ts` com teste,
job `jobs/grupos-scheduler.ts` (a cada minuto, instância 0), tela em `pages/grupos/`.

- **Só QR Code.** A Groups API da Meta exige Conta Comercial Oficial (selo verde) e para em
  **8 participantes**, entrando só por link. O nº da Débora tem `is_official_business_account:
  false` (conferido em 28/09). Quem está no oficial vê um aviso, não a tela.
- **Toda execução é do job.** "Enviar agora" só põe `proxima_execucao = now()` — sai em até
  1 minuto. Uma rodada por chip de cada vez (`ocupados`), grupos um a um com
  `intervalo_segundos` entre eles; chip fora do ar vira falha para o resto da rodada, com o
  motivo. Histórico em `grupos_mensagens_envios`.
- **A trava da fila é "ainda vencida", nunca igualdade com o horário lido**: o Postgres guarda
  microssegundos e o `Date` do JS milissegundos — `proxima_execucao = $2` nunca casava com um
  `now()` e a mensagem ficava parada (achado no teste).
- **Boas-vindas só dentro do grupo**, nunca no privado: DM para quem acabou de entrar é
  primeiro contato por QR (a regra de 28/09). Fila durável `grupos_boas_vindas_fila` no lugar
  do `setTimeout`; todos que entraram na janela viram **uma** mensagem marcando todos
  (`montarBoasVindas`). Vale só a boas-vindas do dono da porta que viu a entrada.
- **A instância agora avisa a entrada** (`group-participants.update` → `event:
  'group_participants'` no webhook de mensagem, tratado antes de qualquer lógica de conversa).
  Antes nada avisava, e o `automacoes_grupo` antigo chamava um `/send-message` que não existe:
  a boas-vindas nunca funcionou. `/send` e `/send-media` aceitam `mencionarTodos`/`mentions`;
  `/groups` devolve `announce` e `souAdmin` (grupo só-admins sem ser admin é recusado — a tela
  trava a escolha).
- Mídia vem pelo mesmo upload da cadência e está em `SQL_PROTEGIDOS` da cota de mídia.

### Campanhas de grupo (migration 089, 28/09/2026) — o SendFlow do nosso jeito

Aba **Campanhas** em `/gestao/grupos`, capacidade `grupos_campanhas` (**só Enterprise**; o
básico de grupos segue no Profissional). Serviço em `modules/grupos/campanhas.service.ts`,
regras puras em `campanhas-regras.ts` (teste `tests/grupos-campanhas.test.ts`), tela em
`pages/grupos/Campanhas.tsx`.

- **Link único** `duofuturo.tech/gestao/g/<slug>` — o nginx (`location ^~ /gestao/g/`)
  repassa para `/api/grupos-link/<slug>`, sem login, que responde **302** para o convite do
  **primeiro grupo ativo com vaga** (enche um de cada vez, pela ordem). Clique é gravado com
  `utm_source/medium/campaign`; robô de pré-visualização (WhatsApp, Facebook…) redireciona
  mas não conta. Sem vaga e sem grupo novo possível: página "lotado", 503.
- **Grupo novo sozinho** quando nenhum grupo tem folga (10% do limite, teto 20):
  `abrirGrupo` escolhe o chip da campanha com menos grupos, cria pelo `POST /groups/create`
  da instância com a **equipe (outros chips) dentro como admin**, descrição (regras) e "só
  admins enviam". **Máximo 10 grupos novos por chip em 24h.** Trava em
  `grupos_campanhas.criando_grupo_em` (não advisory lock: pool + cluster), vence em 2 min.
- **Entrada e saída** vêm do mesmo `group_participants` da boas-vindas — a instância passou
  a mandar também `remove`. Só conta o evento do chip que **administra o grupo na
  campanha** (`grupos_campanhas_grupos.usuario_id`). Entrada com `criar_lead` vira lead no
  funil/etapa/responsável da campanha; duplicata no funil só ganha anotação.
  Participante `@lid` não resolvido conta no painel mas não vira lead.
- **Mensagem da campanha** = `grupos_mensagens.campanha_id`: vai para os grupos ativos NA
  HORA do envio, cada um pelo chip que o administra (chip fora do ar derruba só os grupos
  dele). `{Oi|Olá}` sorteia por grupo em toda mensagem de grupo (`aplicarVariacoes`).
- Contagem de participantes relida do chip a cada 10 min (`sincronizarContagens`, no job
  de grupos) — o evento se perde em restart da instância.
- **Mexeu em `api-multi-baileys.js`? `pm2 restart` em cada `whatsapp-30xx`** — sem isso
  `/groups/create`, `/groups/:id/invite` e as saídas não existem na instância no ar.

## Importar participantes de grupo (CRM → Contatos → Grupos, 15/09/2026)

`importarParticipantesComoLeads` (`contatos.service.ts`). O grupo só traz o número
(participante é `@lid`, a instância resolve o telefone). Três regras:

- **Estágio:** `is_entrada` e, sem nenhum marcado, o primeiro da ordem — igual à
  importação por planilha. Exigir `is_entrada` travava 12 funis ("Funil não possui
  estágio de entrada configurado"), o Vendas CRM da empresa 32 entre eles.
- **Nome:** `nomesConhecidos()` — contato da empresa (agenda antes de perfil), depois
  o `/chats` da instância (agenda do chip), depois lead da empresa. A lista do modal
  já mostra esse nome. Sem nenhum, o card fica com o número (antes: "Participante 55…").
  O nome da agenda vence: quem está salvo como "Amor" entra como "Amor".
- **Duplicata é por funil** (`telefoneExiste` com `funilId`), não pela empresa. E card
  do mesmo nome, no mesmo funil e **sem telefone** ganha o número em vez de ser duplicado.

## Lançamento à vista também tem parcela (09/09/2026)

O dashboard (`dashboard.service.ts`), a tela de **Parcelas** e o chat financeiro
leem **tudo** de `parcelas_receitas`/`parcelas_despesas`, com **INNER JOIN**.
Até esta data só `createComParcelas` gravava parcela: um lançamento **à vista**
não gerava nenhuma e, portanto, **não existia** para nenhuma dessas telas.

A Loja Mageense (empresa 33) cadastrou 24 receitas e 15 despesas e viu o
dashboard zerado — foi assim que apareceu. Não era só dela: a Panteras tinha
**19 receitas** invisíveis pelo mesmo motivo. A conta demo (empresa 31) parecia
certa porque as parcelas dela vieram do **seed**, e é por isso que a falha
atravessou os prints do guia de onboarding sem ser notada.

O modelo agora é uniforme: **à vista é uma parcela de 1 de 1**, vencendo na data
do lançamento. Ensinar cada consulta a somar duas origens diferentes seria mais
caro e mais fácil de esquecer na próxima tela.

- `create` de receita e de despesa grava a parcela; a despesa automática de
  **taxa de serviço** (`criarDespesaTaxaServico`) também, que tinha o mesmo furo.
- **`update` sincroniza a parcela** (valor, vencimento, status e baixa). Sem
  isso o dashboard passaria a mostrar o valor ANTIGO — número errado é pior que
  número ausente. Lançamento **parcelado** fica de fora: lá cada parcela tem
  vida própria, e o guard é `total_parcelas = 1`.
- Excluir não precisa de nada: a FK é `ON DELETE CASCADE`.
- Status é **MAIÚSCULO** na parcela (`PAGO`/`PENDENTE`/`ATRASADO`) e minúsculo
  no lançamento. `statusParcela()` e `dataVencimentoDe()` em `shared/utils.ts`
  concentram a tradução.
- `$3::varchar` nos dois lugares do UPDATE, senão o Postgres deduz varchar em
  `status = $3` e text em `$3 = 'PAGO'` e recusa a query — o mesmo `42P08` que
  derrubou o `alterarStatus` do suporte.

**Todo caminho que cria lançamento tem que gravar a parcela.** São cinco, e
convém conferir a lista antes de abrir o sexto: cadastro de receita, cadastro de
despesa, taxa de serviço (`receitas.service.ts`), conversão de lead do CRM (usa
`receitasService.create`, então já vem de graça), chat do Duo
(`chat-financeiro.service.ts` — este já fazia certo desde sempre, e foi a pista
de que 1 de 1 era mesmo o modelo pretendido) e importação Open Finance
(`pluggy.service.ts`, corrigida junto; ainda sem nenhuma linha em produção).

Passado corrigido por `api/scripts/backfill_parcelas_a_vista_20260909.js`
(idempotente, `--empresa=N` para um cliente por vez, simula sem `--aplicar`).
Aplicado na base inteira em 09/09/2026: 54 parcelas de receita e 24 de despesa,
nas empresas 33, 5 e 1. Conferido depois: zero lançamento à vista sem parcela,
zero com mais de uma, e a soma das parcelas bate com a soma dos lançamentos.

## Dashboard Conta Azul (`/gestao/dashboard` → aba "Conta Azul")

Aba dentro da página de Dashboard, ao lado de "Visão Geral" (o dashboard de
sempre, intocado). Fonte de dados é **só** a API v2 do Conta Azul — nada do banco
local entra aqui.

**Duas contas, um dashboard (migration 066).** A Panteras tem duas contas do Conta
Azul, uma por produto. O dashboard mostra o **consolidado** por padrão e o filtro
"Produto" isola cada uma; acima dos gráficos há uma linha de cards por produto.
Cada lançamento vem carimbado com `conexao_id`/`conexao_nome`, e o `id` do evento é
prefixado pela conexão (`1:uuid`) porque nada garante id único entre contas
diferentes.

**Acesso:** master da Panteras (`empresa_id = 5` + `tipo_usuario = 'master'`) ou
`super_admin`. `tipo_usuario = 'master'` sozinho **não** basta: há masters de
várias empresas no banco, e liberar por ele exporia o financeiro da Panteras às
outras. Quem manda é o backend (`contaazul.dashboard.routes.ts`, 403 para o
resto); o frontend só usa o perfil para não piscar a aba.

| Peça | Arquivo |
|------|---------|
| Conexões + OAuth | `api/src/modules/contaazul/contaazul.service.ts` |
| Seed de conexão | `api/scripts/seed_contaazul_conexoes.js` |
| Rotas protegidas | `api/src/modules/contaazul/contaazul.dashboard.routes.ts` |
| Busca + normalização | `api/src/modules/contaazul/contaazul.dashboard.service.ts` |
| Abas da página | `frontend/src/pages/dashboard/DashboardComAbas.tsx` |
| Tela | `frontend/src/pages/dashboard/contaazul/ContaAzulDashboard.tsx` |
| Filtros | `.../contaazul/FiltrosContaAzul.tsx` |
| Agregações (funções puras) | `.../contaazul/agregacoes.ts` |
| Paleta validada | `.../contaazul/paleta.ts` |

O backend devolve a lista inteira do período normalizada (~590 KB para um ano) e
**toda** filtragem é no cliente — trocar filtro não vai à rede. Cache de 5 min por
empresa+período, furado pelo botão "Atualizar" (`?forcar=1`).

### Conexões (uma por conta do Conta Azul)

`contaazul_conexoes` é a unidade de trabalho desde a 066 — **não** a empresa.
Cada conexão tem o **seu próprio par client_id/client_secret**, porque o
`refresh_token` só vale para o client que o emitiu: usar o Basic de uma conexão
para renovar o token da outra devolve `invalid_client`. Por isso as credenciais
saíram do `.env` (onde eram globais ao processo) e foram para a tabela;
`CONTAAZUL_CLIENT_ID`/`SECRET` no `.env` são **legado**, só insumo de seed.

O que continua global: `CONTAAZUL_REDIRECT_URI` (tem que ser idêntica em todos os
apps cadastrados no portal), `CONTAAZUL_SETUP_SECRET` e `CONTAAZUL_EMPRESA_ID`.

```bash
# autorizar UMA conexão (sem ?conexao= ele lista as opções em vez de adivinhar —
# autorizar a conexão errada grava o token de um produto no outro)
https://duofuturo.tech/api/gestao/contaazul/authorize?secret=…&conexao=2
# situação das duas / renovar as duas
curl  ".../contaazul/status?empresa=5&secret=…"
curl -X POST ".../contaazul/renovar?empresa=5&secret=…"
```

É o **`state`** que carrega a conexão de destino: o Conta Azul não devolve o
`client_id` no callback, então sem ele não há como saber onde gravar o token.

Uma conexão fora do ar **não derruba** o dashboard: `Promise.allSettled` por
conexão, o consolidado soma quem respondeu e a que falhou vira aviso âmbar na tela
(`conexoes[].erro`). Só lança exceção quando nenhuma responde. As conexões entram
na chave do cache de 5 min — ativar/desativar conta muda o consolidado na hora.

### Armadilhas da API v2 (confirmadas em 14/08/2026)

- `data_vencimento_de` / `data_vencimento_ate` são **obrigatórios** (400 sem eles).
- Paginação é `pagina` (1-based) + `tamanho_pagina`; página além do fim volta vazia.
- Só dá para filtrar por **vencimento**. Não existe data de pagamento no retorno —
  por isso "recebido" significa *valor quitado de títulos que vencem no período*,
  e a escolha vencimento/competência existe só como eixo de agrupamento do gráfico.
- `pago + nao_pago ≠ total` quando o título foi quitado com juros ou desconto (26
  títulos na Panteras, ~R$ 7,6 mil). Percentual de composição usa `base` (a soma
  dos baldes), não `total`, senão a barra não fecha 100%.
- Título `LOST` vem com `nao_pago = 0`: a perda é `total − pago`.

O cálculo de vencido bate com o bloco `totais` do próprio Conta Azul — é o teste
de regressão mais barato se mexer nas agregações. Baseline medido em 18/08/2026
para o ano de 2026 (o consolidado é a soma, e é assim que o `totais_api` vem):

| Conexão | Vencido a receber | Vencido a pagar | Itens |
|---------|------------------:|----------------:|------:|
| 1 · Panteras | R$ 69.115,38 | R$ 50.343,02 | 1.447 |
| 2 · Totem | R$ 15.561,02 | R$ 12.498,00 | 1.485 |
| **consolidado** | **R$ 84.676,40** | **R$ 62.841,02** | **2.932** |

### Cores

`paleta.ts` passou no validador contra as superfícies reais (`#ffffff` claro,
`#1f2937` do Card no escuro). A série receber/pagar/saldo passa em todos os pares
nos dois modos. A dupla verde↔vermelho da paleta de status é indistinguível sob
deuteranopia — por isso todo gráfico de status leva rótulo direto + legenda com
valor, e a cor nunca fica sozinha. Não trocar hex sem rodar o validador.

## Dashboard de Integrações (`/gestao/crm/dashboard` → aba "Integrações")

Aba ao lado da "Visão Geral" (o CRM Dashboard de sempre, intocado). Responde
"o que cada sistema trouxe" — quantos leads, quando, para onde foram e **os dados
que vieram junto**. Aberta a **qualquer usuário com acesso ao CRM**: pedir o
número das próprias captações não depende de papel, e o recorte é sempre a
empresa do token, então cada conta enxerga só o que é dela.

| Peça | Arquivo |
|------|---------|
| Catálogo das integrações | `api/src/modules/crm/integracoes/catalogo.ts` |
| Leitura das notas | `.../integracoes/notas.ts` |
| Consulta + normalização | `.../integracoes/integracoes.service.ts` |
| Abas da página | `frontend/src/pages/crm/CRMDashboardComAbas.tsx` |
| Tela | `frontend/src/pages/crm/integracoes/IntegracoesDashboard.tsx` |
| Filtros | `.../integracoes/FiltrosIntegracoes.tsx` |
| Agregações (funções puras) | `.../integracoes/agregacoes.ts` |
| Paleta validada | `.../integracoes/paleta.ts` |
| Testes do parser | `api/tests/integracoes-notas.test.ts` |

`GET /crm/integracoes/dashboard` devolve a lista inteira normalizada (727 kB para
a Panteras, 87 kB comprimidos pelo nginx) e **toda** filtragem é no cliente —
trocar filtro não vai à rede. Mesmo desenho do dashboard do Conta Azul.

### Origem é o primeiro toque; a integração pode ser um toque anexado

Uma integração é reconhecida por **duas** coisas, e as duas são necessárias:

- `origens` — o que ela grava em `leads.origem`: quem trouxe o lead;
- `marcador` — o bloco que ela escreve em `leads.notas`: **um** toque, que pode
  cair num card que já existia.

Os webhooks anexam em vez de duplicar quando o telefone já está no funil. Contar
só por `origem` esconde o resto, e o resto não é pouco: **8 dos 41** cards com o
formulário do Caixa Rápido entraram por outra integração, e o SendFlow tocou
**125** cards contra 109 de origem própria. Por isso `leads.integracoes` (todos os
toques) é o que o filtro casa — `leads.integracao` (a origem) fica só para o
"quem trouxe".

> Webhook novo entra no `CATALOGO` também. Sem uma linha lá o lead é criado, mas
> nasce invisível para o dashboard.

### O parser de notas é genérico de propósito

`lerNotas` não tem lista de campos: quebra as notas em blocos, reconhece o bloco
pelo catálogo e lê `Rótulo: valor`. Rótulo novo no WordPress vira coluna nova sem
tocar em código. Os três formatos que convivem em produção passam pelo mesmo
caminho: uma linha por campo, vários campos numa linha separados por ` | ` (o
diagnóstico legado) e rótulo sozinho com o valor nas linhas seguintes (o
depoimento das indicações).

- **Pedaço sem carimbo e sem marcador é CONTINUAÇÃO**, não bloco novo — senão o
  depoimento de um embaixador com parágrafos vira três blocos anônimos.
- ` | ` só separa campos quando **todos** os pedaços são `rótulo: valor`; um
  "Maior desafio: vender | crescer" é uma resposta só.
- A campanha do SendFlow mora no **título** do bloco (`Campanha X (SendFlow)`),
  não num rótulo — sem extraí-la de lá não dá para separar duas campanhas no
  mesmo funil.
- `campos` é `chave → string[]`: quem entrou em dois grupos tem dois valores em
  `sendflow.grupo`, e os dois precisam sobreviver.

### Decisões da tela

- **`leads.created_at` é naive em UTC.** O agrupamento por dia usa
  `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` — um lead das 02:33Z é de
  ontem aqui, e sem isso a série diária escorrega um dia.
- **A cor segue a integração, nunca o ranking do recorte.** O mapa de cores sai
  do volume no conjunto INTEIRO, então filtrar muda quais séries aparecem e
  nenhuma troca de cor no caminho. São **cinco** cores (é o que passa junto no
  validador); da sexta em diante dobra num neutro. Quando o balde neutro tem uma
  integração só, ele leva o **nome** dela — filtrar por Caixa Rápido e ver a
  barra dela rotulada "Outras" seria o painel respondendo outra pergunta.
- `paleta.ts` passou no validador contra `#ffffff` e `#1f2937` nos dois modos
  (pior par adjacente ΔE 9,2 claro / 9,4 escuro sob deuteranopia). O verde do
  modo claro fica em 2,82:1 — WARN "relief required", e o alívio está no desenho:
  rótulo direto, legenda com valor e tabela abaixo. **Não trocar hex sem rodar o
  validador.**
- **Campo categórico vira gráfico; texto livre vira lista.** "Faturamento hoje"
  tem 4 valores em 41 leads e é uma barra excelente; "Maior desafio" tem 41 em 41
  e viraria 41 barras de altura 1. O corte é `valores/leads`.
- **A pilha da série conta TOQUES, não leads** — um card tocado por duas
  integrações aparece nas duas. O total sem repetição está nos cartões, e o
  rodapé do gráfico diz isso.
- **O filtro por resposta é genérico** (`campoChave` + `campoValor`, selects "Resposta
  em" e "Valor"): o parser de notas não tem lista de campos, e um filtro chumbado num
  campo teria que ser reescrito a cada rótulo novo no WordPress. Vale só para campo
  **categórico** — escolher "o valor exato" numa lista de 41 respostas de texto livre
  não é filtro. As opções saem do conjunto INTEIRO (`camposFiltraveis(todos, …)`): tirá-las
  do recorte faria "semana2" apagar "semana1" da própria lista, sem caminho de volta.
- **Quem filtra pela tabela é um botão, não a barra.** O recharts não é alcançável por
  teclado; a tabela abaixo do gráfico já é o alívio de contraste, e é lá que cada valor
  vira botão (a barra do valor em vigor fica opaca, as outras a 35%).
- **Colunas próprias na tabela só quando o recorte é de uma integração só.** Numa
  lista misturada elas seriam quase todas travessão; ali cada linha mostra os
  próprios campos numa coluna só.
- `/crm?lead=123` abre o card direto (`CRMKanban` lê o parâmetro e troca de funil
  junto quando o lead é de outro) — é o destino dos links da tabela.

## Dashboard — "quem pagou" e "com o que foi gasto" (10/09/2026)

Duas seções no fim da "Visão Geral" (`pages/dashboard/detalhamento/`): ranking à
esquerda, extrato lançamento a lançamento à direita. Clicar num nome filtra o extrato;
há busca, situação (**Recebido/Pago · A receber/A pagar · Tudo**, padrão = pago) e
agrupamento (receita: cliente · produto · descrição; despesa: categoria · descrição).
Substituíram o "Top 5 Clientes" e as duas pizzas "por produto", que agrupavam pela
**descrição** apesar do nome — produto é `receitas.fonte` (rotulado "Produto" na tela
de Receitas). Despesa não tem fornecedor: "com o quê" é `categoria` + `descricao`.

- Lê as mesmas parcelas que o dashboard já baixa (`/parcelas/receitas|despesas`, mesmo
  período por **vencimento**) — nada novo na API, e os totais batem com os cartões do
  topo. A data mostrada no extrato é a de pagamento quando pago.
- O ranking é HTML (botões), não recharts: teclado alcança, nome longo trunca com o
  inteiro no `title`, e 50 clientes rolam dentro do card. Cor única da `paleta.ts`.
- **DATE chega como `2026-09-01T00:00:00.000Z`** (API em UTC). `new Date()` no
  navegador em UTC-3 devolve o dia anterior — a Evolução Mensal jogava toda parcela do
  dia 1º no mês anterior. Use `dataPura()` (`detalhamento/agregacoes.ts`).
- No PDF viraram tabelas inteiras (receitas por cliente e por produto, despesas por
  categoria e por descrição) + os dois extratos, cortados em 150 linhas como no Conta
  Azul.
- **O PDF não filtra situação (11/09/2026).** Até então ele usava só `status = 'PAGO'`
  e, numa conta que não dá baixa nas parcelas, saía "Sem dados" logo abaixo de um
  faturamento de R$ 259 mil (Débora, 27 de 27 parcelas em atraso). Agora cada tabela
  por grupo abre **Recebido/Pago · A vencer · Em atraso · Total** com linha de total
  (`agruparPorSituacao`), zero vira "—" no corpo, e o extrato traz toda parcela com a
  situação por extenso ("Em atraso há 44 dias"), ordenado por **vencimento** — a
  coluna de data é o vencimento, e ordenar pelo pagamento embaralhava as linhas.
- No extrato, `descricaoSemCliente` tira o sufixo " - <cliente>" da descrição que a
  conversão do CRM grava ("Conversão CRM - Keli"): com a coluna Cliente ao lado, o nome
  saía duas vezes e cada linha dobrava de altura. `tabelaHtml` ganhou `semQuebra`,
  `largura` (mínimo sugerido — a tabela automática dava tudo ao nome mais longo) e a
  linha de `total` num `tfoot` com `display: table-row-group`, senão o Chrome repete o
  total no pé de cada página.
- O recorte continua **por usuário** (`usuario_id`), como o resto do financeiro — num
  time com 4 operadores, cada um vê só os lançamentos que cadastrou.

## Relatório em PDF do Dashboard (`utils/relatorioPdf.ts`)

Botão **Exportar PDF** nas duas abas de `/gestao/dashboard`: no cabeçalho da
"Visão Geral" e ao lado do "Exportar CSV" no Conta Azul. Cada um exporta o que
está na tela — **os mesmos filtros**, sem ir à rede de novo.

O **cabeçalho do PDF é a assinatura do usuário** (`usuarios.assinatura_email`,
editada em `/gestao/perfil`); quem não salvou assinatura recebe o padrão de
`utils/assinaturaEmail.ts`, montado com os dados da empresa — a mesma regra do
disparo de e-mail. O HTML da assinatura entra **higienizado** (fora `script`,
`on*` e `javascript:`).

O relatório **não é a tela mandada para a impressora**: é um documento montado do
zero, A4 e sempre claro, dentro de um iframe fora de tela. Imprimir a página
traria o override global de modo escuro (`html.dark .classe`, pintaria o PDF de
cinza-800) e só a primeira dobra, porque o app é `h-screen` com rolagem interna.
O PDF sai pelo diálogo do navegador ("Salvar como PDF") — foi a escolha ante
embarcar jsPDF + html2canvas (>1 MB, rasteriza texto) ou renderizar no servidor
(a API não tem navegador headless, e mandar HTML do cliente para renderizar lá é
vetor de SSRF).

- **O ícone de cada legenda do recharts também é `svg.recharts-surface`** (14×14)
  e vem ANTES do gráfico no DOM: `querySelector('svg.recharts-surface')` copiava
  um quadradinho de legenda esticado na largura toda. `capturarGrafico` pega o
  **maior** SVG que não esteja dentro de `.recharts-legend-wrapper`. A legenda é
  HTML irmã do `<svg>` e é copiada à parte, senão o gráfico perde as séries.
### O tamanho do texto do gráfico não pode depender da largura da TELA (09/09/2026)

Esticar o SVG copiado para 100% do papel amplia o eixo junto. Num card de 500px
(1526 CSS de janela, grid de 2 colunas — o caso do usuário) o eixo de 12px saía
com **19px** no papel, quase o dobro do texto do corpo; num monitor largo, com o
mesmo card em 900px, sairia com 9px. Mesmo botão, resultados opostos.

`capturarGrafico(seletor, { larguraAlvo, alturaMax })` resolve os dois lados de
uma vez, e é por isso que gráfico **pode ir em meia largura** hoje (o motivo de
ele ser sempre de largura cheia era exatamente esse encolhimento):

- a escala do desenho e o `font-size` são calculados **um contra o outro** —
  gravar `alvo / escala` no `<text>` faz sair `alvo` no papel, sempre entre 9 e
  13px, venha o gráfico de que tela vier. O tamanho vem de `getComputedStyle`:
  o recharts define fonte por CSS do pai, não por atributo no `<text>`;
- o recorte é o `getBBox()` do **desenho**, não a moldura do SVG. Isso inclui o
  rótulo que vaza pela borda (medido: 12px além dos 500 — era o `R$ 2` cortado
  no meio) e descarta os 34px que o SVG reserva para a legenda, que é HTML
  sobreposta;
- o `getBBox` é medido **no clone, com a fonte já compensada**, num palco fora
  da tela. Medir antes de trocar a fonte dá uma caixa apertada para uma fonte
  maior, e o eixo Y sai decapitado (`.2000` no lugar de `32000`). Como a caixa
  depende da fonte e a fonte depende da escala, que depende da caixa, o ponto
  fixo é buscado por iteração — 3 passadas bastam.

`LARGURA_PAPEL` (718) e `LARGURA_PAPEL_METADE` (352) são a largura útil da A4
com as margens do `@page`. Passe `larguraAlvo: LARGURA_PAPEL_METADE` em bloco
`metade`, senão o gráfico é calculado para uma largura que ele não tem.

### A assinatura de e-mail não é papel timbrado

A do Instituto Totem mede **287px** — 28% da altura útil de uma A4 gastos antes
da primeira linha do relatório (logo de 110px, seis ícones sociais de 42px e o
endereço). Era o que empurrava o primeiro gráfico para a folha seguinte e
deixava meia página em branco. `max-width`/`max-height` no `img` não alcançam
isso: cada ícone já cabe no limite; quem é grande é o conjunto.

`ajustarCabecalho()` mede a assinatura no iframe **depois das imagens** e a
reduz em escala até caber em 140px de altura **e 45% da largura** (piso de 0,34
— assinatura ilegível não é timbre). A largura entra na conta porque a do
Mageense tem 584px: cabe na altura e ainda assim joga o título para duas
linhas. Reduzir preserva a marca inteira; cortar, não.

Três armadilhas, todas encontradas rodando:

- `transform-origin` tem que ser `left top`. Com `left bottom` o conteúdo
  reduzido desce para fora do recorte e a marca **some** da página.
- `transform` não encolhe a caixa no FLUXO. Sem fixar altura e largura da
  `.marca`, o cabeçalho fica com os 287×520 vazios; e a `.marca` larga demais é
  comprimida pelo flex, o conteúdo reflui mais alto do que foi medido e vaza por
  baixo do `overflow:hidden` — a linha de contato saía cortada ao meio.
- Encolher a `.marca` reflui o filho. A largura natural tem que ser **presa no
  elemento** antes disso, senão a assinatura é remontada em duas linhas e só
  então reduzida.

O cabeçalho virou **timbre à esquerda + identificação do recorte à direita**
(título, empresa, período, emissão), no lugar da assinatura em cima e o título
embaixo. Com isso o relatório da Panteras saiu de **3 páginas para 1**.

- **Bloco de largura cheia pode quebrar entre páginas** (`thead` vira
  `table-header-group` e repete o cabeçalho); quem não quebra é o par lado a lado.
  Com `break-inside: avoid` no bloco inteiro, a tabela de 150 lançamentos pulava
  inteira para a página seguinte e deixava meia folha em branco.
- O Conta Azul copia gráfico desenhado com a paleta do tema atual —
  `mapaParaImpressao()` (em `contaazul/paleta.ts`) troca os hex do ESCURO pelos do
  CLARO; sem isso o eixo `#9ca3af` some no papel branco.
- A lista de lançamentos do Conta Azul vai **cortada em 150 linhas** (2,9 mil
  viram ~60 páginas) e o PDF diz isso, apontando o "Exportar CSV" para a íntegra.
- Cada gráfico exportável é marcado com `data-grafico="…"` na tela. **Ao mexer nos
  gráficos, mantenha a marca** — sem ela o bloco sai vazio, calado.
- **Bloco vazio é uma linha, não uma caixa.** Três "Sem dados no período" em
  caixa tracejada comiam 180px de página nobre para dizer três vezes a mesma
  coisa. O bloco continua no relatório de propósito: numa conta com 100% de
  parcelas atrasadas, "nenhuma receita paga no período" é informação, não vazio.
- **Percentual sai em pt-BR.** `toFixed(1)` devolve ponto ("98.4%") no meio de um
  documento que escreve R$ 64.243,23 — `formatPercent` na Visão Geral e no Conta
  Azul.

## Capacidades por plano — o que cada assinatura pode (migration 081, 20/09/2026)

Até 20/09/2026 **o plano não restringia nada**: não havia guard por plano na API nem
no menu, e quem assinou o Starter usava o CRM inteiro. A landing passou a vender três
produtos e a linha entre eles não é "quantos recursos", é **quem fala primeiro com um
desconhecido** — é isso que a Meta pune. Medido na base: disparo e follow-up frio são
~15% dos envios e quase todo o risco de bloqueio.

| Peça | Arquivo |
|------|---------|
| Catálogo, resolução e cache | `api/src/shared/capacidades.ts` |
| Guard de rota | `api/src/middlewares/capacidade.middleware.ts` |
| Espelho da tela | `frontend/src/utils/capacidades.ts` |
| Hook | `frontend/src/hooks/useCapacidades.ts` |
| Controle bloqueado | `frontend/src/components/plano/BotaoDoPlano.tsx` |
| Faixa do canal oficial | `frontend/src/pages/whatsapp/ConvitePlanoOficial.tsx` |
| Testes | `api/tests/capacidades.test.ts` |
| Conferência em produção | `api/scripts/verificar_capacidades.js` (`--api` bate na API no ar) |

**Três camadas, nesta ordem, e nenhuma substitui a outra:**

1. **capacidade** — a empresa contratou? (`planos.capacidades`)
2. **permissão** — o master liberou para este usuário? (`requiredPermission`)
3. **canal** — tecnicamente já dá? (`contaAtivaDaEmpresa`)

O erro clássico é confundir 1 com 3: um Enterprise recém-assinado **tem direito** ao
canal oficial e ainda não tem número ligado. A tela precisa dizer "conecte o número",
não "faça upgrade".

| | Starter | Profissional | Enterprise |
|---|:---:|:---:|:---:|
| `financeiro` `relatorios` `duo_chat` | ✅ | ✅ | ✅ |
| `crm` `whatsapp_qr` `agente_reativo` `followup_morno` `disparo_email` `grupos_whatsapp` | — | ✅ | ✅ |
| `whatsapp_oficial` `disparo_whatsapp` `conversa_fria` `agente_proativo` `modelos_meta` `smtp_proprio` | — | — | ✅ |

- **Capacidade ausente é capacidade negada.** `planos.capacidades` é uma LISTA de
  chaves, não um mapa de booleanos: ler a lista responde "o que este plano é".
- **`empresas.capacidades_extras` é a cortesia**, o mesmo mecanismo do
  `usuarios_cortesia` da 067 — ninguém perde o que já usava por causa de uma regra
  que nasceu depois. Precedência é **união**, nunca subtração: tirar algo de uma
  empresa é mudar o plano dela. Aplicada às empresas **33 e 45** (Starter usando CRM,
  medido em 20/09).
- **O guard vai DENTRO do router, abaixo do `authMiddleware`.** O `checkSubscription`
  de `server.ts` é global e montado **antes** de qualquer autenticação: `req.user`
  chega vazio. Desde 25/09/2026 ele lê o token sozinho, mas só para barrar trial
  vencido — plano se verifica com usuário resolvido, dentro do router.
- **Falha ao LER a capacidade deixa passar.** Um hiccup do banco não pode derrubar o
  CRM inteiro; quem nega de verdade nega com dado na mão.
- **No menu o item some; dentro da tela o botão fica e explica.** São coisas
  diferentes: uma seção que a pessoa nunca comprou não precisa ser anunciada toda vez,
  mas uma ação que ela procura ("por que não posso disparar?") precisa de resposta.
  `BotaoDoPlano` não usa `disabled` — botão desabilitado não recebe clique e portanto
  não tem como contar o motivo.
- **Cadência é a porta dos fundos do disparo.** Bloquear só o botão de disparar deixa
  o mesmo envio sair pela cadência, um lead por vez. Por isso `conversa_fria` é
  checada em `despachar()` (`jobs/followup/despacho.ts`) com
  `contatoJaEscreveuAlgumaVez` (`crm/_shared/conversa.ts`): contato que nunca escreveu
  vira `sem_capacidade` → `marcarFalhou(..., 'conflito_config')`, visível na lista de
  falhados e reagendável. **Adiar seria prometer para sempre um envio que o plano não
  permite.**
- **Leitura nunca é bloqueada.** `GET /disparos` e o cancelamento de agendado seguem
  abertos: quem mudou de plano continua vendo o que fez e consegue desligar o que
  estava na fila.
- O Enterprise tem `whatsapp_qr` **de propósito** — a migração para a Cloud API é por
  usuário, e grupo e sincronização de contatos só existem no QR.

### Primeiro contato: o plano E o canal de quem envia (28/09/2026)

Disparo e cadência fria eram checados só pelo **plano da empresa**. No Enterprise só quem
conectou o número oficial fala por ele — o resto da equipe segue no QR —, e os chips QR da
Panteras mandaram **693 primeiros contatos em 30 dias** (413 de disparo). Era exatamente o
risco que a separação dos planos existe para tirar. Agora:

- `enviaPeloOficial(usuarioId)` (`canal/contas.ts`) responde **pela porta** (virtual + conta
  ativa), que é o que o envio usa para escolher o canal — não por `contaAtivaDoUsuario`, que
  cai na conta da empresa e diria "sim" a quem ainda está no QR.
- **Disparo:** `soPeloOficial` em `disparos.routes.ts` (preview, criar, editar agendado) → 403
  `SO_PELO_OFICIAL`, inclusive para super_admin (o risco é do chip). O agendado confere plano e
  canal de novo na hora de sair. `BotaoDoPlano exigeOficial` explica na tela e aponta para
  `/whatsapp`, não para `/planos`.
- **Cadência:** `despachar` → `so_oficial` quando o contato nunca escreveu e o responsável está
  no QR; vira `conflito_config` (reagendável) com o motivo.
- **Sem modelo de reserva** no oficial com a janela fechada virou `sem_modelo` →
  `conflito_config`. Era `destino_invalido` (definitivo): 96 passos da Débora sumiram em 2
  minutos quando ela conectou o número (25/09). Não foram reenfileirados: 86 eram sobras de
  agosto de uma cadência pausada em 24/09 (funil 24, estágio 209) e 8 eram D+1/D+4 com 10
  dias de atraso.
- Reserva `retomada_conversa_parada` (`[PrimeiroNome]`, `[PrimeiroNomeResponsavel]`,
  "o Leadership Club") gravada em todos os passos dos estágios ativos do **funil 39**, exceto
  Ganho — é onde estão os leads da Débora com cadência ligada. Backup da config anterior só na
  sessão; o funil 24 está pausado e ficou sem reserva.
- `verificar_capacidades.js` (seção 2) reprova primeiro contato automático por chip QR nas
  últimas 24h.

> Capacidade nova entra em **três** lugares: a migration, `shared/capacidades.ts` e
> `frontend/src/utils/capacidades.ts`. O teste prende os dois primeiros contra a
> migration; o terceiro é preso pelo TypeScript quando alguém usa a chave.

**Conta sem plano cai no padrão conservador (só financeiro)** — o certo para conta
sem dado, e foi o que quase tirou o CRM da **conta institucional** (empresa 1, dona
do número oficial e do funil Suporte): assinatura `cancelada`, `plano_id` nulo, e o
usuário 12 é `super_admin` — passa pelo guard e esconde o problema. Quem apareceu foi
a Débora (usuário 20, `nivel = 'usuario'`). Resolvido por cortesia na **migration 083**,
não por assinatura de fachada: assinatura é cobrança e sujaria receita, aviso de trial
e conciliação do Asaas para sempre. `verificar_capacidades.js` tem uma seção só para
essa classe de erro (`1b`).

## Planos, fidelidade e usuários inclusos (migration 067)

Cada plano tem quatro compromissos em `planos_ciclos`. O que fica gravado é o
**equivalente mensal já com desconto** — o cobrado por ciclo é `preco_mensal *
meses`. Guardar o mensal é o que deixa a tela comparar "R$ 169/mês no anual
contra R$ 219/mês no mensal" sem dividir nada.

> **Os preços não mudaram — e a ida e volta de 20/09/2026 vale como aviso.** A 080
> baixou o Profissional para 199 ao alinhar com a landing nova; a 082 devolveu 219.
> O que a separação QR × Oficial mudou foi o PRODUTO (capacidades, migration 081),
> não o preço: o Profissional não perdeu valor, perdeu uma capacidade que nunca
> deveria estar num número comum, e ganhou um caminho de upgrade.
>
> O que derrubou a redução foi o **Asaas**: ele recusa baixar o valor de assinatura
> de cartão que já tem fatura paga (`invalid_value`) e o da cobrança pendente onde o
> cliente já informou o cartão. Como `assinaturas` **não guarda preço** — a tela
> recalcula de `planos_ciclos` a cada abertura —, o banco em 199 fazia a tela anunciar
> um valor que o cartão não cobrava, para a única cliente pagante.
>
> **Antes de mexer em `planos_ciclos`, lembre dos dois lados:** a tela muda na hora
> para TODOS os clientes antigos, e o Asaas não muda para quase nenhum. Reajuste para
> cima tem o mesmo problema, ao contrário. Se um dia isso precisar divergir de
> propósito, o caminho é congelar o contratado em `assinaturas` (uma coluna
> `valor_mensal_contratado` que vença o preço de tabela), como a 067 fez com
> `usuarios_cortesia` e a 081 com `capacidades_extras`.

| Plano | mês | trimestre | semestre | ano |
|-------|----:|----------:|---------:|----:|
| Starter | 79 | 72 | 69 | 59 |
| Profissional | 219 | 199 | 189 | 169 |
| Enterprise | 397 | 359 | 339 | 299 |

> **Mensal e trimestral saíram de venda em 21/09/2026 (migration 085)** — `ativo = false`,
> linhas mantidas. Vender e ler são caminhos separados em `getCiclo`: para contratar, ciclo
> inativo é **erro** (cair calado noutro cobraria o que a tela não mostrou); para mexer numa
> assinatura existente, `{ contratado: true }` aceita o inativo — a Anchor (38) paga no
> mensal. O JOIN de `getAssinaturaByEmpresa` não filtra `ativo` pelo mesmo motivo. O preço
> riscado (tela, cadastro, landing) passou a ser o **semestral**, o menor compromisso à venda:
> riscar R$ 219 seria anunciar desconto sobre um preço que ninguém contrata.

Usuários inclusos: Starter 2, **Profissional 2** (era 4), **Enterprise 4** (era
6). Quem já pagava manteve o que tinha via `usuarios_cortesia` — a 067 soma a
diferença antes de baixar a base, e só para `status IN (ativa,
aguardando_pagamento, suspensa)`. Trial e cancelado entram nas regras novas.

- **`value` do Asaas é o do CICLO, não o mensal.** No anual são os 12 meses de
  uma vez. Mandar o mensal ali corta a cobrança a um doze avos sem alarde.
- O `cycle` da subscription vem de `planos_ciclos.asaas_cycle`.
- `plano_ativo_ate` e a renovação por webhook somam **`ciclo.meses`**, não 1:
  quem pagou o ano seria suspenso em 30 dias.
- Usuário adicional **não** entra no desconto: R$ 100/mês em qualquer
  compromisso. Por isso ele é somado depois do preço do ciclo (`calcularCobranca`).
- O selo de desconto sai do plano **em destaque** (Profissional) na app e na
  landing. Calcular pelo primeiro da lista dava −13%/−25% na app contra
  −14%/−23% no site.

`planos` e `assinaturas` pertencem ao `postgres`: a 067 roda como ele e precisa
dos `GRANT` para o `gestao_user`, senão a API não enxerga `planos_ciclos`.

## Boas-vindas de conta nova (migration 073, refeita em 13/09/2026)

`modules/onboarding/` é a régua; `services/boas-vindas.service.ts` ficou só como a
porta que `auth.service.registrar` chama. **Nada aqui pode derrubar o cadastro**:
quando roda, empresa, usuário e cobrança já existem, e uma exceção cairia no
`catch` que faz rollback — apagaria a conta de quem acabou de pagar. Por isso o
`registrar` envolve a chamada no próprio try/catch e o e-mail sai sem `await` lá
dentro.

| Peça | Arquivo |
|------|---------|
| Trilha e textos padrão por plano | `api/src/modules/onboarding/conteudo.ts` |
| Envio, opt-in, entrega e painel | `.../onboarding.service.ts` |
| Rotas (super_admin) | `.../onboarding.routes.ts` |
| Moldura do e-mail | `landing/onboarding/email-molde.html` |
| Guia (fonte dos 4 PDFs) | `landing/onboarding/guia.html` |
| Tela | `frontend/src/pages/onboarding/OnboardingPainel.tsx` |

**Conteúdo por plano.** Era um e-mail só para os três planos, mandando conectar
WhatsApp e montar funil até para quem assinou o **Starter, que não tem CRM**. Agora
cada plano tem a sua trilha (cumulativa: Profissional = Starter + WhatsApp/CRM;
Enterprise = Profissional + agente e cadência), o seu assunto, o seu texto de
WhatsApp e o **seu PDF**. Quem paga por PIX/cartão/boleto recebe o MESMO conteúdo:
muda só a primeira frase (`ABERTURA.trial` × `ABERTURA.pagante`) — quem pagou
precisa aprender exatamente as mesmas telas.

> **Desde a migration 081 o plano restringe de verdade, e a trilha deixou de ser
> "só conteúdo".** Passo que ensina o que o plano recusa vira um 403 na cara de
> quem acabou de assinar. Foi o caso de *"Dispare para muita gente de uma vez"* no
> **Profissional** — `disparo_whatsapp` é capacidade do Enterprise, e 8 contas
> (39–46) receberam esse e-mail em 15–16/09. Corrigido em 20/09/2026.

> **O canal de WhatsApp não é herdado de um plano para o outro.** A trilha é
> cumulativa no financeiro e no CRM, mas o passo da conexão é próprio de cada um:
> o Profissional conecta por QR Code, o Enterprise conecta o **número oficial da
> Meta** (e ganha um passo sobre a janela de 24h, o modelo aprovado e a cobrança
> que é da Meta). Até 20/09/2026 o Enterprise herdava *"aponte a câmera para o QR
> Code"* — o canal que o plano dele existe para não usar, e que a tela dele nem
> mostra mais desde a migration 084. Nenhum Enterprise chegou a receber: os 13
> envios até aqui foram todos Starter e Profissional.
>
> No guia, a seção do QR é `data-plano="web profissional"` e a do número oficial é
> `web enterprise`. As duas seções de conexão estavam fora da versão **`web`**, que
> é a completa publicada no site — o índice anunciava "Fazer as conexões" e escondia
> as seções; entrou junto.

> **A tabela ganha do código.** `modeloDoPlano` lê `onboarding_modelos` e só semeia
> com o padrão do `conteudo.ts` quando a linha **não existe** — corrigir o TypeScript
> e subir não muda o e-mail que sai. Quem regrava é
> `api/scripts/resemear_onboarding_modelos.js` (simula sem `--aplicar`, pula linha
> editada à mão pela equipe, `--forcar` passa por cima).

**Um guia, quatro PDFs.** As seções de `guia.html` levam `data-plano`, e um script
na própria página esconde o que o plano não tem quando a URL traz `?plano=`. É o
MESMO mecanismo do gerador (`api/scripts/gerar_guia_onboarding.js` abre a página
uma vez por plano), então página e PDF não divergem. A numeração de seção e de
parte é **contador de CSS**, nunca escrita no HTML: seção escondida não gera caixa
e não incrementa contador — número chumbado viraria "1, 3, 6" no PDF do Starter.

**O WhatsApp virou opt-in, pelo número oficial.** A mensagem saía automática, sem
ninguém pedir, pela instância **Baileys 3019** — o disparo que faz um número ser
bloqueado, e o oposto do que o número oficial existe para resolver. Hoje:

1. `Register.tsx` tem uma caixa desmarcada (consentimento é ato, não omissão), e a
   escolha + data + IP ficam em `onboarding_envios`;
2. a confirmação mostra um `wa.me` com a mensagem pronta e um **código de 4
   caracteres** da conta;
3. **quem escreve é a pessoa** — pela Cloud API não podemos iniciar conversa sem
   modelo aprovado pela Meta, mas a mensagem dela abre a janela de 24h em que o
   webhook responde com o texto e o PDF do plano (`sendDocumentMessage`, link
   público — o material já é público).

- O código manda; o telefone é rede de segurança e só vale quando há **um** envio
  aguardando naquele número (dois cadastros podem dividir um celular).
- Dedupe e "uma vez só" são do banco: `onboarding_mensagens.message_id` é UNIQUE
  (a Meta reentrega) e a entrega é `UPDATE ... WHERE whatsapp_status <> 'enviado'
  RETURNING`. São 3 instâncias no cluster — a garantia não pode ser do processo.
- Mensagem que não casa com conta nova **não** vira resposta automática: fica
  registrada (`desfecho = 'sem_conta'`) para a equipe responder.

**A conta nova nasce `creator`, não `master`** — senão o cliente Enterprise recebia
"configure o seu agente de IA" e esbarrava numa tela que só o creator abre, sem
ninguém acima para promovê-lo (ele É o dono). Mesma regra da migration 065.

**Conta institucional = `master@gestao.com`** (usuário 12, empresa 1). A empresa 1
deixou de se chamar "Empresa Demo" — o nome dela entra na assinatura gerada e no
cabeçalho dos relatórios. `api/scripts/seed_conta_institucional_20260913.js`
(idempotente) renomeia, copia o SMTP da empresa 32 **com o `smtp_pass_enc` como
está** (a cifra usa chave global do processo, então o texto cifrado vale em
qualquer empresa) e grava a assinatura de `landing/signature/assinatura-duofuturo.html`
sem sobrescrever uma já existente. `DUOFUTURO_REMETENTE_EMAIL=master@gestao.com`
no `.env`.

> **Marcador de molde citado no próprio comentário do molde.** `String.replace`
> com texto simples troca só a PRIMEIRA ocorrência: o `<!--CONTEUDO-->` escrito no
> comentário de documentação do `email-molde.html` comeu a substituição, e o
> e-mail saiu sem miolo e sem assinatura — com o conteúdo dentro do comentário. A
> troca agora é global (`split`/`join`) e o comentário não cita mais os marcadores.

> **O guia é gerado com a conta demo (empresa 31) e ela pode estar bloqueada.** Em
> 09/09 a assinatura dela virou `cancelada`, e a primeira geração saiu com cinco
> telas de "Assinatura cancelada" — o script não tem como perceber, ele fotografa o
> que aparece. Confira as capturas depois de gerar.

O cadastro pede **telefone** (obrigatório): é o contato da conta e o número do
opt-in. Fica em `empresas.telefone`.

### Aviso de fim do teste grátis (migration 079, 19/09/2026)

`jobs/trial-aviso-scheduler.ts` → `modules/onboarding/aviso-trial.ts`, diário às
**09:00 de Brasília** (o fuso vai no `cron.schedule`; sem ele o job roda 06:00 aqui).
E-mail para o dono da conta (`creator`, com `master` de reserva) cujo teste termina
**amanhã**, pelo remetente institucional. Manual:
`node api/scripts/aviso_trial.js` (simula) / `--previa` / `--aplicar`.

- **`trial_expira_em` é `timestamp` naive guardando o instante em UTC** (vem de um
  `new Date()` do processo). Compare e imprima sempre com
  `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` — `SQL_TRIAL_TERMINA_AMANHA`
  e `SQL_EM_BRASILIA`, com teste de borda em `tests/aviso-trial.test.ts`. Sem a
  conversão, um teste que acaba 23:30 BRT é lido como do dia seguinte e o aviso nunca
  sai; e um que acaba hoje à noite seria anunciado como "termina amanhã" no dia em que
  acaba. O recorte é por **data** de Brasília, não por "faltam 24h": quem assinou às
  23h e quem assinou às 7h são avisados de manhã, que é quando dá para fazer algo.
- `SQL_EM_BRASILIA` devolve a expressão **entre parênteses**: `AT TIME ZONE` prende
  mais forte que `::`, e um `::date` do chamador caía em cima do nome do fuso (`22007`).
- **Idempotência é do banco:** `assinaturas.aviso_trial_em` é carimbado com
  `UPDATE ... WHERE aviso_trial_em IS NULL RETURNING` **antes** do envio; falha no
  envio desfaz o carimbo. São 3 instâncias no cluster (o cron é só da 0, mas a
  garantia não pode ser do processo).
- **Canal é e-mail, só.** Pelo número oficial (Cloud API) não dá para iniciar conversa
  fora da janela de 24h sem modelo aprovado, e o único aprovado é de boas-vindas.
- O molde `email-molde.html` ganhou `<!--TITULO-->`: a chamada do cabeçalho era
  chumbada e o aviso saía com "Sua conta está pronta!" em cima de "seu teste acaba
  amanhã". Quem monta e-mail com o molde preenche os **três** marcadores.
- O endereço de contato do texto é `EMAIL_SUPORTE_CLIENTE` (padrão
  `suporte@duofuturo.tech`), **não** `DUOFUTURO_REMETENTE_EMAIL` — este é
  `master@gestao.com` desde 13/09 e mandaria o cliente para a caixa errada.

**Todo cadastro vira lead no CRM da DuoFuturo** (14/09/2026,
`modules/onboarding/lead-cadastro.ts`): conta suporte@duofuturo.tech (empresa 32),
funil **Vendas CRM** (57), estágio **Entrada** (322), responsável 57, origem
`Cadastro no app`, temperatura quente, `valor_potencial` = mensal do plano. As notas
levam plano, forma de começar (teste grátis/PIX/cartão/boleto), ciclo, opt-in do
WhatsApp e `empresa #id · usuário #id` da conta criada. Destino trocável por
`CADASTRO_LEAD_{EMPRESA,FUNIL,ESTAGIO,RESPONSAVEL}_ID`; o estágio é conferido contra o
funil e o funil contra a empresa, senão não cria nada.

- Mesma regra das boas-vindas: sai sem `await` e nunca lança — o cadastro não depende
  do CRM.
- Telefone que já está no funil **anexa** o bloco nas notas (com carimbo) em vez de
  criar outro card; estágio e origem do card antigo ficam.
- Está no catálogo do dashboard de Integrações (`cadastro_app`).
- **Só cadastro concluído gera lead.** Tentativa que falha (ex.: Asaas fora do ar) é
  desfeita pelo rollback do `registrar` antes de chegar aqui.
- O estágio 322 **não tem automação** (sem follow-up nem agente). Se alguém ligar uma
  cadência ali, ela passa a disparar para todo cliente novo pela instância do
  responsável.
- Conta de teste criada pelo /register também vira lead: apague junto na limpeza.

### Conta sem acesso: trial vencido, suspensa, aguardando pagamento (25/09/2026)

Até esta data o teste grátis nunca acabava: `useAssinatura` tratava `trial` como ativo
sem olhar a data, e o `checkSubscription` (montado antes do `authRequired`) recebia
`req.user` vazio e liberava todo mundo. Dez contas usavam o sistema com o trial vencido.

- **A regra mora num lugar só:** `bloqueioDaEmpresa()` em `assinaturas.service.ts`
  devolve `trial_encerrado` (status `trial` e `trial_expira_em`, naive em UTC, antes de
  `now() AT TIME ZONE 'UTC'` — `SQL_TRIAL_ENCERRADO`), `suspensa`, `aguardando_pagamento`
  ou `null`. Os três têm saída pelo pagamento. O trial **não** vira `expirada`.
- **API:** o `checkSubscription` lê o próprio token e responde **402**
  (`TRIAL_ENCERRADO` ou `CONTA_BLOQUEADA`) a tudo fora de `/auth`, `/planos`,
  `/assinaturas` e webhooks. Cache de 20s por empresa; `esquecerBloqueio` é chamado em
  assinar, suspender, ativar e no webhook do Asaas, e `/assinaturas/minha` consulta
  fresco — as outras instâncias do cluster alcançam em até 20s.
- **Cancelada e expirada ficam fora da API**, bloqueadas só pela tela (`SubscriptionExpired`),
  como antes: a empresa 1 (institucional) está `cancelada` e vive de cortesia (083).
- **Tela:** `/assinaturas/minha` devolve `bloqueio`; o `Layout` espera a assinatura na
  primeira carga, redireciona tudo para `/minha-conta` (só ela e `/planos` abrem, sem
  menu nem Duo) e mostra `AvisoContaBloqueada` — um texto por motivo, uma vez por sessão.
  Depois de assinar, `Planos` recarrega a página inteira (`irParaMinhaConta`): o Layout
  lê a assinatura uma vez por carga, e quem pagou com cartão (que já nasce `ativa`)
  ficaria preso até o F5.
- **Trial vencido vira `suspensa`** de hora em hora (`jobs/trial-suspensao-scheduler.ts`,
  minuto 5, instância 0; à mão: `node api/scripts/suspender_trials_vencidos.js
  [--aplicar]`), com `cancelamento_motivo = 'Teste grátis encerrado'`
  (`MOTIVO_TRIAL_ENCERRADO`). É esse motivo que mantém o aviso "seu teste grátis
  terminou" em vez de "conta pausada". O guard não depende do job: trial com data
  passada já é barrado antes da virada. Primeira aplicação: 10 empresas (33, 37, 39–46).
- **Liberar sem pagamento:** `/gestao/admin` (super_admin) → **Ativar ∞** na empresa
  (`status = 'ativa'`, sem vencimento). Serve para trial vencido e suspensa.
- **O que continua rodando:** webhooks (as mensagens seguem sendo gravadas — o aviso
  promete isso) e os jobs de follow-up/agente da empresa, que não passam pelo guard.
- **Panteras (empresa 5) suspensa em 25/09/2026** a pedido do dono, que desbloqueia pelo
  `/gestao/admin`. Antes: `ativa`, Enterprise, sem vencimento, com assinatura no Asaas
  (`sub_bjqx815p5uh5acjz`).

> **A casa de quem entra é `rotaInicial(user)`** (`utils/roles.ts`), não `/dashboard`.
> Usuário comum sem a permissão Dashboard ia de `/dashboard` para `/` (o `PrivateRoute`)
> e de `/` de volta para `/dashboard` — laço antigo, que ficou caro quando o `Layout`
> passou a buscar a assinatura a cada montagem: ~1.400 requisições/min de um navegador
> só (Jéssica, Panteras, 25/09/2026). Redirecionamento por permissão nunca vai para `/`.

### Caiu no lixo eletrônico do Outlook — e a autenticação estava certa (13/09/2026)

Os e-mails de teste chegaram na pasta de lixo eletrônico do Outlook (tenant Microsoft 365 da
`escolapanthers.com.br`). Medido no mail-tester: **SPF, DKIM (`d=duofuturo.tech`,
seletor `brevo2`) e DMARC passam**, 9,2/10, SpamAssassin −0,3. A causa não é
configuração — é reputação: domínio remetente novo e IP compartilhado do Brevo. O
**PDF anexado não é a causa**: em 14/09 o mesmo e-mail sem anexo (com parte
text/plain) caiu no lixo da mesma caixa. O filtro da Microsoft pesa reputação muito
mais que o SpamAssassin, e ela só se constrói com tempo e volume regular sem
reclamação.

- **Não "consertar" o SPF.** Ele não lista o Brevo e não precisa: o envelope é do
  próprio Brevo (`sender-sib.com`, SPF pass lá), e o DMARC passa pelo alinhamento
  do DKIM. Incluir `spf.brevo.com` não muda nada no DMARC.
- O que o conteúdo tinha de errado, e foi corrigido: ia **só em HTML**
  (`MIME_HTML_ONLY` — agora `htmlParaTexto` gera a parte `text/plain` e
  `enviarEmail` aceita um `texto` opcional); ia com o **comentário interno do molde**
  no código-fonte de todo e-mail (agora `semComentarios`); era uma `<table>` solta,
  sem doctype/`<html>`/charset ("corpo com erros"); e a frase-assinatura da marca
  saía **duas vezes** (a assinatura institucional já termina com ela).
- As 2 "imagens sem alt" que o verificador aponta são os pixels de rastreio que o
  **Brevo** insere, não imagens nossas.
- O mail-tester gratuito aceita **3 testes por dia**; o endereço é
  `test-<qualquer-coisa>@srv1.mail-tester.com` e o resultado sai em
  `https://www.mail-tester.com/test-<qualquer-coisa>`. Com anexo acima de ~1 MB ele
  avisa que não fez a análise completa — meça sem anexo.

### E-mail de cliente só sai pelo SMTP da própria empresa (16/09/2026)

Regra do dono: **nada de uma conta é usado por outra** — SMTP, chave de IA, agente,
nenhuma configuração. Até esta data, empresa sem Config. E-mail enviava disparo, e-mail
para cliente e cobrança pela conta Brevo da Futuron (`SMTP_*` do `.env`), e o guia de
onboarding anunciava isso como "uma conta genérica nossa".

- `enviarEmail` e `enviarEmailCobrancaParcela` exigem credencial explícita; sem ela lançam
  `ERRO_SEM_SMTP` ("Configure em Config. E-mail"). Não existe mais `createTransporter()`
  com o SMTP do processo.
- `configuracoesSmtpService.credenciaisDaEmpresa()` é a única fonte, e só devolve
  configuração **ativa e completa**. Disparo e e-mail para clientes usavam a configuração
  mesmo com "Configuração ativa" desmarcado.
- Disparo de e-mail recusa já na criação (400, nada gravado), inclusive o agendado; o
  agendado que perdeu o SMTP depois é fechado pelo scheduler com a mensagem.
- `notificacao-service` (lembrete/cobrança por vencimento de `clientes`) lê o SMTP da
  empresa do cliente e decifra com a `SMTP_ENCRYPTION_KEY` **lida do `api/.env`** — sem
  segunda cópia da chave. Empresa sem SMTP é pulada. Nunca tinha enviado nada, mas
  estava armado.
- O `SMTP_*` do `.env` continua só como último recurso do `remetenteDuoFuturo()` — e-mail
  institucional nosso (boas-vindas, suporte), não de cliente.
- Ninguém dependia do fallback: zero disparo ou cobrança de empresa sem SMTP nos 60 dias
  anteriores. Testes em `tests/email-sem-smtp.test.ts`.
- **Ainda compartilhado, por decisão anterior do dono:** empresas 1, 5 e 32 usam o mesmo
  login Brevo (`a6f319001`), e a 32 usa a mesma chave Claude da 5.

Remetente institucional: `remetenteDuoFuturo()` em `email.service.ts` (boas-vindas
e suporte). Desde 11/09/2026 ele usa o **SMTP cadastrado pela própria conta
DuoFuturo** (`configuracoes_smtp` da empresa do usuário apontado por
`DUOFUTURO_REMETENTE_EMAIL` — desde 13/09/2026 o `master@gestao.com`, empresa 1) e
só cai no SMTP do `.env` se essa configuração faltar.

**Há duas contas Brevo no sistema, e não são intercambiáveis:**

| Login SMTP | Conta | Onde é usada |
|---|---|---|
| `a6f319001@smtp-brevo.com` | "Instituto" — tem `duofuturo.tech` **autenticado** (brevo-code + DKIM + DMARC com `rua`) e os remetentes `suporte@duofuturo.tech` e `suporte@escolapanthers.com.br` | `configuracoes_smtp` das empresas 1, 5 e 32 → boas-vindas e suporte |
| `a56189001@smtp-brevo.com` | Futuron (`futuroncontato@gmail.com`) | `SMTP_*` do `.env` e do `ecosystem.config.js` → fallback global de quem não tem SMTP |

Mandar `suporte@duofuturo.tech` pela conta da Futuron sairia recusado ou sem o DKIM
do domínio. O DNS de `duofuturo.tech` é da Hostinger (`dns-parking.com`), e lá o
SPF é **um** TXT só. Os nameservers dela demoram a convergir: logo depois de editar
um registro, a mesma consulta devolve o valor antigo e o novo alternadamente, e o
"incompatível" do Brevo nesse intervalo é propagação, não erro.

### Cadastro em uma página só (11/09/2026)

`Register.tsx` deixou de ser um assistente de 4 etapas: dados e plano à esquerda,
o pedido (resumo + forma de começar + aceite + botão) à direita, preso na tela no
desktop; no celular empilha na ordem de leitura. A confirmação troca o formulário
depois do envio — ela depende do que o registro devolve (PIX, link do boleto).

- Teste grátis e PIX/cartão/boleto são **uma escolha só** (`billingType`, padrão
  `TRIAL`) com **um** botão cujo texto diz o que acontece. Eram dois botões, e o
  do teste ficava desabilitado até marcar um aceite que estava abaixo dele.
- O plano em destaque vem pré-selecionado — o resumo precisa de um desde o início.
- Os ícones dos campos vão pela prop `icon` do `Input`. Posicionados por fora, como
  antes, ficavam atrás do campo (o wrapper `relative` do Input pinta por cima).
- O **opt-in do WhatsApp** é uma caixa própria, abaixo do aceite dos termos e
  separada dele: são consentimentos diferentes, e juntar os dois numa caixa só não
  é consentimento de nada. Com ele marcado, o registro devolve `whatsappUrl` e a
  confirmação mostra o botão "Receber no WhatsApp".

## Esqueci minha senha (migration 087, 28/09/2026)

Até esta data não existia: quem esquecia a senha dependia da equipe. Login →
**Esqueci minha senha** (`/gestao/esqueci-senha`) → e-mail com link de 1 hora →
`/gestao/redefinir-senha?token=…`. Tudo em `api/src/modules/auth/redefinir-senha.ts`
e `frontend/src/pages/auth/RecuperarSenha.tsx`; testes em `tests/redefinir-senha.test.ts`.

- **Sai pelo remetente institucional** (`remetenteDuoFuturo`, SMTP da empresa 1), no
  molde das boas-vindas. Não pelo da empresa do cliente: ela pode não ter SMTP.
- **A resposta ao pedido é sempre a mesma** e o e-mail sai sem `await` — nem o texto
  nem o tempo de resposta dizem se o e-mail é de cliente. Mesmo com limite estourado.
- **O banco guarda só o SHA-256 do token.** Uso único por `UPDATE ... WHERE usado_em IS
  NULL RETURNING` (3 instâncias no cluster); link novo aposenta os anteriores.
- Limite: 3 pedidos por usuário e 10 por IP na última hora. Usuário `ativo = false` não
  recebe nada. E-mail comparado sem caixa (`lower`), o login não.
- `/redefinir-senha` **não** redireciona quem está logado: o link pode abrir num
  navegador com outra sessão, e a troca é da conta do link.
- **O JWT não é revogado**: sessão já aberta continua até o fim das 8h.

## Suporte por ticket (`modules/suporte/`, migration 068)

`/gestao/suporte`, aberto a qualquer usuário — pedir ajuda não depende de papel.

**Quem atende é a equipe. A criação do chamado não depende da IA** (fase 0, em
25/08/2026). O ticket nasce em `aguardando_suporte`, gravado junto com a primeira
mensagem numa transação, e `suporte@duofuturo.tech` é avisado **sempre** — antes
de a IA ser sequer cogitada.

Era o contrário até então, e o efeito era um chamado invisível: `criar` chamava
`responderComIA`, e o aviso à equipe só saía se a IA respondesse e marcasse
`[ESCALAR]`. Sem chave configurada (o caso real em produção), a IA nunca rodava,
`marcarParaEquipe` colocava o ticket na fila **sem avisar ninguém**, e o cliente
recebia um e-mail dizendo que "o Duo já está olhando".

- Quem avisa a equipe é quem coloca o ticket na fila — `criar`,
  `responderComoCliente` e `marcarParaEquipe` —, nunca a IA. Falha de IA (sem
  chave, sem saldo, timeout, resposta vazia, exceção) não silencia nada.
- `marcarParaEquipe` só avisa quando a transição de status **acontece de fato**
  (`RETURNING id` com o status atual no `WHERE`). É o que impede aviso repetido
  com as 3 instâncias do cluster — a garantia é do banco, não do processo.
- Resposta do cliente avisa **sempre**, mesmo com o ticket já na fila: resposta é
  evento, não estado.
- **Não há IA neste módulo (removida em 31/08/2026).** Saíram o copiloto de
  sugestão ao atendente, a resposta automática ao cliente, o prompt, o
  `historicoParaIA`, as credenciais `SUPORTE_IA_*` e a rota
  `POST /suporte/tickets/:id/ia/sugestao`. **Nada aqui depende de chave, de
  saldo ou de configuração** — era o oposto do propósito do módulo, que é
  atendimento humano. `AutorMensagem` perdeu `agente_ia`: zero linhas com esse
  autor existiam no banco, porque a IA nunca respondeu a ninguém em produção.
  O roteiro de diagnóstico que a equipe usa vive em **`docs/SUPORTE.md`**, não
  num prompt — e é lá que ficam as causas recorrentes com o comando que prova
  cada uma.
- `alterarStatus` usa `$2::varchar` nos dois lugares. Sem o cast o Postgres
  deduz varchar em `status = $2` e text em `$2 IN ('resolvido',…)` e recusa a
  query com `42P08` — "Marcar como resolvido" devolvia **400 desde a 068**.
- Todo texto de cliente que entra em e-mail passa por `escaparHtml`.
- Quem atende é o `super_admin` (vê todas as empresas). O cliente só enxerga a
  empresa dele: o filtro por `empresa_id` no `getById` é o que impede ler
  chamado alheio pelo id.
- Responder como suporte **não** envia e-mail ao cliente (decisão de 28/08/2026):
  a conversa vive dentro do app. Só saem a confirmação de abertura e o aviso
  interno à equipe.
- Receber e-mail de fora (IMAP → ticket) **não** está implementado; a coluna
  `canal` já existe para isso.

## Editar disparo agendado

`components/crm/EditarAgendamentoModal.tsx` — mesmo compositor da criação
(variáveis, formatação do WhatsApp, prévia, estágio pós-disparo, intervalo
anti-ban e, no e-mail, o **assunto**, que antes era impossível de corrigir).
Substituiu um formulário inline de duas linhas.

Os **destinatários não se editam**: foram congelados em `disparo_leads` quando o
disparo nasceu. Trocar o público é excluir e criar de novo — por isso o botão de
excluir mora no mesmo modal. O intervalo anti-ban é mesclado em
`configuracao_json` com `||`, para não apagar os filtros do modo 'todos' que
vivem no mesmo objeto.

## Interações do Duo (`components/avatar/DuoFace.tsx` + `duo.css`)

Ocioso: respiração, squash e pisca-pisca dos dois olhos. Sob demanda:

| Gesto | Quando |
|---|---|
| Olhar seguindo o ponteiro | Sempre, pela **tela inteira** — não só quando o mouse está em cima dele |
| Piscadela de um olho | Sozinha a cada 9–18s (sorteado) e no hover, junto com o pulo |
| Pulo + sobrancelha | Hover/foco, ou pela prop `ativo` |

- O olhar **satura por distância** (`RAIO_SATURACAO = 190px`), não por tamanho do
  avatar: normalizar por 60px faria o olho bater no limite a qualquer movimento
  e viraria liga-desliga. Perto move pouco, longe move tudo.
- Amplitude é **por eixo** (`MAX_PUPILA_X = 9`, `_Y = 11`) porque o olho é elipse.
  A íris nasce deslocada (+4,+4) do centro, o que deixaria só 6,5 de folga para a
  direita — por isso o grupo `#d3-pupils` é recortado por `#d3-eyes` no SVG: com
  o recorte ela no máximo encosta na borda, nunca escapa do olho. Era 3,5 nos
  dois eixos até 24/08/2026 e o olhar quase não se lia.
- `mousemove` é global, `passive`, coalescido por `requestAnimationFrame`, e o
  `getBoundingClientRect` fica em cache (só re-mede em `scroll`/`resize`) —
  medir por evento forçaria reflow dezenas de vezes por segundo.
- A piscadela é **dirigida por JS**, não um `@keyframes` em loop: ela sobrescreve
  a pálpebra esquerda, e duas animações infinitas disputando o mesmo `transform`
  não convivem. O olho direito segue no ciclo ocioso — é a assimetria que faz
  ler como gesto, e não como trava.
- `animationend` **borbulha** de dentro do SVG: o handler filtra por
  `duo-hop`, senão o fim da piscadela derrubaria o pulo no meio.
- Nada disso roda em tela de toque (`(hover:hover) and (pointer:fine)`) nem com
  `prefers-reduced-motion` — olhar que persegue o cursor é movimento.

Duas instâncias são interativas (lançador e cabeçalho do chat), mas **nunca ao
mesmo tempo**: o lançador desmonta quando o painel abre, então os ids do SVG não
colidem. O Duo de corpo inteiro dos estados vazios é `<img>` e não tem nada
disso — JS não alcança dentro de `<img>`.

## Barra de ações do CRM — quebra, não rola

`CRMKanban.tsx` e `CRMFunilCX.tsx`. A barra tinha `overflow-x-auto` **com a barra
de rolagem escondida por CSS** (`[scrollbar-width:none]` +
`[&::-webkit-scrollbar]:hidden`). Medido em 1600px: 1098px visíveis para 1574px
de conteúdo — **476px inalcançáveis**, engolindo Disparar, E-mail, Novo Lead,
configurar estágio, atualizar e o botão do guia. Roda do mouse não rola eixo
horizontal, então no desktop não havia gesto que trouxesse aquilo de volta.

Agora ela é `flex-wrap`: quebra em linhas e nada fica fora da tela em nenhuma
largura. No celular a quebra também evita a briga do arrasto lateral com o gesto
que abre a sidebar.

Título e barra só dividem a mesma linha a partir de **`xl`**. Em `md` o bloco do
título era espremido a 68px e o seletor de funil transbordava por cima do botão
"Kanban"; em `lg` não colidia, mas a barra virava quatro linhas. O título leva
`shrink-0` e a barra fica com a sobra (`flex-1`).

Verificado em 1920/1600/1366/1280/1024/820/768/430/390 nas duas telas: zero itens
fora da tela, zero colisões.

## Altura das páginas — quem manda a rolagem

O app autenticado já é `h-screen` com rolagem **interna** (`Layout.tsx`): a
página em si nunca rola, só a área de conteúdo. Telas soltas (login, cadastro)
não passam por ele e precisam resolver isso por conta.

**Armadilha do SVG com proporção própria.** `height: 100%` só resolve contra
altura **definida**. Num grid com a linha em `auto`, um `<svg>` com `viewBox`
cai na proporção intrínseca e estica a página: no login a cena (557×706) gerava
1246px de conteúdo numa janela de 830 — barra de rolagem e cena cortada.
Corrigido em 24/08/2026 com `lg:h-screen` no grid + `lg:overflow-y-auto` na
coluna do formulário: janela baixa rola a COLUNA, e a arte ao lado fica inteira.

**Enquadramento da cena:** `viewBox="0 0 1000 740"` + `xMidYMid slice`. A faixa
vertical antiga (`205 16 557 706` + `YMax`) era bem mais retrato que a coluna, e
o `slice` cortava em cima — decepava a cabeça da Lena em qualquer janela baixa.
Com a cena inteira a proporção fica perto da coluna e o que sai é parede.

Regra para tela nova: decoração com proporção fixa **nunca** pode ditar a altura
da página. Ou o container tem altura definida, ou a arte vai em `background-image`.

## Modo escuro — o override global do `index.css` corta os dois lados

O bloco "DARK MODE — Overrides globais" repinta classes inteiras com
`html.dark .classe`, fora de `@layer`. Isso tem duas consequências opostas, e a
tela de login pegou as duas de uma vez (25/08/2026):

- **O override ganha de qualquer `dark:`.** `html.dark .bg-white` é
  `html` + `.dark` + `.bg-white` = **(0,2,1)**, e a variante do Tailwind
  (`.dark\:bg-transparent:is(.dark *)`) é (0,2,0). Escrever `dark:bg-transparent`
  **não** desfaz nada. Para escapar, o elemento não pode ter a classe literal:
  `max-lg:bg-white`, valor arbitrário (`bg-[#fff]`) ou `!bg-white`.
- **Quem tem prefixo não é alcançado.** `lg:bg-white`, `sm:bg-white` e as paradas
  de gradiente (`from-*`/`to-*`) seguem CLARAS no escuro — o seletor casa a
  classe literal, e `from-slate-50` não tem override nenhum.

No login isso dava: coluna do formulário branca (`lg:bg-white`) com o cartão
(`bg-white`) virando um retângulo cinza-800 flutuando nela; no cadastro, o
gradiente claro mais `text-gray-900` (que o override joga para branco) escondia
o título "DuoFuturo" em fundo branco.

Também no escuro: `bg-primary-600` (#243a65) quase some sobre `gray-900` — o
botão Entrar sobe para `primary-500`. E o **autopreenchimento do Chrome** pinta
o campo de azul-claro ignorando `background-color`; só `box-shadow` interno
cobre (regra `:-webkit-autofill` no `index.css`, com `outline` de foco porque o
shadow disputa a propriedade com o `focus:ring` do Tailwind).

A cena do login é clara por natureza: no escuro ela leva filtro
(`brightness .62`) e um véu `gray-900` da esquerda para a direita, que costura a
emenda com a coluna do formulário. Arte trocada, não.

## Ordem dos cards do CRM (15/09/2026)

Seletor ao lado dos filtros no CRM e no CRM CX (`components/crm/OrdenarCards.tsx`), salvo
na URL (`?ordem=`): manual (arrastar), última mensagem, **mais mensagens recebidas**,
entrada mais recente/antiga, **nome A–Z/Z–A**, maior valor e mais quentes. A API ordena
DENTRO de cada coluna (`ORDEM_SQL` em `leads.service.ts`); a visão em **lista** reordena o
conjunto inteiro com `compararLeads`, o espelho do ORDER BY no cliente.

- O valor vira ORDER BY: `normalizarOrdem` só aceita chave própria de `ORDEM_SQL`
  (`Object.hasOwn` — `"constructor" in {}` é `true`). Teste em `tests/ordem-cards.test.ts`.
- Nome usa `COLLATE "pt-BR-x-icu"`: o banco é `C.UTF-8`, e sem isso "Álvaro" ia para
  depois do "z".
- "Mais mensagens recebidas" conta a conversa 1:1 do contato, sem `copia_indevida`, num
  `LATERAL` que só entra nessa ordem (~0,15 s a mais no funil de 5,7 mil leads). O número
  volta como `total_recebidas` e aparece no card.

## Densidade do quadro Kanban

Medido em 24/08/2026 num desktop 1920 a 125% de escala (1526×790 CSS), que é o
caso real do usuário:

| | antes | depois |
|---|---:|---:|
| altura do card | 169px | 130px |
| cabeçalho da página | 123px | 112px |
| lista de cards | 463px | 490px |
| **leads visíveis por coluna** | **2,7** | **3,8** |

O maior ganho não foi CSS: `leads.valor_potencial` é `numeric` no Postgres e
chega ao React como **string**. `"0.00"` é truthy, então o teste antigo
(`lead.valor_potencial ? …`) imprimia **"R$ 0,00" em 91% dos leads** (11.996 de
13.127) — uma linha inteira com divisor, dizendo nada, empurrando lead para fora
da coluna. Agora é `Number(...) > 0`, e a faixa some quando não há valor nem tag.

**Cuidado com todo campo `numeric`/`bigint` vindo do `pg`:** eles chegam como
string. `0` e `"0.00"` se comportam ao contrário em teste de verdade.

O resto veio de juntar linhas que eram empilhadas — responsável + disparos numa
faixa, status do WhatsApp + IA/follow-up noutra (as duas com `flex-wrap`, então
quebram sozinhas quando não couberem) — e de apertar respiro de card, coluna e
board. Nenhuma informação foi removida.

## Material de onboarding

Fonte única: `landing/onboarding/guia.html`. **Nunca editar PDF à mão** — edite o
HTML e rode `api/scripts/gerar_guia_onboarding.js`, que refaz as nove capturas (só
com a conta DEMO, empresa 31 — LGPD) e os **quatro** PDFs: um por plano mais a
versão completa. Seção nova entra com `data-plano` ("web starter profissional
enterprise"); sem o atributo ela aparece em todos.

`landing/onboarding/index.html` é o índice interno do material. O antigo
`email-primeiros-passos.html` (um convite para CRIAR a conta, que ia justamente
para quem acabou de criá-la) saiu de cena: o e-mail agora é montado pela API, e
o que resta na pasta é a moldura `email-molde.html`.

A seção **Instalar no celular** (24/08/2026) cobre o PWA. O app é instalável
hoje — manifest válido em `/gestao/manifest.json` e o Chrome não aponta nenhum
erro de instalabilidade. **Não existe service worker**: por isso as instruções
são pelo menu do navegador (funciona em Android e iPhone) e o guia diz que
precisa de internet. Sem SW não há offline nem banner automático de instalação.

## Como o Duo escreve no chat

O prompt fica em `chat-financeiro.service.ts`. Ele **proíbe** título (`##`),
tabela, linha divisória e citação, limita emoji a no máximo um, mira 4–8 linhas
e manda **terminar quando a resposta acaba** — nada de "ficou alguma dúvida?".
O agente é reativo: perguntou, respondeu, espera; a próxima pergunta pode não ter
relação com a anterior. Pergunta só quando falta dado para responder.

A diretriz antiga dizia literalmente "formate tabelas e listas em markdown quando
útil", e o resultado era uma resposta com `##`, tabela de campos e `---` numa
janela de 380px.

**O widget flutuante renderizava texto puro** (a tela cheia já usava
`react-markdown`), então todo `**negrito**` e `##` aparecia cru. Agora os dois
renderizam markdown — mas isso é rede de segurança, não licença: quem controla o
formato é o prompt, porque tabela em 380px continua ilegível mesmo renderizada.

**Automação de grupo de WhatsApp não tem tela.** Existe tabela
(`automacoes_grupo`), serviço (`automacoes-grupo.service.ts`), rotas montadas em
`/api/gestao/automacoes` e até o `automacoesApi` no frontend — mas **nenhuma
página importa esse client** e não há rota nem item de menu. O prompt listava
"Automações de grupo WhatsApp" nas capacidades, e o Duo inventava um caminho
dentro da tela de WhatsApp. Agora o prompt diz explicitamente que isso não está
na interface. O que existe sobre grupo é a aba **Grupos** dentro do botão
**Contatos**, no CRM (lista grupos e importa participantes como leads).

O prompt também lista os **nomes reais do menu** (Dashboard · CRM / Funil · CRM
Dashboard · CRM CX · Clientes · Receitas · Despesas · Parcelas · Sessões ·
WhatsApp · Agente IA · Suporte). Sem isso ele inventava caminho — mandava
procurar a conexão do WhatsApp "em Configurações", que não existe. **Ao mexer no
menu, atualize essa lista.**

## CRM Dashboard — série temporal e granularidade

O gráfico **Evolução** (criados/ganhos/perdidos) agrupa por **dia, semana, mês ou
ano**, escolhido na própria tela. O agrupamento é feito no **banco**
(`granularidade` em `GET /crm/dashboard`), não no cliente: agregar dia a dia no
navegador exigiria baixar lead a lead.

- A janela padrão (quando não há filtro de data) **muda com a granularidade** —
  30 dias / 12 semanas / 6 meses / 5 anos. Manter 6 meses em `dia` daria ~180
  colunas num gráfico de 260px.
- `DATE_TRUNC('week')` no Postgres começa a semana na **segunda** (ISO-8601).
- O valor entra em interpolação de SQL: `normalizarGranularidade()` reduz
  qualquer entrada aos quatro nomes conhecidos antes de chegar na query.
- A granularidade entra na **queryKey** do react-query — sem isso, trocar de dia
  para mês devolve o cache anterior e o gráfico não muda.
- O backend segue devolvendo a chave `mes`, mas o conteúdo agora é
  `YYYY-MM-DD`, `YYYY-MM` ou `YYYY`. **Todo formatador dessa chave tem que
  deduzir a forma pelo valor** — o `formatMonth` da tabela assumia `YYYY-MM` e
  imprimia "undefined/26" no agrupamento anual.

### Filtro de proprietário derrubava o CRM Dashboard (25/08/2026)

`GET /crm/dashboard?responsavel_id=…` **sem funil** devolvia **500** e a tela
inteira ficava vazia. Causa: a consulta de "leads por estágio" chumbava `$2`
para o funil (`${funilId ? 'AND e.funil_id = $2' : ''}`) mas recebia
`paramsBase` inteiro — que carrega empresa, funil E responsável. Com responsável
e sem funil sobrava um parâmetro sem placeholder, e o Postgres respondia
`08P01: bind message supplies 2 parameters, but prepared statement requires 1`.

**Nunca chumbe `$n` numa query com filtros opcionais.** Numere sempre a partir do
array (`params.push(x); \`= $${params.length}\``). Essa consulta agora monta a
própria lista de parâmetros, do zero, porque o funil aparece nela em posição
diferente (`e.funil_id`, não `l.funil_id`) e o responsável entra no LEFT JOIN.

Testado depois: **210 combinações** de endpoint × funil × responsável × período
no CRM, e os 8 proprietários + 21 funis clicados na tela — zero falhas.

### `/dashboard` caía com 500 em data inválida

O controller fazia `{...req.query}` e mandava direto para o SQL: `data_ini=abc`
ou `data_fim=2026-13-45` viravam 500 e o dashboard sumia. Agora só `YYYY-MM-DD`
que exista de verdade passa (2026-02-30 é recusado); o resto é ignorado, que é o
mesmo que não filtrar. Query string é a parte mais fácil de alterar numa
requisição — sanear ali não é opcional.

### Auditoria dos filtros do CRM Dashboard (25/08/2026)

`funil_id` e `responsavel_id` sempre valeram para **todas** as consultas
(`paramsBase`). O que faltava era o **período**. Medido campo a campo na empresa
5, antes e depois:

| Bloco | Reagia ao período? | Agora |
|---|---|---|
| Resumo, série temporal, temperatura, origem, tempo de conversão | sim | sim |
| **Leads por estágio** | não (11.913 fixo) | sim — leads criados no período, onde estão hoje |
| **Atividades recentes** | não | sim — as 10 últimas DO período |
| **Tarefas** (atrasadas/hoje/pendentes) | não | sim — por `data_vencimento` |
| **Leads sem contato há 7 dias** | não | **continua não, de propósito** |

- Em "leads por estágio", o recorte de data vai no **ON do LEFT JOIN**, não no
  WHERE: no WHERE ele viraria INNER e os estágios vazios sumiriam, mudando o
  desenho do funil conforme o filtro.
- "Atrasadas" mantém `< CURRENT_DATE` mesmo com período — atrasado é relativo a
  hoje, não ao recorte escolhido.
- "Leads sem contato há 7 dias" não é filtrável por período: **a janela de 7
  dias É a métrica**. Cruzar com outro intervalo não produz número com
  significado.
- Como no card de follow-ups, `periodoAtivo` volta na resposta e a tela troca
  "Tarefas para Hoje" por "Tarefas no Periodo".

### Card de Follow-ups respeita os filtros (25/08/2026)

`GET /crm/followups/metricas` filtrava **só por `empresa_id`** e a tela chamava o
hook sem argumento nenhum: os cinco números (pendentes / atrasados / para hoje /
enviados hoje / falhados) mostravam a empresa inteira mesmo com um funil
selecionado. Agora aceita `funil_id`, `responsavel_id`, `data_inicio` e
`data_fim`, com `JOIN leads` para chegar ao funil e ao responsável.

**Cada contador tem a sua própria data de referência**, porque medem coisas
diferentes: pendente/atrasado usa `agendado_para` (quando VAI acontecer),
enviado usa `enviado_at` e falhado usa `updated_at` (quando aconteceu).

Sem período, "para hoje" e "enviados hoje" seguem sendo o dia de hoje. **Com
período, os dois passam a contar o período** — a interseção de "hoje" com um
intervalo que pode nem conter hoje daria zero sem explicação. A resposta traz
`periodo_ativo` e a tela troca os rótulos para "No periodo" / "Enviados", para
não prometer "hoje" quando não é hoje.

### Trocar filtro não pode reiniciar a página

`if (isLoading) return <spinner>` **troca a página inteira**: a queryKey nova
zera os dados, o conteúdo some, a altura colapsa e o navegador joga o scroll para
o topo. Toda consulta que depende de filtro leva
`placeholderData: keepPreviousData` — os dados anteriores ficam na tela enquanto
o novo chega, e só `isFetching` muda. Vale para `/dashboard` e `/crm/dashboard`.

Duas armadilhas do mesmo tipo, ambas encontradas testando:
- **Card que some leva o controle junto.** O card de Evolução era condicionado a
  `leadsPorMes.length > 0`; com o seletor de agrupamento morando dentro dele,
  escolher um agrupamento sem dados fazia o card inteiro desaparecer — e não
  havia como voltar. O card fica sempre montado; o vazio é tratado por dentro.
- **O estado vazio reserva a MESMA altura do gráfico** (260px). Vazio mais curto
  encolhe o card, e o navegador puxa o scroll junto.

Cores vêm de `dashboard/contaazul/paleta.ts`, a única do projeto validada contra
as superfícies reais (o trio azul/verde/laranja passa com ΔE 9,2 no pior par sob
deuteranopia). Rótulo direto em cada barra e a tabela logo abaixo são o alívio
exigido pelo aviso de contraste — a cor nunca responde sozinha. Texto de legenda
usa cor de texto; quem carrega identidade é a bolinha.

## Motor de follow-up (revisado em 25/08/2026)

O job virou três arquivos: `jobs/followup-scheduler.ts` só registra o cron,
`jobs/followup/motor.ts` tem as decisões (todas as dependências entram por
`PortasMotor`, então dá para testar com dublês) e `jobs/followup/despacho.ts` faz o
envio real. Registrar `cron.schedule` no import era o que impedia testar o ciclo —
`npm test` (runner nativo do Node) roda os cenários em `api/tests/`.

**Não existe mais teto de "um toque por dia" nem de "um envio por empresa por
ciclo".** Os dois eram bloqueios por cima do horário desenhado na cadência. Medido
antes: **134 de 168** pares passo 0 → passo 1 saíram em dias diferentes, 4,5h de
atraso médio. O ritmo agora é governado por três coisas e só: a data/hora de cada
passo, o intervalo anti-ban e a janela operacional.

### Passo atrasado não arrasta a cadência (#77, 15/09/2026)

A guarda de ordem (`podeEnviarPassoEstagio`) segura o passo seguinte enquanto o anterior
está aberto — mas ela **não reagenda**, e o horário original continuava valendo. Um passo
0 preso 18 dias (IA sem crédito) deixava D+4 e D+12 vencidos; quando ele saiu, os três
foram em minutos: 29 leads da Panteras. Agora, depois de cada envio de estágio,
`reancorarPassosSeguintes` empurra os seguintes para contar **a partir do envio real**
(regra pura em `reancorarCadencia`, `_shared/agendamento.ts`): base `anterior` → o próprio
atraso; base `entrada` → a diferença entre o atraso dele e o do anterior. Só empurra para
frente (no fluxo em dia o alvo coincide) e data fixa não anda.

- `reclamar` exige `agendado_para <= NOW()`: registro reagendado no meio do ciclo não sai
  com a cópia velha que a fila leu. O motor também pula na hora os ids que acabou de
  reajustar, para não esperar o anti-ban por eles.
- Religar uma cadência não gera rajada: ela é recriada a partir de agora.

### Chip fora do ar não pula passo (#78, 15/09/2026)

Com o chip fora, o toque vira `falhou` (`canal_bloqueado`, ou `canal_indefinido` no
teto) — terminal — e a guarda só olhava `pendente/processando`: o passo seguinte saía no
lugar, "como se tivesse sido feito". Agora `SQL_FALHA_CANAL_RETOMAVEL`
(`followups.service.ts`) define o toque que ainda é a vez dele: falha de canal, **nos
últimos 15 dias** (`DIAS_RETOMADA_CANAL`), o lead não mudou de estágio depois que o toque
nasceu e nenhum passo posterior já saiu. O MESMO predicado:

- segura o passo seguinte (`podeEnviarPassoEstagio`);
- decide quem volta: no começo de todo ciclo, `retomarChipsQueVoltaram` diagnostica cada
  chip com falha retomável e, se ele estiver `disponivel`, devolve os toques à fila (agora,
  tentativas zeradas). O reajuste do #77 espaça o resto.

Os 15 dias existem porque, no deploy, 20 toques de 27–31/08 de um chip conectado teriam
saído na hora — "passando pra saber se viu minha mensagem" três semanas depois. Os toques
são criados ~10 ms ANTES do registro de `mudanca_estagio`, daí a folga de 1 minuto no
predicado.

### Anti-ban: um mecanismo só, por CHIP, contando só automação

`ultimoEnvioAutomaticoPorChip()`. Duas decisões:

- **Por chip (`usuario_id`), não por empresa.** O risco de bloqueio é do NÚMERO que
  envia. Medir por empresa acoplava chips independentes — o chip da Débora enviando
  segurava o follow-up que sairia pelo da Jéssica, sem reduzir risco nenhum.
- **Só automação** (`origem IS NOT NULL AND origem <> 'manual'`, migration 070).
  Antes contava QUALQUER saída, inclusive a conversa manual do operador: operador
  ativo o dia todo empurrava a fila indefinidamente, sem erro e sem alerta.

`historico_mensagens.origem` = manual | followup | disparo | agente_ia | lembrete |
recebida. **Todo caminho de envio novo tem que preencher isso** — sem origem a
mensagem fica fora do espaçamento. Linhas anteriores à 070 são NULL de propósito: a
janela da consulta é de 1h, então elas saem de cena sozinhas.

A fila é por empresa e, dentro dela, **por chip**, todas em paralelo. Dentro de um
chip é sequencial, e é isso que garante que o mesmo lead não receba dois follow-ups
ao mesmo tempo.

### Idempotência: claim atômico, não check-then-act

`reclamar(id)` é `UPDATE ... WHERE status='pendente'`: o Postgres serializa a
escrita na linha, então de dois ciclos concorrentes um vence e o outro vê
`rowCount = 0`. `buscarPendentes` não enxerga `'processando'`.

Um restart do PM2 no meio do envio deixava o registro 'pendente' com a mensagem já
enviada — e o ciclo seguinte mandava de novo. Agora ele fica 'processando' e o
**reaper** (`resolverClaimsOrfaos`, roda no início de todo ciclo) decide **pela
evidência**: se há saída sem erro no histórico depois do `claim_at`, marca enviado;
senão devolve à fila. Nunca por palpite — chutar "provavelmente não enviou"
duplicaria mensagem, que é o pior desfecho.

**Orçamentos:** `ORCAMENTO_FOLLOWUP_MS` (90s) por follow-up e `ORCAMENTO_CICLO_MS`
(55s) por ciclo. Promessa pendurada não é cancelável em JS — o que se ganha é
devolver o controle ao ciclo; o registro fica 'processando' e o reaper resolve.

**Teto de tentativas** (`MAX_TENTATIVAS = 8`, coluna `tentativas`): qualquer
categoria com retry para em algum momento e vira `falhou` com o motivo acumulado.

### A instância NUNCA devolve 403 no /send

Conferido em `api-multi-baileys.js`. O `/send` e o `/send-media` só produzem:

| HTTP | Quando |
|---|---|
| **503** `WhatsApp não conectado` | guard `!isReady` — **inclui chip BANIDO**, deslogado, reconectando |
| 422 | número sem conta no WhatsApp |
| 400 | payload inválido |
| 500 | exceção no envio |

O **403 é `DisconnectReason.forbidden` do Baileys** — código de DESCONEXÃO, exposto
em `GET /status` (`banido: true`) e no webhook que alimenta
`whatsapp_conexao_eventos`. Consequência: **chip banido derruba `isReady` e o
`/send` passa a responder 503**, o mesmo código de "instância reiniciando". Tratar
503 como transitório puro = re-tentar um número banido a cada 15 min para sempre.

Por isso 503 é categoria **`canal_indefinido`** e quem trata chama
`diagnosticarChip()` (`_shared/chip.ts`): `GET /status` da porta e, se ela não
responder, o último evento de `whatsapp_conexao_eventos`.

| Categoria | Destino |
|---|---|
| `ia_credencial` (401/403/saldo da IA) | pausa a EMPRESA 60min |
| `canal_indefinido`/`canal_bloqueado` + chip exige intervenção | **falhou** + disjuntor no chip |
| idem + chip só reconectando | adia 30min, com teto de tentativas |
| `destino_invalido` (422/400) | falhou, sem retry |
| `transitorio` (429/5xx/timeout) | adia 15min, com teto |

O **disjuntor por chip** para de tentar aquele número no resto do ciclo: sem ele, 40
follow-ups do mesmo responsável gastariam 40 tentativas num problema que é um só.

### Janela operacional — uma só para follow-up e agente reativo

`empresas.config`: `janela_envio_inicio`, `janela_envio_fim` (`HH:MM`) e
`janela_envio_dias` (`int[]`, 0=Dom). Sem configuração vale 08:00–20:00 todos os
dias, exatamente o que o agente reativo já tinha chumbado. Editável em
**Agendamentos → Horário de envio**. Todo adiamento passa por
`proximaJanelaValida` — era `NOW() + N minutos`, e um follow-up adiado várias vezes
escorregava para as 22h ou para o domingo.

**Conflito de dias é conflito, não fallback.** Passo restrito a sábado com janela de
segunda a sexta não tem dia possível. Antes o sistema caía silenciosamente nos dias
da janela e mandava a mensagem numa segunda — o administrador nunca sabia que a
regra dele tinha sido ignorada. Agora:

- ao **salvar a cadência** do estágio → **400** com o passo e os dias nomeados;
- ao **salvar a janela** → salva, mas devolve `conflitos[]` e a tela avisa quais
  estágios ficaram sem dia possível;
- em **execução** (dados legados) → `falhou` com `erro_categoria='conflito_config'`,
  visível na lista de falhados e reagendável depois da correção.

`diasEfetivos()` devolve `'conflito'` nesse caso, e `proximaJanelaValida` **lança**
em vez de inventar uma data. Hoje nenhuma empresa configurou dias de janela, então
não há conflito nos dados — mas 1.228 follow-ups pendentes têm `dias_semana`
próprio, então o aviso passa a valer assim que alguém restringir a janela.

### O follow-up de IA não escreve mais às cegas

`processarFollowUpIA` monta o mesmo contexto do reativo: lead completo do banco,
instrução do estágio, agenda (reunião marcada, tarefas) e anotações com autoria.

- O prompt lia `lead.nome`, que **não existe** no registro do scheduler (lá é
  `lead_nome`): saía `Nome: undefined` em todo follow-up de IA.
- `getAgendaLead` recebe `excluirFollowupId` — sem isso o agente via o próprio
  follow-up como "já existe uma mensagem programada".
- Timeout do cliente Anthropic era o **padrão de 10 minutos**; agora
  `TIMEOUT_PROVEDOR_MS = 45s`, o mesmo do reativo.

### Grupo não conta para automação

`grupo_whatsapp_id IS NULL` nos dois guards que faltavam: `msgRecente` (conversa
viva do follow-up de IA) e `respHumanoCheck` (anti-duplicação do reativo). Sem
isso, contato ativo em grupo empurrava o follow-up 15 min por vez, para sempre.

### Anotação automática não é fala de vendedor (migration 069)

`anotacoes_lead.origem`: `usuario` | `agente` | `sistema`. O agente grava uma
anotação a cada follow-up e o prompt injeta as 20 últimas — ele relia as próprias
mensagens como observação de vendedor. `origem` **nunca** vem do cliente: o
controller força `'usuario'`, senão dava para forjar "evento do sistema".

## Observações

- Módulos `integracoes` e `relatorios` foram removidos (ver git log)
- `notificacao-service` roda em paralelo — reiniciar junto se alterar config do banco
- Campo `empresa` na tabela usuarios — VIEW com campos calculados ativa
- RBAC implementado: roles admin/usuario com permissões distintas
