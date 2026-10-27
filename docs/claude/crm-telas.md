# Telas do CRM — Kanban, F5/URL, planilha, disparo agendado, barra de ações, ordem e densidade

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

## Arrastar card para coluna fora da tela (25/09/2026, #123)

**Não existe auto-scroll horizontal, e não é esquecimento.** O quadro rola na horizontal e
cada coluna na vertical: scroll aninhado, que o `@hello-pangea/dnd` não suporta — rolar o
quadro no meio do arrasto dessincroniza as medidas e o card cai na coluna errada. No lugar,
enquanto um CARD é arrastado, `KanbanBoard` mostra no rodapé do quadro uma faixa com todas
as etapas (`atalho-<id>`); soltar numa delas manda o card para o topo daquela coluna pelo
mesmo `onMoverLead` (etapa de ganho abre a conversão, como no arrasto normal). A faixa é
montada no `onBeforeCapture` com `flushSync`: Droppable que nasce depois de a lib medir
não existe para ela.

## O F5 reabre onde estava (15/09/2026)

Funil, visão e aba moram na **query string**, via `hooks/useEstadoNaUrl.ts`:
`/crm?funil=57&visao=list&aba=agenda`. Vale no CRM, no CRM CX, nas abas dos dois
dashboards e na tela do Duo. Estado de tela novo que deva sobreviver ao F5 usa
`useAbaNaUrl`, não `useState`.

- **Funil** (`useFunilNaUrl`): a URL manda; sem ela (entrou pelo menu), volta o último
  funil daquele usuário (`localStorage` `crm:funil:<tipo>:<userId>` — o mesmo navegador
  alterna suporte@ e master@). Id fora da lista da empresa sai da URL e o quadro cai na
  memória ou no padrão. O id guardado vale **antes** da lista chegar: esperar faria o
  quadro abrir no Funil Principal e trocar depois.
- Mexer na query string sempre com o **updater funcional** do `setSearchParams`: a URL
  carrega vários estados, e montar a partir de uma cópia velha apaga os outros.
- **Ordem dos cards** (`?ordem=recentes|mensagem`, #59): seletor `OrdenarCards` ao lado de
  Filtros, **fora** de `filtros` (limpar filtro não desfaz a ordem). Vai à API como
  `ordenar`, e `normalizarOrdem` reduz a uma lista branca antes de virar `ORDER BY`. A
  manual ganhou `id` de desempate: lead de webhook nasce com `ordem_estagio = 0`.

## Importar planilha de leads — origem e acento (23/09/2026, #175/#176)

- **A origem da planilha é do cliente.** `normalizarOrigem` trocava tudo que não fosse
  uma das 10 chaves fixas por `importacao` (os 873 leads da Anchor perderam a
  classificação). Agora: chave conhecida vira chave, nome do catálogo (`crm_origens`,
  sem caixa/acento) usa a grafia de lá, o resto entra como veio (teto 50). Origem nova
  entra no catálogo da empresa, que é de onde o card monta a lista.
- **Planilha é lida pelos bytes** (`lerPlanilha`). O SheetJS abre CSV como Latin-1 e o
  CSV exportado pelo Excel/Google é UTF-8: "MENDONÇA" virava "MENDONÃ\u0087A". Texto é
  decodificado como UTF-8 e, se inválido, Latin-1; xlsx/xls seguem binários. O multer
  grava sem extensão, por isso a detecção é pelo cabeçalho (PK / D0CF).
- A planilha é apagada depois de importar: origem perdida só volta com o arquivo.

- **CSV é lido como texto (`raw: true`, 05/10/2026).** Sem isso o SheetJS converte
  "05/10/1985" em data no formato americano (10 de maio). Vale para leads e clientes.

### Importar clientes (05/10/2026)

Botão **Importar** em `/gestao/clientes` (`components/clientes/ImportClientesModal.tsx`),
mesmo fluxo do Importar Leads; API `POST /clientes/importacao/preview|importar`
(`clientes.importacao.ts`, teste `tests/importar-clientes.test.ts`). Regras do cadastro
manual: nome e CPF/CNPJ obrigatórios, duplicidade por CPF/CNPJ do usuário (inclusive dentro
da planilha). CPF/CEP que o Excel guardou como número recuperam o zero da frente; UF/CEP
inválidos ficam vazios em vez de barrar a linha. Não cria lead CX (o cadastro pela tela
também não cria).

## Editar disparo agendado

`components/crm/EditarAgendamentoModal.tsx` — mesmo compositor da criação
(variáveis, formatação do WhatsApp, prévia, estágio pós-disparo, intervalo
anti-ban e, no e-mail, o **assunto**, que antes era impossível de corrigir).
Substituiu um formulário inline de duas linhas.

Os **destinatários não se editam**: foram congelados em `disparo_leads` quando o
disparo nasceu. Trocar o público é excluir e criar de novo — por isso o botão de
excluir mora no mesmo modal. O intervalo anti-ban é mesclado em
`configuracao_json` com `||`, para não apagar os filtros do modo 'todos' que
vivem no mesmo objeto.

## Barra de ações do CRM — quebra, não rola

`CRMKanban.tsx` e `CRMFunilCX.tsx`. A barra tinha `overflow-x-auto` **com a barra
de rolagem escondida por CSS** (`[scrollbar-width:none]` +
`[&::-webkit-scrollbar]:hidden`). Medido em 1600px: 1098px visíveis para 1574px
de conteúdo — **476px inalcançáveis**, engolindo Disparar, E-mail, Novo Lead,
configurar estágio, atualizar e o botão do guia. Roda do mouse não rola eixo
horizontal, então no desktop não havia gesto que trouxesse aquilo de volta.

Agora ela é `flex-wrap`: quebra em linhas e nada fica fora da tela em nenhuma
largura. No celular a quebra também evita a briga do arrasto lateral com o gesto
que abre a sidebar.

Título e barra só dividem a mesma linha a partir de **`xl`**. Em `md` o bloco do
título era espremido a 68px e o seletor de funil transbordava por cima do botão
"Kanban"; em `lg` não colidia, mas a barra virava quatro linhas. O título leva
`shrink-0` e a barra fica com a sobra (`flex-1`).

Verificado em 1920/1600/1366/1280/1024/820/768/430/390 nas duas telas: zero itens
fora da tela, zero colisões.

## Ordem dos cards do CRM (15/09/2026)

Seletor ao lado dos filtros no CRM e no CRM CX (`components/crm/OrdenarCards.tsx`), salvo
na URL (`?ordem=`): manual (arrastar), última mensagem, **mais mensagens recebidas**,
entrada mais recente/antiga, **nome A–Z/Z–A**, maior valor e mais quentes. A API ordena
DENTRO de cada coluna (`ORDEM_SQL` em `leads.service.ts`); a visão em **lista** reordena o
conjunto inteiro com `compararLeads`, o espelho do ORDER BY no cliente.

- O valor vira ORDER BY: `normalizarOrdem` só aceita chave própria de `ORDEM_SQL`
  (`Object.hasOwn` — `"constructor" in {}` é `true`). Teste em `tests/ordem-cards.test.ts`.
- Nome usa `COLLATE "pt-BR-x-icu"`: o banco é `C.UTF-8`, e sem isso "Álvaro" ia para
  depois do "z".
- "Mais mensagens recebidas" conta a conversa 1:1 do contato, sem `copia_indevida`, num
  `LATERAL` que só entra nessa ordem (~0,15 s a mais no funil de 5,7 mil leads). O número
  volta como `total_recebidas` e aparece no card.

- **"Janela de 24h aberta primeiro" (`janela_24h`, 06/10/2026)** — só aparece no seletor
  para quem fala pelo número oficial (`useCanalWhatsApp` = cloud_api). Abertas antes, a que
  fecha primeiro no topo; depois as fechadas, de quem escreveu por último. O `LATERAL jan`
  repete a conta de `canal/janela.ts` (última entrada 1:1 + 24h − 2 min) pelo contato do
  card e devolve `janela_resta_seg`, que vira o selo "Xh para responder" / "Janela fechada"
  (`SeloJanela.tsx`). ~20 ms no funil de 57 leads.

## Densidade do quadro Kanban

Medido em 24/08/2026 num desktop 1920 a 125% de escala (1526×790 CSS), que é o
caso real do usuário:

| | antes | depois |
|---|---:|---:|
| altura do card | 169px | 130px |
| cabeçalho da página | 123px | 112px |
| lista de cards | 463px | 490px |
| **leads visíveis por coluna** | **2,7** | **3,8** |

O maior ganho não foi CSS: `leads.valor_potencial` é `numeric` no Postgres e
chega ao React como **string**. `"0.00"` é truthy, então o teste antigo
(`lead.valor_potencial ? …`) imprimia **"R$ 0,00" em 91% dos leads** (11.996 de
13.127) — uma linha inteira com divisor, dizendo nada, empurrando lead para fora
da coluna. Agora é `Number(...) > 0`, e a faixa some quando não há valor nem tag.

**Cuidado com todo campo `numeric`/`bigint` vindo do `pg`:** eles chegam como
string. `0` e `"0.00"` se comportam ao contrário em teste de verdade.

O resto veio de juntar linhas que eram empilhadas — responsável + disparos numa
faixa, status do WhatsApp + IA/follow-up noutra (as duas com `flex-wrap`, então
quebram sozinhas quando não couberem) — e de apertar respiro de card, coluna e
board. Nenhuma informação foi removida.

## Excluir leads em massa (07/10/2026)

Menu da coluna → "Excluir leads deste estágio"; seletor de funil → ícone de borracha
"Esvaziar funil" (apaga os leads, mantém funil e estágios). CRM e CRM CX. Só
`isAdminEmpresa` — o botão some para os outros e a API devolve 403.

- `GET /crm/leads/excluir-em-massa?funil_id=&estagio_id=` dá o total (a coluna pode não
  ter carregado todos os cards); `POST` com o mesmo corpo exclui. `ExcluirLeadsEmMassaModal`
  pede para digitar EXCLUIR.
- Só leads **ativos** — arquivados não aparecem no quadro, então ninguém os viu ao confirmar.
- Mesmo efeito do DELETE de um lead: tarefas, anotações, tags e follow-ups vão por CASCADE;
  `historico_mensagens` fica com `lead_id` nulo. Cada exclusão deixa uma linha no log do PM2.
- `lerAlvoEmMassa`: estágio inválido recusa, nunca vira "funil inteiro"
  (`tests/excluir-leads-em-massa.test.ts`).
