# Motor de follow-up

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

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

## Respostas por botão (migration 094, 01/10/2026)

Regra por **estágio**: "se o lead de origem X **clicar** no botão Y, envie estas mensagens e crie
um FUP para N dias". Configurada no modal do estágio (`RespostasBotaoConfig.tsx`), salva junto com
ele em `respostas_botao` (tabela do gestao_user; `estagios_funil` é do postgres). Serviço em
`modules/crm/respostas-botao/`, regras puras em `regras.ts` (teste `tests/respostas-botao.test.ts`).

- **Só o clique dispara** (decisão do dono): `entrada.ts` marca `botao: true` no payload quando a
  Cloud API manda `type: button` (resposta rápida de modelo) ou `interactive.button_reply`. Texto
  digitado, mesmo "sim", não entra. Baileys nunca marca — é recurso do número oficial.
- No webhook, depois da automação de resposta (que já moveu o card), `aplicarCliqueDeBotao` olha o
  estágio em que o lead está **agora**. Por isso o desenho é: Entrada manda o modelo e move para
  Tentativa de Contato; a resposta move para Conexão; a regra mora na **Conexão**.
- Regra com origem vence a sem origem; comparação sem caixa/acento. Cada regra vale **uma vez por
  lead** (`respostas_botao_aplicadas`, `INSERT … ON CONFLICT DO NOTHING`). Salvar a lista mantém o
  id da regra de mesmo botão+origem, para editar o texto não reenviar a ninguém.
- Mensagens saem pelo responsável, 2,5 s entre elas, `origem = 'followup'`. Áudio não tem legenda: o
  texto do passo sai logo depois. Falha interrompe a sequência (fora de ordem é pior) e fica na
  atividade do card (`dados.trigger = 'resposta_botao'`); a tarefa é criada mesmo assim.
- Anexos (áudio m4a/mp3/ogg, vídeo mp4, imagem, PDF) pelo upload da cadência; m4a chega como
  `audio/x-m4a` e é gravado como `audio/mp4`, o nome que a Meta aceita. Os caminhos estão em
  `SQL_PROTEGIDOS` da cota de mídia.
- Modelo pronto **"Boas-vindas com Sim/Não"** (`boas_vindas_conhece`, botões "Sim, conheço" /
  "Ainda não") em `modelosProntos.ts` — o texto do botão da regra tem que ser o do modelo.

**Panteras (empresa 5), funil 24, estágio Conexão (310):** 4 regras (Clube do Livro / Desafio 52
semanas × Ainda não / Sim, conheço), com os áudios do dono e FUP em 3 dias. Inertes até alguém da
equipe estar no oficial: em 01/10 ninguém estava (conta 2 da Débora desligada em 29/09).

### Botões no QR, "mover para" e pergunta encadeada (05/10/2026)

- **QR também tem botão:** `api-multi-baileys.js` ganhou `POST /send-escolha` (`quick_reply` do
  nativeFlow, até 3 botões, mesmo truque do `/send-botao`). Não é recurso oficial: se o envio
  interativo lançar, sai texto com as opções listadas (`botoes: false`) — o texto deve dizer
  "toque em SIM ou NÃO". O clique volta como `interactiveResponseMessage`; `respostaDeBotao()`
  devolve o texto do botão e o webhook leva `botao: true`, então `aplicarCliqueDeBotao` vale igual.
  Texto digitado continua não disparando (decisão de 01/10).
- **Teste real (05/10, chip 3019 → o próprio número):** o botão NÃO apareceu no celular do dono.
  Por isso existe **`aceita_texto`** na regra ("vale também a resposta escrita"): o lead escreve
  "sim"/"Sim!"/"sim, quero" e `aplicarRespostaEscrita` (webhook, quando não é clique) roda a regra.
  Casa a frase igual ao botão ou o botão + até 2 palavras (`regraDaRespostaEscrita`); "não sei se
  agora dá" não casa. Desligado por padrão — regras da Panteras seguem só no clique. No QR, o
  convite vai como TEXTO pedindo "responda SIM ou NÃO", não pelo /send-escolha.
- **Passo com botões:** `passos[i].botoes` (só texto). `contatosService.enviarMensagem(…, botoes)`
  usa `/send-escolha` no QR; no oficial sai o texto com as opções.
- **`mover_para_estagio_id`** na regra (coluna criada pelo serviço): move ANTES de mandar a
  sequência, para a resposta à pergunta seguinte cair nas regras da etapa nova. Só etapa do
  mesmo funil.
- Só a `whatsapp-3019` foi reiniciada com o endpoint novo (05/10, 22h): as outras instâncias o
  ganham no próximo restart — até lá, `/send-escolha` nelas dá 404.
- Primeiro uso: conta suporte@ (empresa 32), funil Vendas CRM — Convite ecossistema (412) →
  SIM: Quer entrar (413) + FUP 2 dias / NÃO: Disse não (414) com "Quero novidades"/"Não,
  obrigado" → Nutrição (415) / Sem interesse (416).

### Modelo de reserva também no follow-up do card (migration 098, 04/10/2026)

No número oficial, com a janela de 24h fechada, só modelo aprovado é entregue. A cadência
do estágio tinha a reserva por passo (`followup_config.passos[i].modelo_whatsapp`, lida na
hora do envio); o follow-up **avulso do card** não tinha onde guardar uma e falhava com
`sem_modelo` sempre que o lead não tivesse escrito nas últimas 24h.

- `followups_agendados.modelo_whatsapp` (JSONB) guarda a reserva do avulso — ele não tem
  config viva para consultar. `viaModeloSeJanelaFechada` (`despacho.ts`) lê do estágio
  quando `origem = 'estagio'` e do próprio registro nos outros casos.
- A mensagem de falha muda por origem: a cadência pede "escolha o modelo no passo e
  reagende"; o avulso pede "cancele e agende de novo" — reagendar o avulso sairia sem
  modelo de novo.
- Tela: `ModeloReservaWhatsApp.tsx` é o bloco único, usado em `CadenciaConfig` e no painel
  de follow-up do `LeadDetailsModal`; só aparece quando o canal do usuário é `cloud_api`.

### Funil oficial da Escola na Panteras — funil 74 (06/10/2026)

Os 50 modelos do documento "Modelos de Mensagem e Configuração do CRM" (Escola de
Empreendedorismo) foram criados na WABA da **Débora** (conta 8, a única ativa na Panteras),
em `pt_BR`. O fluxo mora no funil **74 "Escola Empreendedorismo Oficial"**, que tem as 11 etapas do
24 sem a "Entrada de leads teste" e com `auto_criar_lead` desligado. Cada cadência aponta para a
variante **A** como modelo de reserva, e todas estão com `ativo: false`. O **funil 24 não usa o fluxo
oficial**: ele chegou a ser configurado por engano e foi devolvido ao backup
`api/scripts/backups/funil24_cadencias_2026-10-06.json`, que fica fora do git.
Nenhum webhook ou captação manda lead para o 74 ainda.

- **Campo vazio barra o modelo** (`viaModeloSeJanelaFechada`): a variável que resolve vazia,
  ou que continua como `[Token]`, faz o follow-up falhar com "preencha no card …". Antes ela
  saía como "-" no meio da frase.
- Tokens usados que o CRM **ainda não resolve**: `[OrigemFrase]`, `[Negocio]`, `[Objetivo]`,
  `[Desafio]`, `[Duvida]` e `[Presente]`. Até eles existirem, só a abertura (`abr_ger_v1`) e as
  boas-vindas (`gan_0_v1`) conseguem sair.
- `problemaNoTemplate` passou a recusar corpo que começa ou termina em variável, mesmo com
  pontuação depois. Foi o motivo da recusa do `reu_ns1_v1`.
- A Reunião Agendada (211) não foi tocada. Os lembretes são `reuniao_lembretes` em texto livre,
  sem modelo, e não têm o dia, a hora nem o link da reunião como variável.

**Complementos do mesmo dia (06/10/2026, ainda tudo desligado):**
- **Campos do card** "O que o lead contou" (migration 100, em `leads`): `negocio`, `objetivo`, `desafio`
  e `duvida` (`PerfilDoLead.tsx`). Viram `[Negocio]`, `[Objetivo]`, `[Desafio]` e `[Duvida]` em
  `aplicarVariaveisLead`; `limparCampoPlaybook` tira o ponto final, porque o valor entra no meio da frase.
- **`[OrigemFrase]`** vem de `empresas.config.origem_frases` (`{regras:[{contem, frase}], padrao}`), por
  empresa e sem acento (`jobs/followup/origem.ts`). Na Panteras: clube do livro, desafio, workshop e o padrão
  "na Escola de Empreendedorismo".
- **Abertura por origem:** `modelo_whatsapp.por_origem: [{contem, nome}]` no passo troca só o nome do modelo.
  Atenção: escolher outro modelo na tela recria o objeto e **apaga o `por_origem`**.
- **Parar de receber** (`modules/crm/optout`): o clique no botão, ou a mensagem inteira sendo "parar", "sair",
  "cancelar"…, grava em `whatsapp_optout` (chave = DDD + 8 últimos dígitos). O card vai para a etapa de perda
  com motivo, os pendentes são cancelados e a automação de resposta não roda. `despachar` devolve `cancelado`,
  e o disparo falha esse lead com o motivo. A conversa manual continua livre.
- **Funil 74:** a Objeção sem resposta vai para a Perda. A Nutrição não move: depois dos 6 meses repete os 6
  modelos de 60 em 60 dias (D+240…D+540). A Conexão (430) tem as respostas por botão dos áudios do 24
  (Clube do Livro e Desafio 52 semanas, com "Quero entender"/"Já sei"), mais respostas sem origem para
  "Já conheço", "Já sei" e "Quero entender".

**Fluxo completo do documento no funil 74 (06/10/2026, ainda desligado):**
- **Reunião Agendada (432)** não tem cadência por entrada: a régua são os `reuniao_lembretes`, agora com
  modelo. Marco ganhou `modelo_whatsapp` (sai no oficial com a janela fechada; senão sai o texto),
  `base: 'criacao'` (a confirmação "assim que marca", contada da criação da tarefa) e `mover_apos`
  (o no-show D+6 move para `estagio_apos_envio_id` = Perda). As variáveis da reunião estão em
  `jobs/reuniao-variaveis.ts`: `[DiaReuniao]` ("quarta-feira, 14/10"), `[HoraReuniao]` ("16h"),
  `[LinkReuniao]` (o 1º https do título ou da descrição da tarefa; o `agendar_reuniao` do agente grava o link
  ali) e `[Horario1]`/`[Horario2]` (os 2 próximos dias úteis no mesmo horário: é uma proposta, não reserva de
  agenda). O no-show para quando o lead escreve depois da reunião.
- **Teste A/B:** `modelo_whatsapp.variante_b` em Tentativa, Conexão e Qualificação. Lead de id par recebe A,
  ímpar recebe B, sempre o mesmo em todo o funil; o card recebe a tag "Variante A"/"Variante B" (`varianteDoLead`).
- **Nutrição:** `followup_config.voltar_ao_responder` → o webhook devolve o card para a etapa de onde ele
  veio (`leadsService.etapaAnterior`, pela atividade `mudanca_estagio`), e `estagio_apos_resposta_id` fica de reserva.
- **Perda:** PER-1…4 em D+30/90/150/210 e depois repetidos a cada 60 dias até D+690.
- O foco da IA de cada etapa entrou em `instrucoes_agente_ia`. O agente da etapa continua desligado. O prompt
  geral da Panteras ganhou um bloco "Regras de condução" no topo e `contexto_mensagens = 60` (backup em
  `api/scripts/backups/agente_panteras_prompt_2026-10-06.txt`). A regra "com a janela fechada não envie nada"
  ficou de fora de propósito: o prompt é da empresa inteira (QR incluído), e quem garante isso é o despacho.

### Cadência de entrada por origem — Clube do Livro e Desafio 52 (06/10/2026)

Job `jobs/cadencia-entrada-scheduler.ts` (5 em 5 min, instância 0), regras em
`modules/crm/cadencia-entrada/cadencia-entrada.ts` (`REGRAS_ENTRADA`, hoje só Panteras/funil 24;
teste `tests/cadencia-entrada.test.ts`). Pedido do dono:
- **Entrada (208)** com 1º contato (mensagem nossa OU boas-vindas da fila do grupo, casada pelo
  telefone) e **resposta** → **Conexão (310)** + tarefa `follow_up` 1 semana depois da RESPOSTA.
  Sem resposta em 24h → **Tentativa (209)** + tarefa 2 dias depois do contato. Sem contato
  nenhum → fica, com tarefa "Primeiro contato" do dia em que entrou.
- **Tentativa**: respondeu DEPOIS de entrar nela → Conexão + tarefa (o webhook já move pelo
  `estagio_apos_resposta_id`, mas não acha card sem contato vinculado — o do grupo nasce assim).
- Card de Tentativa/Conexão sem tarefa pendente ganha uma. Datas contam do fato, não de hoje
  ("já acumula"). Só `follow_up` — `reuniao` dispara lembrete ao lead.
- Também vincula o contato ao card sem `contato_whatsapp_id` e dá nome ao card só-telefone quando
  o contato tem nome. Card sem nome nenhum só ganha nome quando a pessoa escreve (webhook).
- `moverPorAutomacao` grava `novo_estagio_id` (a tela lê `estagio_novo_id`): a leitura usa os dois.
- 1ª rodada (06/10 11h50): 73 movidos, 315 tarefas (155 de primeiro contato da Débora, cards do SendFlow).

### Passo por origem do lead e o funil 74 (06/10/2026)

Um passo da cadência pode valer só para algumas origens: `passos[i].origens = {modo:'so'|'exceto', contem:[...]}`
(comparação sem acento, "contém"). `_criarFollowupEstagio` filtra com `passoValeParaOrigem`
(`_shared/agendamento.ts`), mantém o índice original do passo e move o card no último passo VÁLIDO.
O editor (`CadenciaConfig.tsx`) preserva o campo e mostra "só …"/"menos …" no passo, assim como a visão Fluxo.

Funil 74 (Escola Oficial), pedido do dono: Clube do Livro e Desafio começam na Entrada (428) com a abertura
automática e, enviada, vão para Tentativa (429). Na Tentativa só fica quem não respondeu: qualquer resposta
(texto ou botão) move para Conexão (430), o que encerra os FUPs da Tentativa. As regras de botão do Clube e do
Desafio (13–16) ficam na Conexão e rodam depois do movimento (a regra com origem vence a genérica 17–19).
Resposta na Objeção (434) não move: fica e segue a cadência. Perda (437) → Fechamento ao responder.
`origemTemFluxoDeRespostas` (webhook pula o "ao responder" quando o estágio tem regra da origem) continua no
código, mas hoje não age no funil 74.
Outras origens: nada automático na Entrada; a abertura é o passo 1 da Tentativa (`modo:'exceto'`).
Backup do antes: `api/scripts/backups/funil74_entrada_tentativa_2026-10-06.json`.
Nutrição do funil 74 (06/10/2026, dono revisa depois): um assunto por mês só com [PrimeiroNome]
(ferramenta gratuita, Desafio 52, Clube do Livro, vídeo curto, história de aluna, aula ao vivo + retomar),
modelos `nut_1_v2`…`nut_6_v2`; meses 7–12 repetem. Script `api/scripts/nutricao_funil74_20261006.ts`
(backup em `scripts/backups/nutricao_funil74_2026-10-06.json`). Campo vazio em modelo de reserva vira
tarefa "Preencher … no card" para o responsável (`despacho.ts`).
FUPs do funil 74 reescritos em 06/10/2026 (`api/scripts/fup_funil74_20261006.ts`, backup
`scripts/backups/fup_funil74_2026-10-06.json`): Tentativa só FUP (sem abertura; outras origens recebem a
abertura à mão na Entrada), D+3/D+7 pela origem e D+15 encerrando com educação → Nutrição; Conexão só
[PrimeiroNome]/[OrigemFrase] (conhecer o lead); Qualificação só [PrimeiroNome], o agente retoma de onde parou.
Modelos `ten_/con_/qua_*_v2`. Visão Fluxo esconde lembrete de reunião desligado sem modelo (cópia padrão em toda etapa).

### Funil 74 ligado até a Qualificação (13/10/2026)

Pedido do dono: testar Entrada → Tentativa → Conexão → Qualificação; o resto (Reunião em diante,
Perda, Nutrição) segue desligado. Backup do antes em `api/scripts/backups/funil74_antes_teste_2026-10-13.json`;
configuração em `api/scripts/funil74_teste_ate_qualificacao_20261013.ts`.
- **Versão sem nome fora da abertura:** o passo (e a `variante_b`) aceita `sem_nome: {nome, variaveis}`,
  aplicado por `modeloSemNome` depois de `varianteDoLead`. Tentativa usa `ten_*_sn` (só `[OrigemFrase]`).
- **Cadência que conta do silêncio:** `followup_config.reiniciar_ao_responder` — cada mensagem do lead
  cancela os toques pendentes da etapa e recria a cadência a partir de agora
  (`leadsService.reiniciarCadenciaAoResponder`, chamado no webhook; rajada < 10 min não recria). Na
  Conexão e na Qualificação o D+3/7/15 conta da última resposta.
- **Variáveis escritas pela IA:** `[IA:assunto]` e `[IA:pergunta]` em `modelo_whatsapp.variaveis`. Com a
  janela fechada (sempre, depois de 3 dias de silêncio), `agenteIaService.gerarCamposDoModelo` lê a
  conversa, as anotações e a instrução do passo e devolve o JSON; a Meta recusa quebra de linha no
  parâmetro, então sai achatado e cortado (60/160). Modelos `ret_1_ia`…`ret_3_ia`, sem nome e sem A/B,
  os mesmos na Conexão e na Qualificação (o papel do toque vem da instrução).
- O editor de cadência (`CadenciaConfig.tsx`) passou a devolver `voltar_ao_responder` e
  `reiniciar_ao_responder` ao salvar — antes salvar pela tela apagava as opções do topo da config.

## Tarefas ao entrar no estágio (108, 13/10/2026)

`estagios_funil.tarefas_entrada` (lista de `{titulo, descricao, tipo, prioridade, prazo, unidade, hora}`),
editada em Editar Estágio › "Tarefas ao entrar nesta etapa" (`TarefasEntradaConfig.tsx`).
`aplicarTarefasDoEstagio` (`leads/tarefas-estagio.ts`) roda nos quatro caminhos de entrada —
`create`, `moverPorAutomacao`, `mover` e `moverParaFunil` — logo depois de `_criarFollowupEstagio`.
NÃO roda no `reiniciarCadenciaAoResponder` (o card não mudou de etapa) nem na importação em massa.

- A tarefa vai para `responsavel_id || usuario_id` e grava `tarefas_lead.estagio_origem_id`.
- Ao entrar em outro estágio, as pendentes com `estagio_origem_id` diferente são **canceladas**;
  tarefa sem `estagio_origem_id` (à mão, botão, cadência de entrada) nunca é tocada.
- Mesma tarefa pendente (lead + estágio + título) não é criada duas vezes.
- Prazo em hora = instante exato; em dia = no horário `hora`, e sáb/dom rolam para segunda
  (`calcularAgendadoPara`). Vencimento gravado naive em UTC, como o resto das tarefas.
- Tipo `reuniao` é recusado de propósito: ele liga lembretes e no-show.
- INSERT…SELECT com parâmetro usado em duas posições precisa de cast (`$6::varchar`), senão o pg
  recusa com "inconsistent types deduced" — e o erro só aparece no `console.warn`.

Funil 74: uma tarefa por etapa (duas na Reunião Realizada), tiradas do Guia Comercial
(`scripts/funil74_tarefas_por_etapa_20261013.ts`; backup vazio em `scripts/backups/`). A da Entrada
("Abertura não saiu") é rede de segurança: some quando a abertura automática leva o card à Tentativa.
