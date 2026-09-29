# Suporte — roteiro para responder chamados

Como atender os tickets de `/gestao/suporte` usando o chat do Claude Code, e o que já
aprendemos atendendo. **Não há IA no módulo de suporte** (removida em 31/08/2026):
quem responde é gente, e o roteiro é este arquivo.

Conta de atendimento: `master@gestao.com` (`nivel = super_admin`, vê todas as empresas).
Cliente só enxerga a própria empresa — o filtro por `empresa_id` no `getById` é o que
impede ler chamado alheio pelo id.

---

## A regra que vale mais que todas

**Não chute causa.** Quase todo problema deste CRM tem causa verificável no banco ou nos
logs. O cliente descreve sintoma; a causa se prova. Um rascunho que afirma causa errada
com segurança é pior do que um que pede o dado que falta.

Duas armadilhas que já nos pegaram, as duas por concluir pelo **estado final**:

- **`updated_at` não diz qual campo mudou.** Serve de pista, nunca de prova.
- **O estado de agora não prova o estado no instante do evento.** Um card que hoje está
  num estágio com regra pode ter recebido a resposta em outro estágio, sem regra. Isso me
  fez prometer ao cliente a correção de um defeito inexistente (ver #46 abaixo).

Reconstrua a linha do tempo antes de opinar:

```sql
SELECT id, tipo, descricao, dados, created_at
  FROM atividades_lead WHERE lead_id = :id ORDER BY created_at;
```

Em `mudanca_estagio`, o campo `dados` distingue quem moveu: automação de resposta grava
`{"trigger":"resposta_lead", ...}`; movimentação manual grava só ids/nomes e carrega o
`usuario_id` de quem mexeu. **Sem `trigger`, não foi automação — foi gente.**

---

## Como pedir ajuda ao chat

Cole o chamado e este enquadramento:

> Sou o atendente do suporte do Gestão Financeira CRM. Vou colar um chamado.
> Antes de escrever resposta, verifique no banco/logs o que dá para verificar e me diga
> o que encontrou. Se faltar evidência, o rascunho tem que PEDIR o dado que falta, nunca
> afirmar causa. Cliente é operador de vendas, não é técnico: sem jargão nosso (webhook,
> instância, código HTTP, nome de tabela). Devolva: (1) resumo em 1 frase, (2) o que foi
> verificado e o resultado, (3) rascunho pronto para colar, (4) o que NÃO dizer.

Regras de escrita do rascunho: no máximo 3 parágrafos curtos; passo a passo numerado
quando for "como faço"; comece pelo que muda para o cliente, não pelo diagnóstico; termine
com o próximo passo. Sem "pedimos desculpas pelo transtorno", sem "prezado", sem "esperamos
ter ajudado". Nunca prometa prazo, valor, reembolso ou política comercial. Se for defeito
nosso, diga sem enfeitar — e só depois de ter certeza de que é.

**Responder NÃO envia e-mail ao cliente** (decisão de produto de 28/08/2026). Ele lê a
resposta dentro de `/gestao/suporte`, na conta dele. O que sai por e-mail é a confirmação
de abertura e o aviso interno para `suporte@duofuturo.tech`.

---

## Causas recorrentes, com o comando que prova cada uma

### "Mensagem não enviada" / "não entregou" / "diz que não tem WhatsApp"

O envio segue **`contatos_whatsapp.whatsapp_id`**, não `leads.telefone`. Quando o contato
vinculado tem o número errado no começo (DDI de Portugal `351` grudado, DDD trocado, `55`
sobrando ou faltando), a mensagem vai para um JID que não existe e a instância devolve
422 "não tem conta no WhatsApp" — com o número **certo** na tela. O cliente está certo.

```sql
-- o que o sistema realmente discou, e o erro que voltou
SELECT direcao, origem, erro, enviado_at FROM historico_mensagens
 WHERE lead_id = :id ORDER BY created_at DESC LIMIT 8;

-- card vs contato vinculado
SELECT l.telefone AS card, c.numero AS contato, c.whatsapp_id
  FROM leads l JOIN contatos_whatsapp c ON c.id = l.contato_whatsapp_id
 WHERE l.id = :id;
```

Qual lado é o real, **sem enviar nada** (`whatsapp_porta` do responsável em `usuarios`):

```bash
curl -s localhost:<porta>/check-number/<numero>
# devolve exists + o jid CANÔNICO — é esse valor que se grava, não o número do card
```

Corrigir (o cast não é enfeite: sem ele o Postgres recusa com "inconsistent types
deduced for parameter"):

```sql
UPDATE contatos_whatsapp
   SET numero = $1::text, whatsapp_id = $1::text || '@c.us', updated_at = NOW()
 WHERE id = :contato AND numero = :valor_errado;
```

Varredura da base — use os helpers do próprio app, não reimplemente a regra:
`vinculoDivergente` e `divergenciaApenasNoPrefixo` de `crm/_shared/telefone.ts`.
Divergência **de prefixo** é erro de cadastro; divergência nos **8 dígitos finais** é
outra pessoa, e aí mexer vaza conversa entre leads — nunca corrigir sem conferência humana.

Outras causas do mesmo sintoma, quando o vínculo está ok:

- Chip desconectado e chip **banido** aparecem iguais para o usuário: `/send` responde
  **503** nos dois casos. `curl -s localhost:<porta>/status` mostra `banido` e o
  `lastDisconnect.code`.
- Sucesso no envio **não prova entrega**: o sistema não recebe confirmação de leitura.
  "Consta como enviada" e "a pessoa recebeu" são afirmações diferentes.
- Lead importado nasce sem vínculo de contato: a mensagem pode ter saído e o card mostrar
  a conversa vazia.

### "Leads parados" / "disparo não chegou para X contatos"

```sql
SELECT left(dl.erro, 70) AS motivo, count(*) FROM disparo_leads dl
  JOIN disparos_crm d ON d.id = dl.disparo_id
 WHERE d.empresa_id = :emp AND dl.erro IS NOT NULL AND d.created_at >= :data
 GROUP BY 1 ORDER BY 2 DESC;
```

"WhatsApp não conectado" é chip fora do ar no momento do disparo — a mensagem não saiu e
o lead ficou onde estava. O resto costuma ser número inexistente na forma salva.

Os **destinatários são congelados** em `disparo_leads` quando o disparo nasce: adicionar
leads depois não muda disparo já programado. Para trocar o público, excluir e criar de
novo (mesmo botão de editar o agendamento).

### "Follow-up não saiu"

Janela de envio (`empresas.config`: `janela_envio_inicio/fim/dias`), passo agendado para
dia que a janela não cobre, follow-up já em `falhou` (aparece na lista de falhados e é
reagendável), ou espaçamento anti-ban segurando a fila daquele chip.

O cron roda **a cada minuto**. Sintoma de loop: a **mesma linha de log repetindo em
intervalo regular com o mesmo id** — foi assim que apareceu o bug do `cancelar`
(31/08/2026), em que 14 follow-ups ficaram presos em `processando` por horas.

```sql
SELECT status, count(*) FROM followups_agendados GROUP BY status;
```

### "A IA respondeu errado / não moveu o card"

Instrução por estágio e por lead se sobrepõem à global. Mover após envio só vale no
**último** passo da cadência. E o agente pode ter respondido a uma **mensagem automática**
do outro lado — ele não distingue isso hoje.

```sql
SELECT id, nome, agente_ia_ativo, estagio_apos_resposta_id, estagio_apos_envio_id
  FROM estagios_funil WHERE funil_id = :funil ORDER BY id;
```

Confira a cadeia inteira, não só o estágio atual: se o estágio de **entrada** não tem
`estagio_apos_resposta_id`, um lead que responde de imediato não avança sozinho — e isso
é configuração, não defeito.

### "Não encontrei tal tela" / "como faço X"

Só afirme que algo existe com certeza. Inventar caminho de menu é o pior erro possível:
o cliente procura, não acha, e perde a confiança na resposta inteira. Nomes reais do menu:
Dashboard · CRM / Funil · CRM Dashboard · CRM CX · Clientes · Receitas · Despesas ·
Parcelas · Sessões · WhatsApp · Agente IA · Suporte. **Automação de grupo de WhatsApp
não tem tela** (existe tabela e serviço, nenhuma página); o que existe sobre grupo é a
aba **Grupos** dentro do botão **Contatos**, no CRM.

---

## Chamados atendidos

### 31/08/2026 — Panteras (empresa 5), 5 chamados

| # | Assunto | Causa real | Desfecho |
|---|---|---|---|
| 15 | `dddde` | teste sem conteúdo | fechado sem resposta |
| 28 | Leads parados na entrada, ~20 não receberam | 148 erros de disparo desde 20/08: **46 "WhatsApp não conectado"** (chip fora do ar) + números inexistentes na forma salva | respondido; lista de números pendente |
| 44 | Mensagem não enviada pelo CRM | contato vinculado com **`351`** (Portugal) no lugar do `55`; card estava certo | vínculo corrigido |
| 45 | Não entrega para o Breno | contato com **DDD `55`** no lugar de `21`; card estava certo | vínculo corrigido |
| 46 | IA respondeu automática e card não moveu | **não era defeito**: a resposta chegou com o card no estágio de ENTRADA, que não tem regra; depois alguém moveu à mão para o estágio que tem | corrigido com o cliente, prazo retirado |

**#44/#45 — números:** o card estava correto nos dois, e o `check-number` provou: a forma
do card existe, a do contato não.

```
#44  discou 3515191070326 [não existe]  ·  card 555191070326  [existe]
#45  discou 5555973587656 [não existe]  ·  card 5521973587656 [existe]
```

**Varredura completa da empresa 5:** 5.997 cards com contato vinculado, **10 divergentes
(0,17%)**. Corrigidos 6 (leads 15705, 13285, 14169, 15736, 13381, 13320) — em 13381 e
13320 o **card também** estava errado, e só o jid resolvido revelou o real (13381 é
Goiânia `556292214444`; 13320 é número **dos EUA** `16024811921`).

**Pendentes de conferência humana** — não mexer sem o cliente confirmar:

- lead 13309 (Aline): `554191755733` e `554991755733` **existem os dois** no WhatsApp
- lead 13523 (Costa): **nenhum** dos dois existe; o número real não está no sistema
- leads 46, 65, 13039, 12905 (Lani Sian): 8 dígitos finais **diferentes** — o card aponta
  para a conversa de outra pessoa

### Bug encontrado de lambuja em 31/08 — corrigido

`followupsService.cancelar` filtrava `status = 'pendente'`, mas o motor só chama depois de
`reclamar` (status já `'processando'`): o UPDATE casava zero linhas, sem erro e sem log. O
registro ficava preso, o reaper devolvia à fila, o ciclo reclamava de novo — a cada minuto,
por horas. **14 follow-ups da empresa 5** em loop. Corrigido para
`status IN ('pendente','processando')`.

Lição: no padrão claim-then-act, **todo desfecho terminal tem que aceitar o estado
reclamado**. Guard escrito para o estado pré-claim vira no-op silencioso.

---

### 09/09/2026 — Panteras (empresa 5), 3 chamados da Gabriela

| # | Assunto | Causa real | Desfecho |
|---|---|---|---|
| 53 | Remetente em caixa alta | `configuracoes_smtp.email_from_name = 'SABRINA BOGIANI'` | corrigido para `Sabrina Bogiani` |
| 57 | Rodapé do e-mail marketing desconfigurou | o editor de agendamento achatava a assinatura | 3 agendados recompostos + causa corrigida |
| 58 | Banner do e-mail desproporcional | imagem de 3.780px inserida no tamanho natural | banner reduzido a 600px e publicado |

**#53 — o remetente vale para o que já está agendado.** `executarAgendado` lê o SMTP no
momento do envio (`disparos-email.service.ts`), não congela no agendamento. Só quem é
`isAdminEmpresa` alcança a tela *Config. E-mail* — Gabriela é `comum`, e por isso pediu
para a equipe em vez de fazer sozinha.

**#57 — a assinatura não pode passar pelo editor de texto rico.** `EditarAgendamentoModal`
mandava o template INTEIRO (corpo + `<hr>` + assinatura) para o `EmailEditor`. O TipTap
não tem nó de tabela: descarta `<table>/<tr>/<td>`, promove cada filho a bloco e devolve
isso no `onUpdate`, que era salvo por cima do original. A criação sempre fez certo — lá a
assinatura mora num textarea à parte e só é concatenada no envio.

> **Como provar que um template passou pelo editor:** o `EmailEditor` carimba classe
> própria no que serializa (`max-w-full rounded`, de `Image.configure`). Num disparo
> íntegro ela aparece só no CORPO; num achatado ela está nos ícones da ASSINATURA.
> Testar por "não tem `<table>`" daria falso positivo em quem nunca teve assinatura.

O que se perdia no e-mail enviado **não** era o empilhamento (isso é do editor, onde a
imagem é bloco; no e-mail os `<img>` são inline e ficam lado a lado). Era o alinhamento
central, a tipografia da marca e — o que pesa — os `<a href>` em volta dos ícones: as
redes sociais deixavam de ser clicáveis.

Corrigido em `utils/assinaturaEmail.ts` (`SEPARADOR_ASSINATURA`,
`montarEmailComAssinatura`, `separarAssinatura`), usado pelos dois modais. A edição ganhou
um bloco "Assinatura / Rodapé" em HTML cru, que é a resposta à pergunta do chamado.
Passado corrigido por `api/scripts/reparar_assinatura_disparos_20260909.js` (idempotente,
simula sem `--aplicar`): disparos 446, 447 e 448 recompostos.

**#58 — o editor insere `<img>` sem largura.** `setImage({ src })` não põe atributo de
largura e o disparo não pós-processa o HTML, então a imagem vai no tamanho natural dela.
A arte foi republicada em 600px (largura padrão de e-mail) em
`uploads/email-images/`, que é a árvore pública de propósito. **Vai se repetir** com
qualquer imagem grande — ver "Em aberto".

---

### 15/09/2026 — Panteras (empresa 5), 8 chamados

| # | Assunto | Causa real | Desfecho |
|---|---|---|---|
| 53, 57, 58 | remetente, rodapé, banner | já atendidos em 09/09; a cliente só agradeceu e a resposta devolveu à fila | marcados como resolvidos |
| 77 | IA mandou o fluxo todo de uma vez | **defeito nosso**: passo 0 preso 18 dias (IA sem crédito, 133 tentativas `ia_credencial`); os seguintes esperaram pela guarda de ordem mas **mantiveram o horário original** e saíram atrás dele com ~1 min | corrigido (reancoragem); 29 leads com 3 msgs em minutos |
| 78 | número cai e o FUP pula a mensagem | **defeito nosso**: toque com chip fora vira `falhou` (terminal) e a guarda só segurava `pendente` — o seguinte saía no lugar | corrigido (retomada por chip); 28 leads desde 21/08 |
| 60, 70 | Entrada que não recebe disparo | **não era defeito**: número inexistente (conferido com e sem o 9) ou chip desconectado no disparo | 27 arquivados (`scripts/arquivar_numeros_inexistentes_20260915.js`) |
| 59 | ordenar cards do mais recente | sugestão | seletor "Ordenar por" no CRM |

**#77 — a equipe conteve sozinha:** desligou a cadência da Nutrição (1.702 toques, 297
leads) às 11:30 e a da Tentativa de Contato (511 toques, 210 leads) às 12:12. Religar é
seguro: a cadência é recriada a partir de AGORA (`calcularCadencia(..., new Date())`).
Quem já recebeu algum toque no estágio atual fica fora da recriação — é a regra de sempre.

**Coincidência a vigiar:** os chips 3015 e 3017 foram deslogados (401) às 10:52 e 12:03,
no meio da rajada (10:41–12:12). Não prova causa, mas rajada é o que o WhatsApp pune.

**#60/#70 — como separar:** `check-number` na instância de qualquer chip conectado, com
e sem o 9 (e com DDI). Controle obrigatório: confira antes um número que sabidamente
existe — "não existe" de uma instância com defeito arquivaria gente boa. Dos 32 da
lista: 23 inexistentes, 2 incompletos (Andréa sem o 9, Melissa sem DDD), 6 já tinham
recebido em disparo posterior, 1 (Maria Alves) número bom que caiu com chip fora.

**Achado de lambuja:** o card arquivado não tinha como voltar pela tela — o hook
`useReativarLead` existia sem nenhum botão. Agora o card arquivado mostra **Reativar**.

---

### 23/09/2026 — Anchor (empresa 38) e Panteras (5), 4 chamados

| # | Assunto | Causa real | Desfecho |
|---|---|---|---|
| 177 | Mensagem nova não entra na coluna | **defeito nosso**: número desconhecido era descartado antes do auto-lead (Flaviane, 553397058165, 6 msgs em 22/09) | corrigido; mensagens anteriores não voltam |
| 176 | Erro ao enviar, chips conectados | **não era defeito**: 11 5360-3900 é fixo (`check-number` com controle); ~99 fixos na base | respondido |
| 176 | Nomes com acento quebrado | **defeito nosso**: CSV UTF-8 lido como Latin-1 | leitura corrigida + 21 nomes reparados (`convert_from(convert_to(nome,'LATIN1'),'UTF8')`) |
| 175 | Sugestões (origem, filtros, duplicados…) | origem da planilha virava `importacao` — **defeito nosso** | importação corrigida; pedida a planilha para repor as origens |
| 173 | Aviso de novidades no CRM | sugestão | registrada |

"Duplicados" da Anchor não eram de chip diferente: 10 leads com `55` no lugar do DDD
(`5555983156183` × `5511983156183`) — a regra por funil está certa.

### 29/09/2026 — Panteras (empresa 5), 3 sugestões da Débora

| # | Assunto | Causa real | Desfecho |
|---|---|---|---|
| 218 | Lead do SendFlow sobe sem nome | o SendFlow só manda o número | nome entra na 1ª mensagem da pessoa; 315 cards nomeados |
| 196 | Tags nos leads | API existia sem tela (e criar tag quebrava) | tela de tags no card |
| 195 | Responsável automático no SendFlow | eventos chegam sem dono; mesmo webhook para as 3 automações | pedido à cliente quem cuida de cada uma; Workshop ganhou origem própria |

## Em aberto

- Chips da Panteras desconectados em 15/09: **3011 (Débora) desde 07/09**, 3015 e 3017
  desde 15/09. Ao reconectarem, 176 toques de cadência retomam sozinhos (#78).
- Maria Alves (lead 2133): número bom, fora de todos os disparos — incluir no próximo.
- 84 leads "Participante 55…" sem nome em fonte nenhuma (77 ativos) — os outros 237
  foram renomeados em 15/09 (`scripts/renomear_participantes_20260915.js`).

- Imagem grande no corpo do e-mail: `EmailEditor.handleUploadImage` insere `<img>` sem
  largura e o upload não redimensiona. Saídas: `style="max-width:100%"` na inserção
  (barata) ou redimensionar no `POST /email-images` (correta). Enquanto não houver uma
  das duas, todo cliente que subir uma arte em alta vai reabrir o #58.
- Os disparos #504 (08/09) e #445 (04/09) saíram para ~2.000 contatos com o rodapé já
  achatado, sem os links das redes. A cliente **não** foi avisada — decisão pendente.
- Enviar ao cliente a lista de números malformados do #28
- Config: regra por resposta no estágio de entrada do funil 24 (ofertada ao cliente)
- Desligar o agente no estágio 209 se o cliente pedir
- Os 6 vínculos acima, pendentes de conferência
- Anchor (38): repor a origem dos 873 leads quando a Ive anexar a planilha no #175
- Receber e-mail de fora (IMAP → ticket) **não** está implementado; a coluna `canal` já
  existe para isso
