# Provedor de Tecnologia (Tech Provider) — WhatsApp Business Platform

Situação em **09/09/2026**. App `DuoFuturo API` (`1927360974611513`),
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
| 5 | **Acesso avançado** a `whatsapp_business_messaging` e `whatsapp_business_management` via Análise do App | ⏳ **enviado em 10/09/2026** (junto com `public_profile`), em análise — prazo da Meta: até 20 dias |
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

`DuoFuturo API` e depois `DuoFuturo` — os dois recusados (o segundo em
09/09/2026). O número envia normalmente (GREEN, `VERIFIED`); o que falta é o nome
verificado, que é o que quem recebe vê e o que aparece no vídeo do App Review.

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

## Depois da aprovação

Onboarding de cliente é por **Embedded Signup** (`ES`), não por token colado à
mão: o cliente autoriza pelo Facebook e a WABA dele passa a ser acessível com o
nosso `whatsapp_business_management` em acesso avançado. Nada disso existe no
código hoje — o painel atual fala só com a WABA da DuoFuturo.
