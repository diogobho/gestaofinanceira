# Incidente — Chip 2 da Jéssica: envio "com sucesso" que não era entregue

**Período:** 06/08/2026 a 12/08/2026 · **Resolvido em:** 12/08/2026
**Afetado:** usuário 46 (`Jéssica Machado - chip 2`, número 5511993909558, empresa 5)

---

## Sintoma

A mensagem saía pelo CRM sem erro nenhum — o card mostrava enviada, o histórico
gravava a linha, o `POST /send` devolvia `success: true` com `messageId` — e o
destinatário não recebia. No WhatsApp Web da Jéssica também não aparecia.

## Causa raiz

O servidor da Meta recusava cada mensagem com **ack de erro `463` =
`SenderReachoutTimelocked`**: uma trava temporal aplicada à *conta* que abre muita
conversa nova. O chip 2 vinha iniciando **25 a 49 conversas novas por dia**.

Capturado prendendo o logger do Baileys em runtime (ele é `silentLogger` e descarta
tudo):

```
WARN "received error in ack"
  { from: <destinatário>, class: "message", id: <msgId>, error: "463" }
```

Não era ban, não era sessão corrompida e não era formato de telefone — o envio
percorria o caminho inteiro (resolvia devices, injetava sessão, relayava) e só
então o servidor recusava. Detalhe importante: a trava vale para o **dispositivo
vinculado** (a API), não para o aparelho — por isso o celular da Jéssica enviava
normalmente e parecia que "o WhatsApp dela estava bom".

## Por que o CRM não percebeu

Três mentiras piedosas empilhadas:

1. `sock.sendMessage()` do Baileys resolve quando a mensagem é cifrada e entregue
   ao socket. **O `messageId` é gerado localmente.** Um 200 do `/send` não prova
   entrega nenhuma.
2. `resolveCanonicalJid()` tem `catch → { existe: true }`, então `/check-number`
   responder rápido não prova ida-e-volta com o servidor.
3. `/status` reporta `connected` sempre que o socket está aberto — inclusive
   meio-aberto.

E o sinal de recusa **chegava**, só era jogado no lixo: a instância escuta
`messages.upsert` e nunca `messages.update`. Medido em 11/08, comparando o mesmo
envio por dois chips:

| | chip 2 (não entregava) | chip da Gabriela (entregava) |
|---|---|---|
| `status` no upsert da própria mensagem | **0 = ERROR** | 1 = PENDING |
| eventos `messages.update` | **nenhum em 25 s** | 4 em ~560 ms (2 SERVER_ACK, 3 DELIVERY_ACK) |

`proto.WebMessageInfo.Status`: ERROR 0, PENDING 1, SERVER_ACK 2, DELIVERY_ACK 3,
READ 4, PLAYED 5.

## Resolução

**A trava expirou sozinha.** Nada foi alterado no código. Reteste em 12/08 às
10:48–10:49 BRT pela porta 3015, validado **do lado receptor** (a instância 3019 é
o número 5524988344048, então a entrega é comprovável sem depender de celular):

| Origem | Formato do destino | Chegou? |
|---|---|---|
| chip 2 (porta 3015) | `5524988344048` | **sim** (10:48:54) |
| chip 2 (porta 3015) | `5524988344048@c.us` — igual ao CRM | **sim** (10:49:55) |
| chip 1 (porta 3017) — controle | `@c.us` | **sim** (10:49:57) |

Gravadas como `entrada` de 5511993909558 em `historico_mensagens` (197491/197494).
No mesmo dia: 34 envios, **0** com `erro`, e 3 contatos responderam minutos após
receber.

Histórico de erro do usuário 46 que confirma a leitura:

| Dia | `erro` preenchido | Natureza |
|---|---|---|
| 06/08 | 45 | "WhatsApp não conectado" — logout 401 da porta 3016 |
| 10/08 | 2 | "não tem conta no WhatsApp" (erro legítimo de número) |
| 11/08 | 3 | idem |
| 12/08 | **0** | — |

Em paralelo o chip migrou de porta: **3016** (device `:65`, quatro logouts 401
entre 30/07 e 11/08 — ver `whatsapp_conexao_eventos`) → **3015** (device `:67`).
A 3016 está `stopped` no PM2 com a sessão zerada (backup em
`.baileys_auth/_backup_3016_20260811_145958`).

## Como diagnosticar isso de novo

- **Sempre validar do lado receptor.** Enviar para um número que também seja uma
  instância nossa e conferir se ela gravou a `entrada`. `success: true`,
  `messageId`, `/status` e `/check-number` não valem como prova.
- **Fazer teste de controle** pelo mesmo caminho, mesmo destino, por outro chip
  saudável. Sem o controle não se separa "chip ruim" de "destino ruim".
- **Não testar envio para si mesmo pela API:** `apiSentMessageIds.has(msgId) →
  continue` (`api-multi-baileys.js`) suprime de propósito o `fromMe` da API.
- **Não testar nos primeiros minutos após pareamento/reconexão** — a sincronização
  confunde o resultado.
- Ao usar o inspector do Node: `SIGUSR1` abre sempre na 9229 e `inspector.close()`
  **não** libera a porta. Sem reiniciar o processo, a tentativa seguinte falha com
  *address already in use* e você lê o processo errado achando que é o outro.

## Pendências que este incidente deixou

1. **Escutar `messages.update` e marcar `entregue_at`.** Hoje `entregue_at` e
   `lido_at` **nunca** são preenchidos, então o CRM não distingue entregue de
   recusado. Os dois sinais utilizáveis chegam em segundos: nascer com `status: 0`
   e não receber SERVER_ACK. Sem isso, o follow-up automático continua queimando
   passo em silêncio quando a Meta recusa.
2. **Limitar abertura de conversa nova por chip.** A trava é reação a volume; se o
   ritmo de 25–49 novos/dia voltar, a trava volta.
3. **Versão do Baileys.** A instalada (7.0.0-rc.9) não tem como consultar a trava.
   O rc14 expõe `fetchAccountReachoutTimelock()` → `{ isActive,
   timeEnforcementEnds, enforcementType }` e o enum
   `NewChatMessageCappingStatusType` (NONE/FIRST_WARNING/SECOND_WARNING/CAPPED) —
   é por aí que se descobre **até quando** a trava dura, perguntando ao WhatsApp.

Referências: WhiskeySockets/Baileys #2441, #2698, #2636.
