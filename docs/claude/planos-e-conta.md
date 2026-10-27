# Planos, capacidades, onboarding, trial/bloqueio, e-mail institucional, senha, suporte

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

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
- **Comprador da Hotmart não é contato frio** (01/10/2026, #231): `leadEhComprador`
  (`origem = 'Hotmart'`, `_shared/conversa.ts`) tira o lead das duas checagens em `despachar`.
  Sem isso a boas-vindas de todo aluno novo falhava enquanto ninguém da equipe estava no
  oficial. Carrinho abandonado (`'Abandono carrinho'`) continua sendo primeiro contato.
- A tela mostrava "dias sem interseção" para toda falha `conflito_config`;
  `descreverErroFollowup(categoria, erro)` agora usa o erro gravado nos casos de primeiro
  contato e de modelo de reserva.
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
**O chamado é da empresa** (09/10/2026, pedido do dono): qualquer pessoa da empresa vê,
responde e anexa no chamado aberto por um colega (`escopo()` do controller devolve só a
empresa). Na tela, o filtro "Todos da empresa / Abertos por mim / <colega>" é feito no
navegador, e cada linha mostra quem abriu. De 05 a 09/10 cada um via só os próprios.

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

### Aba "Atualizações" (02/10/2026)

`/gestao/suporte?aba=atualizacoes` mostra o que mudou no sistema, para o cliente. A
lista é fixa em `frontend/src/pages/suporte/atualizacoes.ts` — sem tabela, sem tela de
cadastro: novidade nova entra no TOPO do array junto com o deploy dela, e o build do
frontend publica. Texto para o cliente (o que ganha e onde clica), com `plano` quando
não é de todos; correção interna e coisa de uma conta só (ex.: fluxo da Panteras) não
entram. A aba mostra um contador com as novidades dos últimos 7 dias.

## Parcelamento no cartão (migration 099, 05/10/2026)

Pedido do dono: o ciclo semestral/anual pode ser parcelado no cartão, com juros.
- O Asaas não parcela subscription: com `parcelas > 1` o `assinar` cria um **parcelamento**
  (`POST /payments` com `installmentCount`/`installmentValue`), grava `asaas_installment_id`
  e `parcelas`, zera `asaas_subscription_id` e libera `plano_ativo_ate` pelo ciclo inteiro.
- Até uma parcela por mês do ciclo (6x semestral, 12x anual); só `CREDIT_CARD`. Juros pela
  tabela Price em `calcularParcelamento` (1x sem juros); taxa em `PARCELAMENTO_JUROS_AM`
  (`.env`, padrão 1,99) — a tela recebe por `GET /planos` (`parcelamento.juros_ao_mes`).
- **Não renova sozinho.** `suspenderParceladosVencidos` (job de hora em hora, junto do de
  trial) suspende quando `plano_ativo_ate` passa; a pessoa contrata de novo em /planos.
- Webhook: pagamento com `installment` e sem `subscription` acha a assinatura pelo
  parcelamento e **não soma meses** por parcela (só reativa); OVERDUE suspende,
  REFUNDED/CHARGEBACK cancela.
- Só na tela /planos; o cadastro de conta nova continua sem parcelar.
