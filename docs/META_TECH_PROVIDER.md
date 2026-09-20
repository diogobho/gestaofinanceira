# Provedor de Tecnologia (Tech Provider) — WhatsApp Business Platform

Situação em **19/09/2026**. App `DuoFuturo API` (`1927360974611513`),
portfólio `DuoFuturo` (`2552041805258637`), WABA `1040471308694652`,
número +55 11 94052-4435 (`phone_number_id` 1253283981208800).

> **Confira sempre pela Graph API, nunca pelo painel.** O painel esconde campo
> vazio e usa a mesma frase de erro para "ID inexistente" e "sem permissão".

## Checklist oficial × estado real

| # | Exigência da Meta | Estado |
|---|---|---|
| 1 | Portfólio de negócios verificado | ✅ `verification_status: verified` |
| 2 | App com o caso de uso WhatsApp + WABA aprovada | ✅ `account_review_status: APPROVED`, `can_send_message: AVAILABLE` nos três níveis (WABA, negócio, app) |
| 3 | Ícone, **categoria** e **política de privacidade** no app | ✅ categoria `Negócios`; `duofuturo.tech/privacidade` e `/termos` preenchidos e citando WhatsApp (09/09/2026) |
| 4 | App inscrito nos webhooks da WABA | ✅ inscrito em 09/09/2026 (estava **vazio**) |
| 5 | **Acesso avançado** a `whatsapp_business_messaging` e `whatsapp_business_management` via Análise do App | ✅ **aprovado** — informado pelo dono em 19/09/2026, a partir da tela de Análise do App. Não é consultável por API; o registro da submissão está em `relatorios/DuoFuturo_Meta_App_Review_Submitted_On_2026-09-10.pdf`, que é a **cópia do que foi enviado** e não traz campo de status |
| 6 | **Dois vídeos** na submissão | ✅ gravados e anexados em 10/09/2026 |

Um comando confere tudo isso de uma vez:

```bash
node api/scripts/validar_meta_tech_provider.js
```

Ele sai com código 1 se algo reprovar. **Acesso avançado não é consultável por
API** — esse item se confere na tela de Análise do App.

Comandos avulsos (token do System User em `api/.env`):

```bash
TOKEN=$(grep '^META_WA_TOKEN=' api/.env | cut -d= -f2-)
curl -s "https://graph.facebook.com/v21.0/1927360974611513?fields=name,category,privacy_policy_url,terms_of_service_url&access_token=$TOKEN"
curl -s "https://graph.facebook.com/v21.0/2552041805258637?fields=name,verification_status&access_token=$TOKEN"
curl -s "https://graph.facebook.com/v21.0/1040471308694652?fields=account_review_status,business_verification_status,health_status&access_token=$TOKEN"
curl -s "https://graph.facebook.com/v21.0/1040471308694652/subscribed_apps?access_token=$TOKEN"
```

## O nome aprovado não entrou em vigor: o número perdeu a verificação (19/09/2026)

Estado do número hoje, por API:

| Campo | Valor |
|---|---|
| `verified_name` | `DuoFuturo API` — o nome que quem recebe **vê hoje** |
| `name_status` | `DECLINED` |
| `new_display_name` | `DuoFuturo` |
| **`new_name_status`** | **`APPROVED`** — a terceira tentativa passou |
| **`code_verification_status`** | **`EXPIRED`** — era `VERIFIED` em 09/09 |
| `status` / `quality_rating` / `account_mode` | `CONNECTED` · `GREEN` · `LIVE` |

**O nome `DuoFuturo` foi aprovado e ainda assim não é o nome exibido.** Ler só
`name_status` diz "recusado" e esconde isso — o par que conta é
`new_display_name` + `new_name_status`, como já valia para o pedido em análise.

O que separa o nome aprovado do nome em vigor é a **verificação do número**, que
expirou. Enquanto `code_verification_status` for `EXPIRED`, o número continua
enviando e recebendo normalmente (é o canal do funil Suporte, 886 mensagens
recebidas nos 7 dias até 19/09), mas a troca de nome não entra.

Reverificar é `POST /{phone_number_id}/request_code` (`code_method=SMS` ou
`VOICE`, `language=pt_BR`) seguido de `POST /{phone_number_id}/verify_code`. **O
código vai para o próprio +55 11 94052-4435**, que vive na Meta e não num
celular — pedir o código sem ter onde recebê-lo só gasta uma das tentativas.
Confirme antes por onde o código chega.

> **Não confunda com o `verification_status` do portfólio.** Este aqui é do
> NÚMERO, e o validador o imprime como "verificação: EXPIRED".

## O revisor abre as páginas legais

Até 09/09/2026 `duofuturo.tech/privacidade` e `/termos` traziam `[RAZÃO SOCIAL]`,
`[CNPJ]`, `[ENDEREÇO]`, `[COMARCA/UF]` e `[E-MAIL DO ENCARREGADO]` dentro de
`<mark>`, **realçados em amarelo**. Uma política que se identifica como modelo não
preenchido é reprovação silenciosa, e nenhum erro da Graph API avisa disso — por
isso o validador abre as duas páginas e procura pelo gabarito.

Entidade legal: **FUTURON INTELIGÊNCIA DE NEGÓCIO LTDA**, CNPJ 53.441.843/0001-90,
Estrada Philuvio Cerqueira Rodrigues, 2200 — Itaipava, Petrópolis/RJ. Confirmado na
Receita Federal (`brasilapi.com.br/api/cnpj/v1/53441843000190`) e no cadastro
comercial do Asaas; situação **ATIVA**. Não é "Futuron Tecnologia LTDA".

Duas seções foram escritas para o revisor:

- Privacidade **6 · WhatsApp e Meta Platforms** — o que vai para a Meta, o que
  volta, papéis controlador/operadora/suboperadora, que o conteúdo não vira
  publicidade nem treino de modelo, retenção e transferência internacional.
- Termos **6 · Uso do WhatsApp Business Platform** — vincula o assinante à
  Política de Mensagens Comerciais, exige opt-in demonstrável e opt-out imediato.

O DPO está publicado como `suporte@duofuturo.tech`, sem nome de pessoa. Se a
Futuron nomear um encarregado, é uma linha em cada arquivo.

## O nome de exibição foi recusado duas vezes

> **Desfecho (19/09/2026): a terceira tentativa foi aprovada** —
> `new_name_status: APPROVED` para `DuoFuturo`. O nome ainda não está em vigor
> porque a verificação do número expirou; ver a seção acima. O histórico abaixo
> fica porque é ele que explica o que a Meta cobra numa análise de nome.

`DuoFuturo API` e depois `DuoFuturo` — os dois recusados (o segundo em
09/09/2026). O número envia normalmente (GREEN, `VERIFIED` até 09/09); o que
falta é o nome verificado, que é o que quem recebe vê e o que aparece no vídeo do
App Review.

A diretriz é a mesma dos dois casos: **o nome tem que bater com a marca exibida no
site e com a razão social verificada no portfólio**. A nossa é
`FUTURON INTELIGÊNCIA DE NEGÓCIO LTDA` e a marca é `DuoFuturo` — quem olhava
`duofuturo.tech` não tinha como ligar uma coisa na outra: o rodapé dizia "uma
empresa" seguido do **logo** da Futuron, em imagem. Texto nenhum.

Corrigido em 09/09/2026 nas oito páginas da landing:

```
© 2026 DuoFuturo — FUTURON INTELIGÊNCIA DE NEGÓCIO LTDA · CNPJ 53.441.843/0001-90
```

Marca e razão social lado a lado, em texto — é o caminho de recurso que a própria
Meta indica. Depois disso, reenviar **o mesmo nome** `DuoFuturo`.

- Só dá para enviar um nome por vez: enquanto `new_name_status` for
  `PENDING_REVIEW`, o formulário não aceita outro. O e-mail de recusa chega antes
  de a Graph API mudar o campo — confira por API, não pelo e-mail.
- **Limite de 4 trocas a cada 30 dias.** Duas já foram.
- O portfólio **não tem Página do Facebook vinculada** (`primary_page` ausente).
  Presença online é o que a análise de nome consulta; uma Página chamada
  DuoFuturo é o reforço mais barato se a terceira tentativa também voltar.
- Conferir em Gerenciador de Negócios → Informações da empresa que a razão social
  registrada é exatamente a que está no rodapé. Se divergir, o rodapé é que muda.

Estado por API:

```bash
curl -s "https://graph.facebook.com/v21.0/{phone_number_id}?fields=verified_name,name_status,new_display_name,new_name_status&access_token=$TOKEN"
```

`verified_name` é o nome **aprovado** e não muda enquanto há troca em análise —
ler só `name_status` faz um pedido enviado parecer esquecido.

## A Cloud API aceita e devolve `wamid` para mensagem que não será entregue

Teste real em 09/09/2026 para `5511900000000` (número inexistente): o `POST
/{phone_number_id}/messages` respondeu **200 com um `wamid`**, e só depois o
webhook trouxe `status: failed — 131026 Message undeliverable`. É o mesmo engano
do `success: true` do Baileys: **id de mensagem não é entrega**.

Isso vale para o vídeo (a Meta exige ver a mensagem chegando no aparelho, e é por
isso) e provou de quebra que a inscrição em `subscribed_apps` funciona — o status
apareceu no log da API em segundos.

> **Texto livre só sai dentro da janela de 24h.** Para um número que nunca falou
> com o +55 11 94052-4435, a mensagem de texto é aceita e depois cai como
> `131047`. Antes de gravar o vídeo 1, mande **do celular para o nosso número** —
> isso abre a janela e ainda mostra o webhook funcionando na gravação.

## Os dois vídeos

Gravados em `/gestao/whatsapp/meta` (`MetaCloudApi.tsx`), logado como
`super_admin`. Tela cheia, sem cortes, sem edição — o revisor precisa ver a ação
inteira acontecendo dentro do nosso app.

**Vídeo 1 — enviar mensagem (`whatsapp_business_messaging`)**
1. Abrir `https://duofuturo.tech/gestao/whatsapp/meta` com o card de status
   mostrando **Conectado** e o número +55 11 94052-4435.
2. Preencher *Número de destino* e *Mensagem*, com um celular ao lado na tela.
3. Enviar; mostrar a confirmação com o `message_id` na tela.
4. Virar para o WhatsApp do destinatário e mostrar **a mesma mensagem chegando**.

**Vídeo 2 — criar modelo (`whatsapp_business_management`)**
1. Mesma tela, bloco **Criar modelo**.
2. Preencher Nome, Categoria, Idioma e Corpo com `{{1}}` e o campo de exemplo
   que a tela gera para a variável.
3. Criar; mostrar o modelo aparecendo na lista com o status devolvido pela Meta.

Nome de modelo é único por WABA: se repetir, a Meta recusa. Use um nome novo na
gravação (a WABA já tem `hello_world` e `3p_direct_integration_test_template`).

## A conta do analista (10/09/2026)

O analista precisa entrar no app, e a tela era só do `super_admin` — que enxerga
**todas** as empresas do banco. Entregar esse login a quem é de fora exporia dado
de cliente. Então:

- empresa própria e vazia, `DuoFuturo — Meta App Review (Demo)`, com usuário
  `revisor.meta@duofuturo.tech` (creator) e Enterprise ativo **até 31/12/2027** —
  a Meta exige credencial de teste válida por **um ano** depois do envio, e conta
  esquecida vence sozinha. Criada por
  `api/scripts/criar_revisor_meta_20260910.js --aplicar`; senha no `CREDENCIAIS.md`;
- o painel abre para o id dele por `META_PAINEL_REVISORES` no `api/.env`
  (`whatsapp/meta/acesso.ts`), lido a cada requisição. **Não tire o id depois da
  aprovação**: a Meta volta a analisar o app periodicamente com a mesma credencial,
  e acesso quebrado ali é restrição do app. Se a senha vazar, troque a senha — o
  painel envia pelo nosso número oficial.

Não é a demo 31: a assinatura dela foi cancelada pelo administrador em 09/09/2026.

> **O analista não é brasileiro.** Número com `+` na frente segue como veio;
> sem `+`, 10–11 dígitos ganham `55`. Um `+1` americano tem os mesmos 11 dígitos de
> um celular com DDD — antes de 10/09 ele virava `5515551234567`.

A URL de exclusão de dados do app é `duofuturo.tech/exclusao-de-dados`
(`landing/exclusao-de-dados.html`, com resumo em inglês). Estava `facebook.com`.

## Depois da aprovação (aprovado em 19/09/2026)

O que a aprovação destrava é agir na WABA **de cada cliente** que nos autorizar
pelo Embedded Signup. Nada disso existe no código: o painel de hoje fala só com a
WABA da DuoFuturo, e a `whatsapp_cloud_contas` (migration 074) guarda **uma linha
só**, a nossa.

A **Fase 0** do plano não dependia da aprovação e continua pendente:

- `.env` sem `META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID` e `META_TOKEN_KEY`;
- **o webhook aceita POST sem assinatura.** O código já valida
  (`assinaturaValida` em `meta-whatsapp.controller.ts`), mas sem `META_APP_SECRET`
  ele libera e avisa uma vez no log — e o webhook hoje grava conversa de verdade
  no CRM do Suporte. Um POST forjado viraria mensagem no card de um cliente.
  Preencher o secret é o item mais barato e o de maior efeito da lista;
- configuração do Embedded Signup no painel do app (tipo WhatsApp ES, token sem
  expiração) e `duofuturo.tech` nos domínios do SDK;
- webhook do app assinando `message_template_status_update`, `account_update` e
  `phone_number_quality_update` além de `messages`.


## Adaptar a conta Enterprise ao canal oficial — plano revisado (20/09/2026)

Revisado depois que os planos passaram a ter **capacidades** (migration 081) e
conferido contra a documentação da Meta em 20/09/2026. Duas coisas mudaram desde
o plano de 10/09, e as duas têm prazo.

### O que a documentação diz hoje

| Ponto | Estado |
|---|---|
| **Embedded Signup v2 é descontinuado** | **08–15/10/2026** (a Meta publica as duas datas em páginas diferentes). Integração nova nasce em **v4** — não há motivo para escrever a v2 agora |
| Versão da Graph API para o ES | **v25.0** — que é a que `meta-whatsapp.service.ts` já usa |
| Configuração de login | Modelo *"WhatsApp Embedded Signup Configuration With 60 Expiration Token"*, em **Login do Facebook para Empresas → Configurações** |
| Código do `FB.login` | vive **30 segundos**. A troca por token acontece na mesma requisição, no servidor |
| Chamadas do onboarding | **servidor a servidor, nunca do navegador** — é literal na documentação |
| Teto de clientes novos | **10 a cada 7 dias**; sobe para **200** com Verificação do Negócio + Análise do App + Verificação de Acesso |
| Forma de pagamento | do **cliente**, na conta dele. Sem ela, conversa iniciada pela empresa é recusada |

> **Estamos a uma verificação do teto de 200.** Verificação do Negócio ✅ e Análise
> do App ✅ já passaram; a **Verificação de Acesso** é a que falta conferir no painel.
> Com 10 por 7 dias dá para começar — mas é um teto que se descobre tarde, no dia
> em que a décima primeira conta não conecta.

### Os quatro passos do onboarding, na ordem da Meta

Tudo depois que a janela do Embedded Signup devolve `code`, `waba_id` e
`phone_number_id`:

```
1. GET  /oauth/access_token          → troca o code pelo token do CLIENTE (app id + app secret)
2. POST /{waba_id}/subscribed_apps   → sem isto NENHUMA mensagem chega
3. POST /{phone_number_id}/register  → ativa o número na Cloud API, com um PIN de 6 dígitos
4. (o cliente) cadastra a forma de pagamento no WhatsApp Manager
```

O passo 2 é o mesmo que faltava na **nossa própria** WABA até 09/09/2026 e que
deixou o webhook mudo. Ele não avisa: a conexão parece pronta e nada chega.

### Como isso encaixa no que existe hoje

O sistema já está mais perto do que o plano de 10/09 supunha:

- `whatsapp/canal/instancia.ts` faz a **Cloud API falar o mesmo contrato HTTP do
  Baileys** (`/send`, `/send-media`, `/status`). Cadência, disparo, agente e chat
  não sabem em que canal estão — e não precisam saber;
- `whatsapp_cloud_contas` (074) já guarda número oficial **por empresa**, com
  porta virtual, token cifrado e troca de empresa;
- `WhatsAppConfig.tsx` já troca de painel sozinho conforme o canal;
- e agora **`whatsapp_oficial` é uma capacidade do plano Enterprise**, então a
  pergunta "esta empresa tem direito ao canal oficial?" tem uma resposta só.

O que falta para o cliente se conectar sozinho é a **janela** e a **troca de
código** — o resto do caminho já existe.

### Ordem revisada

> **A Fase 1 foi escrita em 20/09/2026** (migration 084 + Embedded Signup + escolha
> de canal na tela). Ela está no código e passa nos testes, mas **não funciona até a
> Fase 0 existir**: sem `META_APP_ID`, `META_APP_SECRET` e `META_ES_CONFIG_ID` a
> janela não abre, e a tela cai no caminho por chamado de propósito. Detalhes da
> implementação: seção "O canal do cliente Enterprise é o oficial" do CLAUDE.md.
> Conferência: `node api/scripts/verificar_canal_oficial.js`.

| Fase | O que | Depende de |
|---|---|---|
| **0 · agora** | `META_APP_SECRET` no `.env` (o webhook aceita POST sem assinatura hoje, e ele grava conversa no CRM do Suporte); `META_APP_ID`, `META_ES_CONFIG_ID`, `META_TOKEN_KEY`; criar a configuração de login **v4**; `duofuturo.tech` nos domínios do SDK; webhook assinando `message_template_status_update`, `account_update` e `phone_number_quality_update`; conferir a Verificação de Acesso | painel da Meta — **é você, não o código** |
| **1 · ✅ feita** | conta por número com dono (084), os 3 passos servidor a servidor em `embedded-signup.service.ts`, `POST /whatsapp/canal/oficial/conectar`, botão no card do operador e escolha de canal na provisão | Fase 0 para FUNCIONAR |
| **2** | Modelos na WABA do cliente; cadência e disparo escolhendo modelo fora da janela de 24h | Fase 1 |
| **3** | Alertas de qualidade/limite/pagamento; migrar operador do QR sem perder histórico; coexistência | Fase 2 |

**Enquanto a Fase 0 não existir, quem conecta a WABA do cliente é a DuoFuturo**, à
mão, pelo painel. A faixa `ConvitePlanoOficial` decide sozinha qual dos dois caminhos
mostrar, perguntando à API se o Embedded Signup está configurado: um botão que
promete autoatendimento e entrega um erro é pior do que um caminho honesto e manual.

### A tabela da Fase 1 é a 074 alargada, não uma nova — foi o que a 084 fez

O plano de 10/09 previa uma `whatsapp_cloud_conexoes` ao lado. Lendo o esquema de
perto, isso criaria **duas fontes para a mesma pergunta** ("esta porta é Cloud?") —
`whatsapp_cloud_contas` já é, na prática, uma tabela POR NÚMERO:

- `porta_virtual` é UNIQUE e é a identidade do número; `instancia(porta)` resolve por
  ela e não sabe de empresa;
- `phone_number_id` é UNIQUE;
- `token_enc` já é por linha — `credenciaisDa()` usa o token do cliente quando existe
  e cai no System User da DuoFuturo quando é nulo;
- **a entrada já é por número**: o webhook acha a conta por `phone_number_id` e o dono
  por `porta_virtual` (`donoDaPorta`). Esse caminho já é multiempresa.

O que trava é uma constraint e uma coluna:

```sql
ALTER TABLE whatsapp_cloud_contas DROP CONSTRAINT whatsapp_cloud_contas_empresa_id_key;
ALTER TABLE whatsapp_cloud_contas ADD COLUMN usuario_id int REFERENCES usuarios(id);
-- + business_id, pin_enc, coexistencia, qualidade, pagamento_ok
```

`usuario_id IS NULL` continua significando "número da empresa inteira", que é o caso
da empresa 1 hoje — ela não precisa ser tocada.

**Os 6 chamadores de `contaAtivaDaEmpresa` são o trabalho real**, não a tabela:
`despacho.ts`, `canal.controller.ts` (3×), `contatos.service.ts`, `agente-ia.service.ts`,
mais `portaParaUsuarioNovo` em `usuarios.service.ts` e `whatsapp-provision.service.ts`.
Todos perguntam "qual o número DESTA EMPRESA?" e passam a perguntar "qual o número
DESTE USUÁRIO?" — com a conta da empresa como reserva, senão a empresa 1 perde o canal.


Plano completo (decisões, fluxo, arquitetura e fases, 10/09/2026):
https://claude.ai/code/artifact/dacf7e23-c2e7-48de-a9e8-36fed84cd684

Onboarding de cliente é por **Embedded Signup** (`ES`), não por token colado à
mão: o cliente autoriza pelo Facebook e a WABA dele passa a ser acessível com o
nosso `whatsapp_business_management` em acesso avançado. Nada disso existe no
código hoje — o painel atual fala só com a WABA da DuoFuturo.
