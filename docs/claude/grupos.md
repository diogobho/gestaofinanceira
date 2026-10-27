# Grupos do WhatsApp — página, campanhas, importar participantes

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

## Página de Grupos do WhatsApp (migration 088, 28/09/2026)

`/gestao/grupos` (menu **Grupos**, capacidade `grupos_whatsapp`, permissão `whatsapp`):
**Mensagens** para vários grupos (agora / agendada / repetindo em dias+hora de Brasília,
com anexo e "marcar todos"), **Boas-vindas** a quem entra e **Meus grupos**. Referência de
produto: SendFlow. API em `modules/grupos/` (montada em `/api/grupos` **e**
`/api/gestao/grupos` — o nginx tira o `/gestao`), regras puras em `agenda.ts` com teste,
job `jobs/grupos-scheduler.ts` (a cada minuto, instância 0), tela em `pages/grupos/`.

- **Só QR Code.** A Groups API da Meta exige Conta Comercial Oficial (selo verde) e para em
  **8 participantes**, entrando só por link. O nº da Débora tem `is_official_business_account:
  false` (conferido em 28/09).
- **Chip de Grupos (101, 06/10/2026).** Quem está no oficial (Enterprise) conecta na própria página
  de Grupos um segundo WhatsApp por QR, só para os grupos: `whatsapp_chip_grupos (usuario_id, porta)`.
  `portaDo`/`SQL_PORTA_GRUPOS` dão a porta do usuário se ele está no QR, senão a do chip. A reserva
  (`garantirChipDeGrupos`) reaproveita a porta QR de antes do oficial (`portas_anteriores`) — é o
  número que já está nos grupos. O webhook acha o dono pela tabela quando a porta não é de ninguém
  em `usuarios`, e **só processa `group_participants`** (a conversa 1:1 é no oficial). Desligar o
  oficial devolve o chip como porta principal quando não há porta antiga livre. Rotas `/grupos/chip/*`.
- **Toda execução é do job.** "Enviar agora" só põe `proxima_execucao = now()` — sai em até
  1 minuto. Uma rodada por chip de cada vez (`ocupados`), grupos um a um com
  `intervalo_segundos` entre eles; chip fora do ar vira falha para o resto da rodada, com o
  motivo. Histórico em `grupos_mensagens_envios`.
- **A trava da fila é "ainda vencida", nunca igualdade com o horário lido**: o Postgres guarda
  microssegundos e o `Date` do JS milissegundos — `proxima_execucao = $2` nunca casava com um
  `now()` e a mensagem ficava parada (achado no teste).
- **Boas-vindas no grupo OU no privado** (escolha em cada boas-vindas, 30/09/2026). Até aqui
  era só no grupo — DM para quem acabou de entrar é primeiro contato por QR (a regra de 28/09);
  o dono pediu o privado **sabendo do risco de bloqueio**. Grava `enviar_para = 'dm_participante'`
  (valor que o CHECK já aceitava). Travas em `processarBoasVindasPrivado`: +1–5 min sorteados,
  1 por chip por minuto, só 08h–21h de Brasília (fora disso espera), teto de **40/dia por
  chip**; o que passar, participante `@lid` e número sem WhatsApp (422) saem **no grupo**,
  marcados em `grupos_boas_vindas_fila.erro` com `no grupo: …` (é assim que o teto não os
  conta). O `processarNovoParticipante` antigo (`automacoes-grupo.service.ts`) foi desligado:
  lia a mesma linha e, se alguém consertasse o `/send-message` dele, a pessoa receberia duas. Fila durável `grupos_boas_vindas_fila` no lugar
  do `setTimeout`; todos que entraram na janela viram **uma** mensagem marcando todos
  (`montarBoasVindas`). Vale a boas-vindas do dono da porta que viu a entrada **e** a de quem
  tem essa porta no "dividir entre" (09/10/2026, chamado #408): o chip 2 da Jéssica, dono da
  boas-vindas do Clube do Livro, caiu (401) em 08/10 às 11h07 e 13 leads ficaram sem mensagem —
  o chip da Hellen via a entrada e ignorava. Dedup: índice do pendente + `NOT EXISTS` da mesma
  pessoa na mesma boas-vindas nas últimas 24h.
- **A instância agora avisa a entrada** (`group-participants.update` → `event:
  'group_participants'` no webhook de mensagem, tratado antes de qualquer lógica de conversa).
  Antes nada avisava, e o `automacoes_grupo` antigo chamava um `/send-message` que não existe:
  a boas-vindas nunca funcionou. `/send` e `/send-media` aceitam `mencionarTodos`/`mentions`;
  `/groups` devolve `announce` e `souAdmin` (grupo só-admins sem ser admin é recusado — a tela
  trava a escolha).
- Mídia vem pelo mesmo upload da cadência e está em `SQL_PROTEGIDOS` da cota de mídia.
- **Botão com link** (migration 091, 30/09/2026): `grupos_mensagens_botao` (tabela à parte,
  do gestao_user — o serviço cria sozinho). Sai pelo `POST /send-botao` da instância:
  `interactiveMessage` + `nativeFlowMessage` `cta_url` montado à mão e mandado por
  `relayMessage` com o nó `biz` — o Baileys não tem API de botão, e **não é recurso oficial
  para número comum**: o WhatsApp pode parar de desenhá-lo sem aviso. Por isso o link vai
  também no fim do texto (`textoComLink`), e se o envio interativo lançar, a instância manda
  como texto (`botao: false`). Com anexo, o arquivo sai antes, sem legenda. Texto do botão
  até 20 caracteres (o limite da Meta para `cta_url`). Teste em `tests/grupos-botao.test.ts`.
- **Marcar pessoas com @** (migration 092, 30/09/2026): digitar `@` no texto (ou "Marcar
  pessoa") abre quem está nos grupos escolhidos — `GET /grupos/participantes` (até 20 grupos;
  na campanha, cada grupo pelo chip que o administra; nome por `nomesConhecidos`). O texto
  guarda `@Ana Souza` e `grupos_mensagens_mencoes` guarda `[{id, numero, rotulo}]`; no envio,
  `aplicarMencoes` (`grupos/mencoes.ts`, teste `tests/grupos-mencoes.test.ts`) troca, **grupo a
  grupo**, pelo `@<número>` do jid com que AQUELE grupo lista a pessoa (telefone ou `@lid`,
  casado pelo número) e manda o jid em `mentions`. Onde a pessoa não está, sobra o nome sem @.
  Não precisa de restart dos chips: `/send` e `/send-media` já aceitavam `mentions`.
  Vale também na **boas-vindas** (`grupos_boas_vindas_mencoes`, mesma migration): no grupo
  as pessoas marcadas se somam às menções de quem entrou; no privado não existe menção e
  sai só o nome. O comportamento do @ na tela é um hook só, `useMencoes`
  (`pages/grupos/MencaoPessoas.tsx`), nos dois modais — criar e editar são o mesmo caminho.
- **Levar para o CRM quem entra** (migration 093, 01/10/2026): regra **por grupo e por chip**
  (`grupos_crm_lead`, PK `usuario_id + grupo_id`, tabela do gestao_user — o serviço cria
  sozinho), configurada na aba **Criar lead** da página de Grupos (função própria, sem relação com a boas-vindas — pedido do dono em 01/10; "Meus grupos" só mostra o selo "cria lead" e filtra): funil, etapa (vazia = a de entrada),
  responsável (vazio = o dono do chip), origem (vazia = nome do grupo) e ligada/desligada.
  No `group_participants`/`add` o webhook chama `leadsDoGrupo` (`campanhas.service.ts`), que
  usa o `leadDaEntrada` da campanha: duplicata no funil só ganha anotação. Só vale a regra do
  chip que viu a entrada; `@lid` sem número não vira lead; grupo de campanha ativa que já cria
  lead fica de fora. Rotas `GET /grupos/crm` e `PUT /grupos/crm` (`{grupo_id, grupo_nome, regra}`,
  `regra: null` apaga). **Quem administra a empresa (creator/master) vê as regras de TODOS os chips**
  (09/10/2026) e liga, edita e exclui a de outro número com `dono_id` no `PUT`; criar regra nova
  continua só no próprio chip. A tela avisa quando duas regras ligadas estão no mesmo grupo. Substituiu o "quem entrar vira lead" da boas-vindas (30/09), que
  exigia boas-vindas ligada e nunca foi usado — a `grupos_boas_vindas_lead` foi apagada pela 093.
  **Rodízio** (01/10/2026): `distribuir_entre INTEGER[]` + `rodizio_pos`. O ponteiro anda num
  `UPDATE … RETURNING` atômico e só quando um card NOVO nasce (duplicata não gasta a vez —
  `leadDaEntrada` recebe `responsavelDaVez`). A roda é **exatamente quem foi marcado** (1, 2 ou
  todos), desde 06/10/2026 — antes, quem estava no oficial tinha a preferência e passava por cima
  da escolha. Só sai da roda quem foi desativado ou deixou a empresa.
  **Boas-vindas no privado sai pelo chip do RESPONSÁVEL do card** (06/10/2026,
  `remetenteDaBoasVindas`): com o rodízio, cada uma aborda os próprios leads e a resposta cai no
  WhatsApp dela. Sem card, ou responsável sem chip de QR, sai pelo dono da boas-vindas. O teto
  diário continua contado pela boas-vindas (dono), não por chip remetente. Para dividir um grupo
  entre duas pessoas: UMA regra de Criar lead (no chip que manda a boas-vindas) com rodízio entre
  as duas, e a regra do outro chip desligada — duas regras no mesmo grupo disputam a entrada.
  **Dividir o envio entre números da equipe** (07/10/2026, só no privado): a boas-vindas guarda
  `grupos_boas_vindas_distribuir (automacao_id, usuarios[], pos)` — tabela do gestao_user, porque
  `automacoes_grupo` é do postgres. Ordem em `remetenteDaBoasVindas`: o responsável do card se
  está na lista, conectado e abaixo do teto; senão o próximo da roda (`escolherDaRoda`, ponteiro
  num UPDATE atômico) entre os conectados e abaixo do teto; ninguém = o dono. Dividindo, o card
  passa para quem enviou (`transferirPropriedadeSeDiferente`, 'boas_vindas_grupo'). O teto de
  40/dia passou a contar pelo REMETENTE real: `grupos_boas_vindas_remetente (fila_id, usuario_id)`,
  com o dono como fallback para linhas antigas. Fila ainda anda 1/min por boas-vindas (por dono):
  dividir espalha o risco e o teto, não acelera. Lista vem de `GET /grupos/boas-vindas/chips`
  (sem trava de plano, ao contrário de `/grupos/chips`). Teste em `tests/boas-vindas-dividir.test.ts`.
- **UX (30/09/2026):** a prévia tirava o `_` de `{{nome_grupo}}` (virava itálico) — as variáveis saem
  do caminho antes da formatação (`previaWhatsApp`). Mensagens ganharam busca e filtro (programadas,
  repetindo, pausadas, com falha), ações com rótulo, "N falha(s) — ver" abre o histórico já nas falhas,
  e "Enviar agora" pede confirmação. Meus grupos filtra por admin/boas-vindas.

**Abrir e fechar por horário (migration 109, 14/10/2026, chamado #420).** Aba **Abrir e fechar**
(`HorariosAba.tsx`): uma regra = grupos + horário de fechar + horário de abrir, cada um em dias da
semana e hora de Brasília (`proximosHorarios`, sobre `proximaRecorrencia`; teste em
`tests/grupos-horario.test.ts`). Fechar = "só admins enviam" (`groupSettingUpdate` →
`announcement`), abrir = `not_announcement`, pelo endpoint `POST /groups/:id/settings
{fechado}` da instância (não-admin → 403 "Este número não é administrador do grupo."). Sai pelo
chip de quem criou a regra (`portaQrDo`); a tela só libera grupo em que o chip é admin. Job:
`proximoHorarioVencido` remarca a ação vencida no mesmo UPDATE (trava "ainda vencida"); se fechar
e abrir venceram juntos (servidor parado), vale o mais recente. 3 s entre grupos. "Fechar agora"/
"Abrir agora" executam na hora sem mexer nos horários. Histórico em `grupos_horario_execucoes`.
Testado em 14/10 no "Teste #1" pelo chip 3012: abriu, fechou e o job rodou a regra vencida.

**Um grupo, uma regra de Criar lead ligada (09/10/2026).** Cada chip que está no grupo recebe o
mesmo evento de entrada e roda a própria regra. No "Desafio 52 Semanas - Vida Próspera" o chip 2 da
Jéssica (→ funil 24) e o número da Débora (→ funil 74) criavam DOIS cards por pessoa, no mesmo minuto.
`salvarLevarParaCrm` agora desliga as regras dos outros números no mesmo grupo ao ligar/salvar uma
(devolve `desligadas`), e `leadsDoGrupo` só deixa criar a regra ligada mais recente (`atualizado_em`).
Para dividir entre pessoas, use o rodízio. As 10 cópias do 74 foram arquivadas (mensagens passadas
para o card do 24); backup em `api/scripts/backups/funil74_duplicados_2026-10-09.json`.

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
