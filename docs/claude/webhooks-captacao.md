# Webhooks de captação (Caixa Rápido, SendFlow, tags de origem, diagnóstico)

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

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
- **Dono pelo chip que falou primeiro** (01/10/2026, #195): a mensagem que a automação do
  SendFlow manda sai por um chip nosso e volta ao webhook como `fromMe`. A primeira saída 1:1
  para um lead de origem SendFlow, até 7 dias depois de ele nascer, passa o card ao dono
  daquele chip (`primeiraSaidaDeLeadDoSendflow` + `transferirPropriedadeSeDiferente`,
  atividade `transferencia_automatica`). Medido em 01/10: toda boas-vindas da automação saía
  pelo chip da Débora (3011). Depois da primeira saída nada muda sozinho.
- **O dono por URL continua sem uso**: todos os eventos chegam sem `&dono=`, e as três
  automações da Panteras usam o mesmo webhook — separar o responsável depende de a Débora
  dizer quem cuida de cada uma (#195), e provavelmente de um mapa campanha → dono no código.
- **Tags** (`TagsDoLead.tsx`, no card do lead): a API e a tabela existiam, faltava a tela.
  A tag é da EMPRESA — criar uma que já existe (sem caixa) devolve a existente —, e
  `addTag` passou a recusar tag de outra empresa. Criar tag falhava sempre antes disso
  (`usuario_id` NOT NULL nunca era preenchido).

#### Tags de origem — só Panteras (migration 090, 30/09/2026)

Todo lead da empresa 5 ganha a tag da campanha/canal de onde veio **e** uma a mais para cada
caminho que as notas provam (formulário do Caixa Rápido, grupo do SendFlow, Hotmart,
diagnóstico, form do Leadership — a leitura é a mesma do dashboard de Integrações). Regras
em `crm/tags/tags-origem.ts` (`REGRAS_POR_EMPRESA`, teste `tests/tags-origem.test.ts`); as
variações do Caixa Rápido viram uma tag só. **Fora, por escolha do dono:** importacao,
planilha, planilha-panthers, manual, whatsapp, CRM e lancamento. `Workshop Liberdade
Financeira` também não está na lista.

- Quem aplica é o job `jobs/tags-origem-scheduler.ts` (a cada minuto, leads com `updated_at`
  nos últimos 15 min; 24h ao subir), não cada ponto que cria lead — são mais de dez.
- **Tag tirada à mão não volta:** `lead_tags_origem` guarda o par (lead, tag) já aplicado.
- Carga inicial: `node api/scripts/aplicar_tags_origem.js` (simula) / `--aplicar` — 1.892
  tags em 30/09, 53 leads com mais de uma. Origem nova vira tag só entrando nas regras.

**Filtro por tag** (vale para toda empresa): seção "Tags" no painel de Filtros do CRM e do
CRM CX, várias marcáveis — o lead entra se tiver **qualquer** uma. Viaja como `?tags=12,25`
(`lerTagIds`, teste `tests/filtro-tags.test.ts`) e o `EXISTS` prende a tag à empresa do lead.
Junto: `useLeads` mantém os cards anteriores enquanto a nova lista chega (só no mesmo funil) —
antes, qualquer filtro trocava o quadro pelo spinner e fechava o painel no meio do clique.

`form-diagnostico` é chamado pelo app de Diagnóstico (`/var/www/apps/diagnostico`)
em dois eventos: `iniciado` cria o lead e `concluido` anexa uma anotação com
score, perfil e plano recomendado no lead existente (achado pelo telefone no
funil). Detalhes em `diagnostico/CLAUDE.md`.

Cuidado ao criar outro: `leads.origem` é **VARCHAR(50)**, e
`POST /api/crm/leads` **não valida** se o `funil_id` do body pertence à empresa
do token — daí a preferência por webhook com secret em vez de JWT de serviço.
