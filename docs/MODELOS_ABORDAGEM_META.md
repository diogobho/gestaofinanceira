# Modelos de abordagem no WhatsApp oficial

Fora da janela de 24h a Meta **só entrega modelo aprovado**. Isso não é uma
formalidade do canal: é a única forma de falar primeiro com alguém, e é o que o
plano Enterprise vende. Sem nenhum modelo aprovado, um número oficial recém-conectado
responde quem escreve e não consegue iniciar nada.

## Três fatos que decidem o planejamento

1. **Modelo não atravessa conta.** Cada WABA aprova os seus; o nome só existe dentro
   dela. Os modelos da DuoFuturo não valem na conta do cliente — cada cliente cria os
   dele, em `WhatsApp → aba Modelos → Criar modelo` (ou `POST /whatsapp/canal/modelos`),
   depois de conectar o número.
2. **Aprovação leva de minutos a 24h.** MARKETING é o que mais demora e o que mais
   é recusado. Criar no mesmo dia em que se pretende disparar é apostar.
3. **Número novo começa no degrau de 250 conversas iniciadas por 24h.** O degrau sobe
   sozinho (1.000 → 10.000) com volume e qualidade boa, e **desce** se as pessoas
   bloquearem ou denunciarem. Um disparo de 3 mil na estreia não sai — e o que sai
   derruba a qualidade do número.

> Resposta a quem já escreveu **não** consome nada disso: dentro da janela de 24h é
> texto livre, sem modelo e sem degrau.

## O que a Meta recusa (visto nas recusas reais)

- **UTILITY usado para vender.** UTILITY é sobre algo que já existe entre as partes
  (pedido, agendamento, cobrança). Abordagem a desconhecido é **MARKETING**, sempre;
  tentar passar como UTILITY é a recusa mais comum.
- **Corpo que é só variável** (`{{1}}, tudo bem?`). Precisa de texto fixo que explique
  o assunto.
- Nome com maiúscula, acento ou espaço — só `a-z`, `0-9` e `_`.
- `{{n}}` sem exemplo. A tela barra antes de chamar a Meta e diz qual falta.

## Modelos prontos

> Os seis abaixo estão **na tela**, como "Começar de um modelo pronto" no Criar modelo
> (`frontend/src/pages/whatsapp/oficial/modelosProntos.ts`, que passou a ser a fonte —
> mudou um texto, mude lá). `tests/modelos-meta.test.ts` passa cada um pelo
> `problemaNoTemplate`.

Categoria **MARKETING**, idioma `pt_BR`. O que faz o texto ser aprovado *e* funcionar é
o mesmo: **dizer de onde a pessoa veio na primeira linha.** Abordagem que não se explica
vira bloqueio, e bloqueio derruba o degrau do número.

### 1 · `retomada_formulario`
Para quem preencheu formulário e não foi atendido.

```
Oi {{1}}, aqui é {{2}} da {{3}}.
Você preencheu o formulário do {{4}} e ficou de receber um retorno nosso — desculpe a demora.
Ainda faz sentido conversar sobre isso? Se preferir, respondo por aqui mesmo.
Se não quiser mais receber mensagens, é só responder SAIR.
```
Exemplos: `Marina` · `Débora` · `Escola de Empreendedorismo` · `Desafio 52 Semanas`

### 2 · `convite_conversa`
Primeiro toque, sem promessa e sem preço.

```
Oi {{1}}, aqui é {{2}} da {{3}}.
Vi que você entrou no {{4}}. Separei 15 minutos esta semana para entender seu momento e te dizer, com honestidade, se a gente consegue ajudar.
Quer que eu te mande dois horários?
Para não receber mais mensagens, responda SAIR.
```
Exemplos: `Marina` · `Débora` · `Escola de Empreendedorismo` · `grupo do Desafio`

### 3 · `retomada_conversa_parada`
Reativação de quem já falou com você e sumiu — a de maior taxa de resposta.

```
Oi {{1}}, tudo bem? Aqui é {{2}}.
Nossa conversa sobre {{3}} ficou parada e eu não quis deixar passar.
Você quer retomar agora ou prefere que eu procure mais para frente?
Se preferir não receber mais mensagens, responda SAIR.
```
Exemplos: `Marina` · `Débora` · `a mentoria`

### 4 · `material_prometido`
Quando existe algo concreto para entregar. Aprova rápido e não parece venda.

```
Oi {{1}}, aqui é {{2}} da {{3}}.
Como combinado, aqui está o {{4}}.
Qualquer dúvida, é só responder nesta conversa.
```
Exemplos: `Marina` · `Débora` · `Escola de Empreendedorismo` · `guia do Caixa Rápido`

### 5 · `lembrete_reuniao` — categoria **UTILITY**
Esta é legitimamente UTILITY: existe um compromisso marcado.

```
Oi {{1}}, passando para lembrar da nossa conversa de {{2}}, às {{3}}.
Se precisar remarcar, responda por aqui que eu ajusto.
```
Exemplos: `Marina` · `amanhã` · `14h`

### 6 · `retorno_atendimento` — categoria **UTILITY**
Reabre atendimento passadas as 24h. **É o que falta hoje no número oficial da
DuoFuturo** — os modelos aprovados são de boas-vindas (MARKETING), e com eles não dá
para retomar um chamado sem parecer propaganda.

```
Oi {{1}}, aqui é o suporte da {{2}}.
Voltando ao seu chamado sobre {{3}}: {{4}}
Se ainda estiver aberto, é só responder por aqui.
```
Exemplos: `Marina` · `DuoFuturo` · `o relatório em PDF` · `a correção já está no ar`

## Como usar na cadência

O passo da cadência tem **modelo de reserva** (`followup_config.passos[i].modelo_whatsapp`):
com a janela fechada, ele sai no lugar do texto livre. Sem modelo de reserva o toque
**falha na hora, com o motivo escrito** — de propósito, em vez de ser marcado como
enviado e a recusa (131047) chegar depois pelo webhook, quando ninguém mais está olhando.

Ou seja: **todo passo que pode pegar lead frio precisa de um modelo escolhido.** Os
passos que só rodam depois de o lead responder não precisam — ali a janela está aberta.

## Ordem para o primeiro cliente

1. Conectar o número (Embedded Signup) — exige a Fase 0 no `.env`.
2. Criar os modelos **no mesmo dia**, antes de qualquer disparo.
3. Esperar `APPROVED` (a tela mostra o status; `PENDING` não envia).
4. Escolher o modelo de reserva nos passos frios da cadência.
5. Começar pequeno: o degrau é de 250/24h, e os primeiros envios é que definem a
   qualidade com que o número vai viver.
