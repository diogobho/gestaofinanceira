# WhatsApp — envio, webhook por porta, mídia, provisão, QR, canal oficial, Cloud API, reações, histórico

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

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

## Coexistência — o número segue no app WhatsApp Business (migration 095, 02/10/2026)

Quem já usa o número no **app WhatsApp Business** do celular não precisa apagar a conta
para ter o oficial: na tela de conexão, o botão **"Já uso o WhatsApp Business no
celular"** abre o mesmo Embedded Signup com `featureType: 'whatsapp_business_app_onboarding'`.
Sem isso a Meta recusa com "este número já está registado numa conta do WhatsApp"
(o caso que motivou, 02/10). WhatsApp **comum** não serve: a pessoa migra para o
Business antes.

- **A janela termina com outro evento** (`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`), que
  traz só o `waba_id`. O número é procurado na WABA (`numerosDaWaba` +
  `escolherNumeroCoexistencia`: um só, ou o `is_on_biz_app`; ambíguo = recusa).
- **Não há `/register` nem PIN**: o número já está registrado, é o do app.
- **24h e UMA chamada** para pedir contatos e histórico (`POST /{phone_number_id}/smb_app_data`,
  `sync_type` = `smb_app_state_sync` e `history`). `sincronizarAposConexao` pede logo
  depois do `ligarConta` e grava `sync_pedido_em`/`sync_erro`. Pedir de novo exige
  desconectar e refazer a janela — por isso a tela não tem "tentar de novo".
- **Webhooks** (`canal/coexistencia.ts`, roteados em `meta-whatsapp.controller.ts`; os três
  campos foram assinados no app da Meta em 02/10 via `POST /{app_id}/subscriptions`, que
  SUBSTITUI a lista — mande sempre a lista inteira):
  - `smb_message_echoes` — o que a pessoa manda pelo celular → `encaminharEcoAoCRM` →
    webhook do CRM como `fromMe` (saída, origem `manual`), igual ao celular do QR.
  - `history` — até 180 dias, em 3 fases (0: dia 0–1, 1: 1–90, 2: 90–180), cada uma com
    `progress` 0–100. Gravado **direto** em `historico_mensagens` (entrada=`recebida`,
    saída=`manual`), **sem** passar pelo webhook do CRM: lá a entrada move etapa, soma não
    lida e acorda o agente. Dedup por `whatsapp_message_id` + contato. Mídia vira texto
    ("📷 Foto (do histórico do celular): legenda") — baixar 6 meses estouraria a cota (076).
    Erro `2593109` = a pessoa recusou compartilhar o histórico → `historico_status = 'recusado'`.
    Progresso na conta = `(fase*100 + progress)/3`; fase 2 a 100% = `concluido`.
  - `smb_app_state_sync` — agenda do app: `add` cria/nomeia o contato (não sobrescreve nome
    digitado no CRM); `remove` é ignorado — apagar no celular não apaga no CRM.
  - Contato novo do histórico/agenda é do dono da porta e já vincula os leads da empresa
    com o mesmo telefone que estavam sem contato.
- **O que a Meta desliga no app**: grupos não sincronizam (ficam só no celular), listas de
  transmissão, mensagens temporárias, visualização única, localização ao vivo. Vazão fixa
  de 20 msg/s. A Groups API da Cloud API também **não** vale para número em coexistência.
- Estado na tela: `GET /whatsapp/canal/oficial` devolve `conta.coexistencia` e
  `conta.historico` (status, progresso, mensagens, erro); o painel do número mostra.
- Testado na empresa demo 31 com contas e payloads simulados (13 cenários) — **ainda não
  com um número real**: a primeira conexão real é a prova de que o evento da janela, a
  busca do número e os webhooks chegam como a documentação diz.

### Revisão do fluxo de conexão (02/10/2026)

- **Trocar de número travava.** Desconectar só desliga a linha de `whatsapp_cloud_contas`
  (ela fica com o `usuario_id`), e o índice `idx_wa_cloud_conta_por_usuario` recusava o
  número NOVO do mesmo operador com 23505 → "já está conectado a outra conta". Agora
  `salvarConta` descarta a linha DESLIGADA de outro número, e `conectar` recusa (409) quem
  ainda está LIGADO a outro número. Reconectar o mesmo número segue pelo `ON CONFLICT`.
- **Erro da janela na v4 vem como `CANCEL` com `error_message`** (não mais `ERROR`) — a
  tela mostrava nada; agora mostra. E a tela espera até 3s pelo `postMessage` com os ids
  depois do callback do login, que chegam em ordem não garantida.
- Token do cliente (conta #2) conferido por `debug_token`: `SYSTEM_USER`, **sem expiração**,
  escopos `whatsapp_business_management` + `whatsapp_business_messaging`.
- **Versão do Embedded Signup = a da configuração de login** (`META_ES_CONFIG_ID`), não do
  código. v2 sai em 15/10/2026 e v3 vale até o fim de 10/2026; a configuração precisa ser
  **v4**. Ela não é legível pela Graph API — conferir no painel (Login do Facebook para
  Empresas → Configurações). `featureType` continua valendo na v4 para a coexistência.

## Um portfólio da Meta por empresa (migration 097, 02/10/2026)

Cada operador que passava pela janela escolhia ou criava um portfólio. A Panteras
terminou com dois ("Duofuturo-oficial", da Débora, e "Jéssica Machado", criado em 02/10
**sem cartão** — `health_status` da WABA: "There is an error with the payment method").
Prática de mercado (360dialog, Twilio, Gupshup): **uma empresa = um portfólio = uma WABA
= um cartão**.

- `whatsapp_portfolio_empresa` (empresa_id PK, business_id, business_nome, waba_id,
  token_enc). Nasce na PRIMEIRA conexão pela janela, que só o **creator** (ou super_admin)
  faz — `oficialController.conectar` recusa os outros com 409 dizendo o nome do dono.
- Com a referência, **número novo da equipe não passa pela janela**: `POST
  /canal/oficial/numero/codigo` cria o número na WABA da empresa (`POST /{waba}/phone_numbers`
  com o token guardado) e pede o código (SMS ou ligação); `/numero/verificar` confere,
  registra (PIN) e liga (`origem = 'portfolio_empresa'`). Sem login no Facebook. O id do
  número é conferido contra a WABA da empresa antes de ligar.
- Número do app (coexistência) ainda passa pela janela e **precisa cair no mesmo
  portfólio**: `conferirPortfolio` recusa outro (`ErroPortfolioErrado`, 409) ANTES do
  registro e antes do pedido de histórico (que só pode ser feito uma vez). Se o
  portfólio não aparece para a pessoa na janela, o creator conecta por ela (tela de
  usuários) e ela lê o QR com o celular.
- Cartão: Tech Provider não lê `primary_funding_id` (só Solution Provider) — o
  `health_status` da WABA é o sinal (`pagamentoPendente`, cache de 10 min por empresa).
- Limite da Meta: portfólio novo tem **2 números registrados**; sobe para 20 com a
  verificação do negócio (ou limite de 2.000 conversas).
- Panteras: referência gravada à mão em 03/10/2026 a partir da conta #2 da Débora
  (creator) — portfólio "Duofuturo-oficial" (business 1139551265014016, WABA
  28421379407517003, que é da Panteras apesar do nome), token da própria conta #2,
  `pagamentoPendente = false`. O número da Jéssica (conta #7) ainda está no portfólio
  pessoal dela, sem cartão: refazer por coexistência (desconectar no Duo e no app em
  Configurações → Conta → Plataforma Business; NÃO apagar a conta) escolhendo esse portfólio.
- **Conectar por alguém que já tem canal (13/10/2026):** a janela da Meta só lista os portfólios a que o
  Facebook de quem entra nela tem acesso — a Jéssica não via o "Duofuturo-oficial". O card do usuário em
  WhatsApp (visão do administrador) agora mostra "Conectar o oficial de X na conta da empresa" sempre que a
  pessoa não tem oficial no portfólio da empresa, mesmo já estando no QR ou com oficial em portfólio pessoal
  (`getEmpresaUsuarios` devolve `oficial: {numero, ativo, naEmpresa}`). Antes só aparecia para quem não
  tinha canal nenhum. Quem entra na janela é o administrador; a pessoa lê o QR com o celular. Depois de
  ligar, o QR antigo dela vira chip de Grupos pelo botão de sempre (reaproveita `portas_anteriores`).

### Guia "equipe no número oficial" (13/10/2026)

`frontend/public/guia-equipe-no-oficial.html` + `.pdf`, com botão "Abrir guia / Baixar PDF"
no topo de **WhatsApp da Empresa** (quando alguém da empresa pode usar o oficial) e o link
"Baixar o passo a passo" na dica de portfólio do `ConectarNumeroOficial`. O dono libera o
**Facebook da pessoa** no portfólio (Controle total), nunca o número: número cadastrado no
site da Meta sai do app. O PDF é gerado do HTML com o puppeteer de `whatsapp-integration`
(A4, margem no `page.pdf`, sem emoji) — mexa no HTML e gere de novo.

**v4: `extras` vazio (15/10/2026).** A página de versões da Meta: na v4 a versão vem da configuração e
`extras: {}` vai de propósito vazio; a coexistência dispara sozinha quando o número digitado está no app.
O Duo seguia mandando `setup`/`featureType`/`sessionInfoVersion: '3'` da v3 com a config v4, e a Hellen caía
no fluxo de SMS com o #2494064 (13 e 14/10). Agora vai vazio, e a coexistência é lida do evento
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (ou do botão). Ainda não testado com conexão real.

**Hellen, 15/10 à tarde: não é a configuração.** Com a antiga (1734820524446940, `featureType`) e com a v4
(`extras: {}`), e com o QR do Duo desconectado do celular, a Meta devolveu o mesmo #2494064 para o
11 97862-1738 (app é Business, `platform: smba`). `META_ES_VERSAO` (v4 padrão; outra = extras com
`featureType`) troca sem build. O token da conta da Débora não lê as WABAs do portfólio (falta
`business_management`), então não dá para ver daqui se o número ficou preso numa WABA. Próximo passo:
"Relatar erro para Meta" com o Session ID, ou o suporte da Meta.

**Passo a passo na tela (15/10/2026).** Com portfólio definido, `ConectarNumeroOficial` põe a
coexistência primeiro, com 5 passos na tela; "Conectar um número novo" (SMS) virou secundário. Os dois
tropeços reais: entrar na janela com outro Facebook (a Jéssica, membro com Controle total, não via o
portfólio) e escolher a WABA do dono, que aparece para quem tem Controle total. `conta.foraDoPortfolio`
(API) liga o aviso de soltar o número no celular. Na Panteras a creator NÃO está no portfólio — as
pessoas (conferido em Usuários → Pessoas em 20/10/2026) são Jéssica (jessdias18@gmail.com), Hellen
Faccin (hellenfagundes21@yahoo.com.br) e o Facebook "diogo bortolozo" (futuroncontato@gmail.com), as três
com Acesso total e ativas. O Facebook "Diogo Bho" do Diogo não vê esse portfólio, só o "DuoFuturo" do app
(2552041805258637). Quem conecta por alguém da equipe na Panteras é a Hellen (master no Duo e pessoa do
portfólio). Não clicar em "Agir" na Central de Segurança: ela sugere remover os e-mails públicos (gmail/yahoo),
que são justamente a Jéssica e a Hellen.

### Coexistência não entra em WABA que já existe (13/10/2026)

Ao conectar a Hellen (Panteras) escolhendo a WABA "Debora Silva", a janela da Meta caiu na tela
padrão ("Insira um novo número de telefone", SMS/ligação) e recusou o número com
"já está registrado em uma conta do WhatsApp" (#2494064), mesmo com
`featureType: 'whatsapp_business_app_onboarding'` e o app sendo Business (`platform: smba` no
creds.json da sessão 3014). Parceiros da Meta descrevem a WABA de coexistência como 1:1 com o
número. Logo, cada pessoa no app ganha **WABA própria** dentro do portfólio da empresa, e os
modelos têm de ser copiados para ela. O guia `guia-equipe-no-oficial` foi corrigido.

**Cópia automática dos modelos (14/10/2026).** `canal/copiar-modelos.ts`: ao conectar
(`oficial.controller.conectar`, em segundo plano) e a cada hora (`jobs/modelos-empresa-scheduler.ts`,
minuto 17), os modelos APROVADOS da conta-fonte vão para as outras WABAs ativas da mesma empresa.
Fonte = conta ativa do creator; senão a do número da empresa inteira. Só copia o que falta (nome +
idioma) e pula cabeçalho de mídia (o arquivo só vale na WABA de origem). Até 90 por rodada; erro de
limite da Meta para a rodada e o job continua na hora seguinte. A Meta reavalia cada cópia. Panteras:
fonte = conta #8 (Débora, WABA 3108579155958685), 99 aprovados em 14/10. Ainda não rodou com destino
real (nenhuma segunda WABA ativa na empresa).

**v5 (21/10/2026) — a causa de todo #2494064 desde 13/10.** A Meta desligou v2/v3 em 15/10/2026
(pedido v2/v3 é servido como v4) e na v4 o `featureType` é ignorado: a janela só oferece número novo
(SMS/ligação) e recusa o número do app com #2494064. A suposição de 15/10 ("na v4 a coexistência entra
sozinha") estava errada. A v5 (lançada 20/10/2026) liga a coexistência por padrão, pedida com
`extras: { version: 'v5' }` (opt-out por `features`). Agora: `META_ES_CONFIG_ID=1369736425237391` +
`META_ES_VERSAO=v5`. Primeira prova real: Jéssica (Panteras) em 21/10.

## Conversa do intervalo fora do ar (histórico depois do logout)

Quando o WhatsApp derruba o chip QR (401) e ele é pareado de novo, o que foi conversado
pelo celular no intervalo só chega no `messaging-history.set`. Até 23/10/2026 esse handler
aproveitava só contatos e chats, e a conversa sumia do card (Ive, 22/10).

Agora `whatsapp-integration/api-multi-baileys.js` grava a última vez online em
`.ultimo-online-<clientId>.json` (fora da pasta de auth, que o logout apaga; a cada 60s
conectado e no `open`). O socket lê esse valor ao nascer, e o history set reenvia ao CRM as
mensagens 1:1 com timestamp a partir dele (−60s, teto de 7 dias), pelo mesmo
`processarUpsert` do `messages.upsert`, marcadas `__historico` → payload `historico: true`.
Sem arquivo (primeiro pareamento) não importa nada — seria o celular inteiro.

No CRM (`webhook.controller.ts`), `historico` grava e vincula ao lead e **para**: não cria
contato nem lead, não soma não lida, não aciona automação, agente nem resposta por botão.
Duplicata cai no dedup por `whatsapp_message_id`. Grupos ficam de fora.

Os arquivos das portas que já estavam fora em 23/10 foram semeados pela hora do LOGOUT do
log (só a 3021 tinha queda recente).
