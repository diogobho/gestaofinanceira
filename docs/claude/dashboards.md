# Financeiro e dashboards — parcelas, Conta Azul, Integrações, PDF, CRM Dashboard/produtividade

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

## Lançamento à vista também tem parcela (09/09/2026)

O dashboard (`dashboard.service.ts`), a tela de **Parcelas** e o chat financeiro
leem **tudo** de `parcelas_receitas`/`parcelas_despesas`, com **INNER JOIN**.
Até esta data só `createComParcelas` gravava parcela: um lançamento **à vista**
não gerava nenhuma e, portanto, **não existia** para nenhuma dessas telas.

A Loja Mageense (empresa 33) cadastrou 24 receitas e 15 despesas e viu o
dashboard zerado — foi assim que apareceu. Não era só dela: a Panteras tinha
**19 receitas** invisíveis pelo mesmo motivo. A conta demo (empresa 31) parecia
certa porque as parcelas dela vieram do **seed**, e é por isso que a falha
atravessou os prints do guia de onboarding sem ser notada.

O modelo agora é uniforme: **à vista é uma parcela de 1 de 1**, vencendo na data
do lançamento. Ensinar cada consulta a somar duas origens diferentes seria mais
caro e mais fácil de esquecer na próxima tela.

- `create` de receita e de despesa grava a parcela; a despesa automática de
  **taxa de serviço** (`criarDespesaTaxaServico`) também, que tinha o mesmo furo.
- **`update` sincroniza a parcela** (valor, vencimento, status e baixa). Sem
  isso o dashboard passaria a mostrar o valor ANTIGO — número errado é pior que
  número ausente. Lançamento **parcelado** fica de fora: lá cada parcela tem
  vida própria, e o guard é `total_parcelas = 1`.
- Excluir não precisa de nada: a FK é `ON DELETE CASCADE`.
- Status é **MAIÚSCULO** na parcela (`PAGO`/`PENDENTE`/`ATRASADO`) e minúsculo
  no lançamento. `statusParcela()` e `dataVencimentoDe()` em `shared/utils.ts`
  concentram a tradução.
- `$3::varchar` nos dois lugares do UPDATE, senão o Postgres deduz varchar em
  `status = $3` e text em `$3 = 'PAGO'` e recusa a query — o mesmo `42P08` que
  derrubou o `alterarStatus` do suporte.

**Todo caminho que cria lançamento tem que gravar a parcela.** São cinco, e
convém conferir a lista antes de abrir o sexto: cadastro de receita, cadastro de
despesa, taxa de serviço (`receitas.service.ts`), conversão de lead do CRM (usa
`receitasService.create`, então já vem de graça), chat do Duo
(`chat-financeiro.service.ts` — este já fazia certo desde sempre, e foi a pista
de que 1 de 1 era mesmo o modelo pretendido) e importação Open Finance
(`pluggy.service.ts`, corrigida junto; ainda sem nenhuma linha em produção).

Passado corrigido por `api/scripts/backfill_parcelas_a_vista_20260909.js`
(idempotente, `--empresa=N` para um cliente por vez, simula sem `--aplicar`).
Aplicado na base inteira em 09/09/2026: 54 parcelas de receita e 24 de despesa,
nas empresas 33, 5 e 1. Conferido depois: zero lançamento à vista sem parcela,
zero com mais de uma, e a soma das parcelas bate com a soma dos lançamentos.

## Dashboard Conta Azul (`/gestao/dashboard` → aba "Conta Azul")

Aba dentro da página de Dashboard, ao lado de "Visão Geral" (o dashboard de
sempre, intocado). Fonte de dados é **só** a API v2 do Conta Azul — nada do banco
local entra aqui.

**Duas contas, um dashboard (migration 066).** A Panteras tem duas contas do Conta
Azul, uma por produto. O dashboard mostra o **consolidado** por padrão e o filtro
"Produto" isola cada uma; acima dos gráficos há uma linha de cards por produto.
Cada lançamento vem carimbado com `conexao_id`/`conexao_nome`, e o `id` do evento é
prefixado pela conexão (`1:uuid`) porque nada garante id único entre contas
diferentes.

**Acesso:** só a **creator** da Panteras (`empresa_id = 5` + `isCreator`) ou
`super_admin` — desde 20/10/2026, pedido do dono depois que a Hellen (master) abriu
a aba; antes valia `isAdminEmpresa`. O papel sozinho **não** basta: há creators de
várias empresas no banco, e liberar por ele exporia o financeiro da Panteras às
outras. A importação para Receitas/Despesas (`contaazul.financeiro.routes.ts`) também
é só da creator, em todas as empresas (`podeUsarContaAzul`, 20/10/2026): botão
escondido em Receitas/Despesas e 403 em todas as rotas, inclusive status e conferir.
O job de sincronização segue rodando para quem já conectou. Quem manda é o backend (`contaazul.dashboard.routes.ts`, 403 para o
resto); o frontend só usa o perfil para não piscar a aba.

| Peça | Arquivo |
|------|---------|
| Conexões + OAuth | `api/src/modules/contaazul/contaazul.service.ts` |
| Seed de conexão | `api/scripts/seed_contaazul_conexoes.js` |
| Rotas protegidas | `api/src/modules/contaazul/contaazul.dashboard.routes.ts` |
| Busca + normalização | `api/src/modules/contaazul/contaazul.dashboard.service.ts` |
| Abas da página | `frontend/src/pages/dashboard/DashboardComAbas.tsx` |
| Tela | `frontend/src/pages/dashboard/contaazul/ContaAzulDashboard.tsx` |
| Filtros | `.../contaazul/FiltrosContaAzul.tsx` |
| Agregações (funções puras) | `.../contaazul/agregacoes.ts` |
| Paleta validada | `.../contaazul/paleta.ts` |

O backend devolve a lista inteira do período normalizada (~590 KB para um ano) e
**toda** filtragem é no cliente — trocar filtro não vai à rede. Cache de 5 min por
empresa+período, furado pelo botão "Atualizar" (`?forcar=1`).

### Conexões (uma por conta do Conta Azul)

`contaazul_conexoes` é a unidade de trabalho desde a 066 — **não** a empresa.
Cada conexão tem o **seu próprio par client_id/client_secret**, porque o
`refresh_token` só vale para o client que o emitiu: usar o Basic de uma conexão
para renovar o token da outra devolve `invalid_client`. Por isso as credenciais
saíram do `.env` (onde eram globais ao processo) e foram para a tabela;
`CONTAAZUL_CLIENT_ID`/`SECRET` no `.env` são **legado**, só insumo de seed.

O que continua global: `CONTAAZUL_REDIRECT_URI` (tem que ser idêntica em todos os
apps cadastrados no portal), `CONTAAZUL_SETUP_SECRET` e `CONTAAZUL_EMPRESA_ID`.

```bash
# autorizar UMA conexão (sem ?conexao= ele lista as opções em vez de adivinhar —
# autorizar a conexão errada grava o token de um produto no outro)
https://duofuturo.tech/api/gestao/contaazul/authorize?secret=…&conexao=2
# situação das duas / renovar as duas
curl  ".../contaazul/status?empresa=5&secret=…"
curl -X POST ".../contaazul/renovar?empresa=5&secret=…"
```

É o **`state`** que carrega a conexão de destino: o Conta Azul não devolve o
`client_id` no callback, então sem ele não há como saber onde gravar o token.

Uma conexão fora do ar **não derruba** o dashboard: `Promise.allSettled` por
conexão, o consolidado soma quem respondeu e a que falhou vira aviso âmbar na tela
(`conexoes[].erro`). Só lança exceção quando nenhuma responde. As conexões entram
na chave do cache de 5 min — ativar/desativar conta muda o consolidado na hora.

### Armadilhas da API v2 (confirmadas em 14/08/2026)

- `data_vencimento_de` / `data_vencimento_ate` são **obrigatórios** (400 sem eles).
- Paginação é `pagina` (1-based) + `tamanho_pagina`; página além do fim volta vazia.
- Só dá para filtrar por **vencimento**. Não existe data de pagamento no retorno —
  por isso "recebido" significa *valor quitado de títulos que vencem no período*,
  e a escolha vencimento/competência existe só como eixo de agrupamento do gráfico.
- `pago + nao_pago ≠ total` quando o título foi quitado com juros ou desconto (26
  títulos na Panteras, ~R$ 7,6 mil). Percentual de composição usa `base` (a soma
  dos baldes), não `total`, senão a barra não fecha 100%.
- Título `LOST` vem com `nao_pago = 0`: a perda é `total − pago`.

**Reconferido em 09/10/2026 (documentação + chamada real na conexão Totem):**
- A data de pagamento **existe**: `GET /v1/financeiro/eventos-financeiros/parcelas/{id}` traz
  `baixas[]` com `data_pagamento`, `metodo_pagamento`, `valor_composicao` (juros, multa,
  desconto, taxa, líquido). A busca ganhou os filtros `data_pagamento_de/ate` e
  `data_alteracao_de/ate` (date-time GMT-3, janela máx. 365 dias) — ambos testados, 200.
- Item da busca: `id` (da parcela), `status` (ACQUITTED…) + `status_traduzido`, `total`, `pago`,
  `nao_pago`, `data_vencimento`, `data_competencia`, `data_criacao`, `data_alteracao`,
  `categorias[]`, `centros_de_custo[]`, `cliente {id,nome}` (sem CPF/CNPJ), `renegociacao`.
- **Não há webhook** (FAQ oficial: "ainda não está disponível nativamente") → sincronizar por
  `data_alteracao`. Limite: 600 chamadas/min e 10/s **por conta conectada**.
- Um app serve várias empresas: o OAuth se repete por empresa e cada autorização gera token
  próprio (FAQ). O portal não documenta homologação/parceria para produção.
- **Conexão 1 (Panteras) fora do ar desde 14/09/2026:** `invalid_client` na renovação (6 falhas)
  — é a credencial do app que foi recusada, não só o token; reautorizar pode não bastar.

O cálculo de vencido bate com o bloco `totais` do próprio Conta Azul — é o teste
de regressão mais barato se mexer nas agregações. Baseline medido em 18/08/2026
para o ano de 2026 (o consolidado é a soma, e é assim que o `totais_api` vem):

| Conexão | Vencido a receber | Vencido a pagar | Itens |
|---------|------------------:|----------------:|------:|
| 1 · Panteras | R$ 69.115,38 | R$ 50.343,02 | 1.447 |
| 2 · Totem | R$ 15.561,02 | R$ 12.498,00 | 1.485 |
| **consolidado** | **R$ 84.676,40** | **R$ 62.841,02** | **2.932** |

### Cores

`paleta.ts` passou no validador contra as superfícies reais (`#ffffff` claro,
`#1f2937` do Card no escuro). A série receber/pagar/saldo passa em todos os pares
nos dois modos. A dupla verde↔vermelho da paleta de status é indistinguível sob
deuteranopia — por isso todo gráfico de status leva rótulo direto + legenda com
valor, e a cor nunca fica sozinha. Não trocar hex sem rodar o validador.

## Dashboard de Integrações (`/gestao/crm/dashboard` → aba "Integrações")

Aba ao lado da "Visão Geral" (o CRM Dashboard de sempre, intocado). Responde
"o que cada sistema trouxe" — quantos leads, quando, para onde foram e **os dados
que vieram junto**. Aberta a **qualquer usuário com acesso ao CRM**: pedir o
número das próprias captações não depende de papel, e o recorte é sempre a
empresa do token, então cada conta enxerga só o que é dela.

| Peça | Arquivo |
|------|---------|
| Catálogo das integrações | `api/src/modules/crm/integracoes/catalogo.ts` |
| Leitura das notas | `.../integracoes/notas.ts` |
| Consulta + normalização | `.../integracoes/integracoes.service.ts` |
| Abas da página | `frontend/src/pages/crm/CRMDashboardComAbas.tsx` |
| Tela | `frontend/src/pages/crm/integracoes/IntegracoesDashboard.tsx` |
| Filtros | `.../integracoes/FiltrosIntegracoes.tsx` |
| Agregações (funções puras) | `.../integracoes/agregacoes.ts` |
| Paleta validada | `.../integracoes/paleta.ts` |
| Testes do parser | `api/tests/integracoes-notas.test.ts` |

`GET /crm/integracoes/dashboard` devolve a lista inteira normalizada (727 kB para
a Panteras, 87 kB comprimidos pelo nginx) e **toda** filtragem é no cliente —
trocar filtro não vai à rede. Mesmo desenho do dashboard do Conta Azul.

### Origem é o primeiro toque; a integração pode ser um toque anexado

Uma integração é reconhecida por **duas** coisas, e as duas são necessárias:

- `origens` — o que ela grava em `leads.origem`: quem trouxe o lead;
- `marcador` — o bloco que ela escreve em `leads.notas`: **um** toque, que pode
  cair num card que já existia.

Os webhooks anexam em vez de duplicar quando o telefone já está no funil. Contar
só por `origem` esconde o resto, e o resto não é pouco: **8 dos 41** cards com o
formulário do Caixa Rápido entraram por outra integração, e o SendFlow tocou
**125** cards contra 109 de origem própria. Por isso `leads.integracoes` (todos os
toques) é o que o filtro casa — `leads.integracao` (a origem) fica só para o
"quem trouxe".

> Webhook novo entra no `CATALOGO` também. Sem uma linha lá o lead é criado, mas
> nasce invisível para o dashboard.

### O parser de notas é genérico de propósito

`lerNotas` não tem lista de campos: quebra as notas em blocos, reconhece o bloco
pelo catálogo e lê `Rótulo: valor`. Rótulo novo no WordPress vira coluna nova sem
tocar em código. Os três formatos que convivem em produção passam pelo mesmo
caminho: uma linha por campo, vários campos numa linha separados por ` | ` (o
diagnóstico legado) e rótulo sozinho com o valor nas linhas seguintes (o
depoimento das indicações).

- **Pedaço sem carimbo e sem marcador é CONTINUAÇÃO**, não bloco novo — senão o
  depoimento de um embaixador com parágrafos vira três blocos anônimos.
- ` | ` só separa campos quando **todos** os pedaços são `rótulo: valor`; um
  "Maior desafio: vender | crescer" é uma resposta só.
- A campanha do SendFlow mora no **título** do bloco (`Campanha X (SendFlow)`),
  não num rótulo — sem extraí-la de lá não dá para separar duas campanhas no
  mesmo funil.
- `campos` é `chave → string[]`: quem entrou em dois grupos tem dois valores em
  `sendflow.grupo`, e os dois precisam sobreviver.

### Decisões da tela

- **`leads.created_at` é naive em UTC.** O agrupamento por dia usa
  `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` — um lead das 02:33Z é de
  ontem aqui, e sem isso a série diária escorrega um dia.
- **A cor segue a integração, nunca o ranking do recorte.** O mapa de cores sai
  do volume no conjunto INTEIRO, então filtrar muda quais séries aparecem e
  nenhuma troca de cor no caminho. São **cinco** cores (é o que passa junto no
  validador); da sexta em diante dobra num neutro. Quando o balde neutro tem uma
  integração só, ele leva o **nome** dela — filtrar por Caixa Rápido e ver a
  barra dela rotulada "Outras" seria o painel respondendo outra pergunta.
- `paleta.ts` passou no validador contra `#ffffff` e `#1f2937` nos dois modos
  (pior par adjacente ΔE 9,2 claro / 9,4 escuro sob deuteranopia). O verde do
  modo claro fica em 2,82:1 — WARN "relief required", e o alívio está no desenho:
  rótulo direto, legenda com valor e tabela abaixo. **Não trocar hex sem rodar o
  validador.**
- **Campo categórico vira gráfico; texto livre vira lista.** "Faturamento hoje"
  tem 4 valores em 41 leads e é uma barra excelente; "Maior desafio" tem 41 em 41
  e viraria 41 barras de altura 1. O corte é `valores/leads`.
- **A pilha da série conta TOQUES, não leads** — um card tocado por duas
  integrações aparece nas duas. O total sem repetição está nos cartões, e o
  rodapé do gráfico diz isso.
- **O filtro por resposta é genérico** (`campoChave` + `campoValor`, selects "Resposta
  em" e "Valor"): o parser de notas não tem lista de campos, e um filtro chumbado num
  campo teria que ser reescrito a cada rótulo novo no WordPress. Vale só para campo
  **categórico** — escolher "o valor exato" numa lista de 41 respostas de texto livre
  não é filtro. As opções saem do conjunto INTEIRO (`camposFiltraveis(todos, …)`): tirá-las
  do recorte faria "semana2" apagar "semana1" da própria lista, sem caminho de volta.
- **Quem filtra pela tabela é um botão, não a barra.** O recharts não é alcançável por
  teclado; a tabela abaixo do gráfico já é o alívio de contraste, e é lá que cada valor
  vira botão (a barra do valor em vigor fica opaca, as outras a 35%).
- **Colunas próprias na tabela só quando o recorte é de uma integração só.** Numa
  lista misturada elas seriam quase todas travessão; ali cada linha mostra os
  próprios campos numa coluna só.
- `/crm?lead=123` abre o card direto (`CRMKanban` lê o parâmetro e troca de funil
  junto quando o lead é de outro) — é o destino dos links da tabela.

## Dashboard — "quem pagou" e "com o que foi gasto" (10/09/2026)

Duas seções no fim da "Visão Geral" (`pages/dashboard/detalhamento/`): ranking à
esquerda, extrato lançamento a lançamento à direita. Clicar num nome filtra o extrato;
há busca, situação (**Recebido/Pago · A receber/A pagar · Tudo**, padrão = pago) e
agrupamento (receita: cliente · produto · descrição; despesa: categoria · descrição).
Substituíram o "Top 5 Clientes" e as duas pizzas "por produto", que agrupavam pela
**descrição** apesar do nome — produto é `receitas.fonte` (rotulado "Produto" na tela
de Receitas). Despesa não tem fornecedor: "com o quê" é `categoria` + `descricao`.

- Lê as mesmas parcelas que o dashboard já baixa (`/parcelas/receitas|despesas`, mesmo
  período por **vencimento**) — nada novo na API, e os totais batem com os cartões do
  topo. A data mostrada no extrato é a de pagamento quando pago.
- O ranking é HTML (botões), não recharts: teclado alcança, nome longo trunca com o
  inteiro no `title`, e 50 clientes rolam dentro do card. Cor única da `paleta.ts`.
- **DATE chega como `2026-09-01T00:00:00.000Z`** (API em UTC). `new Date()` no
  navegador em UTC-3 devolve o dia anterior — a Evolução Mensal jogava toda parcela do
  dia 1º no mês anterior. Use `dataPura()` (`detalhamento/agregacoes.ts`).
- No PDF viraram tabelas inteiras (receitas por cliente e por produto, despesas por
  categoria e por descrição) + os dois extratos, cortados em 150 linhas como no Conta
  Azul.
- **O PDF não filtra situação (11/09/2026).** Até então ele usava só `status = 'PAGO'`
  e, numa conta que não dá baixa nas parcelas, saía "Sem dados" logo abaixo de um
  faturamento de R$ 259 mil (Débora, 27 de 27 parcelas em atraso). Agora cada tabela
  por grupo abre **Recebido/Pago · A vencer · Em atraso · Total** com linha de total
  (`agruparPorSituacao`), zero vira "—" no corpo, e o extrato traz toda parcela com a
  situação por extenso ("Em atraso há 44 dias"), ordenado por **vencimento** — a
  coluna de data é o vencimento, e ordenar pelo pagamento embaralhava as linhas.
- No extrato, `descricaoSemCliente` tira o sufixo " - <cliente>" da descrição que a
  conversão do CRM grava ("Conversão CRM - Keli"): com a coluna Cliente ao lado, o nome
  saía duas vezes e cada linha dobrava de altura. `tabelaHtml` ganhou `semQuebra`,
  `largura` (mínimo sugerido — a tabela automática dava tudo ao nome mais longo) e a
  linha de `total` num `tfoot` com `display: table-row-group`, senão o Chrome repete o
  total no pé de cada página.
- O recorte continua **por usuário** (`usuario_id`), como o resto do financeiro — num
  time com 4 operadores, cada um vê só os lançamentos que cadastrou.

## Relatório em PDF do Dashboard (`utils/relatorioPdf.ts`)

Botão **Exportar PDF** nas duas abas de `/gestao/dashboard`: no cabeçalho da
"Visão Geral" e ao lado do "Exportar CSV" no Conta Azul. Cada um exporta o que
está na tela — **os mesmos filtros**, sem ir à rede de novo.

O **cabeçalho do PDF é a assinatura do usuário** (`usuarios.assinatura_email`,
editada em `/gestao/perfil`); quem não salvou assinatura recebe o padrão de
`utils/assinaturaEmail.ts`, montado com os dados da empresa — a mesma regra do
disparo de e-mail. O HTML da assinatura entra **higienizado** (fora `script`,
`on*` e `javascript:`).

O relatório **não é a tela mandada para a impressora**: é um documento montado do
zero, A4 e sempre claro, dentro de um iframe fora de tela. Imprimir a página
traria o override global de modo escuro (`html.dark .classe`, pintaria o PDF de
cinza-800) e só a primeira dobra, porque o app é `h-screen` com rolagem interna.
O PDF sai pelo diálogo do navegador ("Salvar como PDF") — foi a escolha ante
embarcar jsPDF + html2canvas (>1 MB, rasteriza texto) ou renderizar no servidor
(a API não tem navegador headless, e mandar HTML do cliente para renderizar lá é
vetor de SSRF).

- **O ícone de cada legenda do recharts também é `svg.recharts-surface`** (14×14)
  e vem ANTES do gráfico no DOM: `querySelector('svg.recharts-surface')` copiava
  um quadradinho de legenda esticado na largura toda. `capturarGrafico` pega o
  **maior** SVG que não esteja dentro de `.recharts-legend-wrapper`. A legenda é
  HTML irmã do `<svg>` e é copiada à parte, senão o gráfico perde as séries.
### O tamanho do texto do gráfico não pode depender da largura da TELA (09/09/2026)

Esticar o SVG copiado para 100% do papel amplia o eixo junto. Num card de 500px
(1526 CSS de janela, grid de 2 colunas — o caso do usuário) o eixo de 12px saía
com **19px** no papel, quase o dobro do texto do corpo; num monitor largo, com o
mesmo card em 900px, sairia com 9px. Mesmo botão, resultados opostos.

`capturarGrafico(seletor, { larguraAlvo, alturaMax })` resolve os dois lados de
uma vez, e é por isso que gráfico **pode ir em meia largura** hoje (o motivo de
ele ser sempre de largura cheia era exatamente esse encolhimento):

- a escala do desenho e o `font-size` são calculados **um contra o outro** —
  gravar `alvo / escala` no `<text>` faz sair `alvo` no papel, sempre entre 9 e
  13px, venha o gráfico de que tela vier. O tamanho vem de `getComputedStyle`:
  o recharts define fonte por CSS do pai, não por atributo no `<text>`;
- o recorte é o `getBBox()` do **desenho**, não a moldura do SVG. Isso inclui o
  rótulo que vaza pela borda (medido: 12px além dos 500 — era o `R$ 2` cortado
  no meio) e descarta os 34px que o SVG reserva para a legenda, que é HTML
  sobreposta;
- o `getBBox` é medido **no clone, com a fonte já compensada**, num palco fora
  da tela. Medir antes de trocar a fonte dá uma caixa apertada para uma fonte
  maior, e o eixo Y sai decapitado (`.2000` no lugar de `32000`). Como a caixa
  depende da fonte e a fonte depende da escala, que depende da caixa, o ponto
  fixo é buscado por iteração — 3 passadas bastam.

`LARGURA_PAPEL` (718) e `LARGURA_PAPEL_METADE` (352) são a largura útil da A4
com as margens do `@page`. Passe `larguraAlvo: LARGURA_PAPEL_METADE` em bloco
`metade`, senão o gráfico é calculado para uma largura que ele não tem.

### A assinatura de e-mail não é papel timbrado

A do Instituto Totem mede **287px** — 28% da altura útil de uma A4 gastos antes
da primeira linha do relatório (logo de 110px, seis ícones sociais de 42px e o
endereço). Era o que empurrava o primeiro gráfico para a folha seguinte e
deixava meia página em branco. `max-width`/`max-height` no `img` não alcançam
isso: cada ícone já cabe no limite; quem é grande é o conjunto.

`ajustarCabecalho()` mede a assinatura no iframe **depois das imagens** e a
reduz em escala até caber em 140px de altura **e 45% da largura** (piso de 0,34
— assinatura ilegível não é timbre). A largura entra na conta porque a do
Mageense tem 584px: cabe na altura e ainda assim joga o título para duas
linhas. Reduzir preserva a marca inteira; cortar, não.

Três armadilhas, todas encontradas rodando:

- `transform-origin` tem que ser `left top`. Com `left bottom` o conteúdo
  reduzido desce para fora do recorte e a marca **some** da página.
- `transform` não encolhe a caixa no FLUXO. Sem fixar altura e largura da
  `.marca`, o cabeçalho fica com os 287×520 vazios; e a `.marca` larga demais é
  comprimida pelo flex, o conteúdo reflui mais alto do que foi medido e vaza por
  baixo do `overflow:hidden` — a linha de contato saía cortada ao meio.
- Encolher a `.marca` reflui o filho. A largura natural tem que ser **presa no
  elemento** antes disso, senão a assinatura é remontada em duas linhas e só
  então reduzida.

O cabeçalho virou **timbre à esquerda + identificação do recorte à direita**
(título, empresa, período, emissão), no lugar da assinatura em cima e o título
embaixo. Com isso o relatório da Panteras saiu de **3 páginas para 1**.

- **Bloco de largura cheia pode quebrar entre páginas** (`thead` vira
  `table-header-group` e repete o cabeçalho); quem não quebra é o par lado a lado.
  Com `break-inside: avoid` no bloco inteiro, a tabela de 150 lançamentos pulava
  inteira para a página seguinte e deixava meia folha em branco.
- O Conta Azul copia gráfico desenhado com a paleta do tema atual —
  `mapaParaImpressao()` (em `contaazul/paleta.ts`) troca os hex do ESCURO pelos do
  CLARO; sem isso o eixo `#9ca3af` some no papel branco.
- A lista de lançamentos do Conta Azul vai **cortada em 150 linhas** (2,9 mil
  viram ~60 páginas) e o PDF diz isso, apontando o "Exportar CSV" para a íntegra.
- Cada gráfico exportável é marcado com `data-grafico="…"` na tela. **Ao mexer nos
  gráficos, mantenha a marca** — sem ela o bloco sai vazio, calado.
- **Bloco vazio é uma linha, não uma caixa.** Três "Sem dados no período" em
  caixa tracejada comiam 180px de página nobre para dizer três vezes a mesma
  coisa. O bloco continua no relatório de propósito: numa conta com 100% de
  parcelas atrasadas, "nenhuma receita paga no período" é informação, não vazio.
- **Percentual sai em pt-BR.** `toFixed(1)` devolve ponto ("98.4%") no meio de um
  documento que escreve R$ 64.243,23 — `formatPercent` na Visão Geral e no Conta
  Azul.

## Visão Geral — filtro fixo, seis números e comparação (08/10/2026)

Etapa 1 da revisão de UX do dashboard financeiro (`pages/Dashboard.tsx` +
`pages/dashboard/visaogeral/`). Só frontend: a API não mudou.

- **Filtro preso no topo** (`BarraFiltros`, `sticky top-0` dentro da área que rola).
  Antes ficava depois de oito cartões. No celular vira um `<select>`: os seis botões
  em duas linhas deixavam a barra presa com um terço da tela.
- **Período na URL** (`usePeriodoNaUrl` em `periodo.ts`): atalho vai pelo NOME
  (`?periodo=mes-passado`), para o link de "este mês" continuar valendo no mês
  seguinte; só o personalizado grava `?de=&ate=`. Padrão (3 meses) fora da URL.
  `?comparar=0` desliga a comparação. Updater funcional: a URL também leva `aba`.
- **Atalhos são meses INTEIROS**, inclusive o corrente até o último dia (antes:
  hoje − 3 meses até hoje). O que vence depois disso está no cartão "A receber
  daqui para frente", que não segue o filtro.
- **Período anterior** (`periodoAnterior`): começou no dia 1º → volta o mesmo nº de
  meses (1º a 08/10 compara com 1º a 08/09; 1º a 31/03 com 1º a 28/02). Outro
  recorte → os mesmos tantos dias imediatamente antes. As consultas do anterior
  NÃO usam `keepPreviousData`: número velho com rótulo novo é comparação errada.
- **Seis cartões, sem repetição** (eram ~14, metade repetida): Faturamento,
  Despesas, Resultado, Em atraso, Clientes ativos, Ticket médio. A comparação é
  ESCRITA ("Subiu 40%, antes R$ 6.150,00") — é o que o leitor de tela lê.
  Resultado compara pela diferença em reais (pode trocar de sinal).
- **Em atraso só olha receitas**, e pela DATA (`status <> 'PAGO'` e vencimento <
  hoje) — o job `atualizar-parcelas-atrasadas` roda 1×/dia e a parcela de ontem
  ainda está PENDENTE. A taxa é sobre o que já venceu, não sobre o período todo.
  A inadimplência antiga somava parcelas atrasadas de receita E despesa.
- **Clientes ativos** = `cliente_id` distintos com receita no período (era o total
  cadastrado). **Ticket médio** = faturamento ÷ clientes ativos (era por parcela paga).
- **Pizza "Situação das Receitas" em dinheiro** (Recebido / A vencer / Em atraso),
  só receitas. A antiga contava parcelas e misturava despesas.
- **Gráficos usam `usePaletaViz()`** do Conta Azul (tooltip e grade no escuro); o
  PDF passa `mapaParaImpressao(paleta)`. Rótulo de valor em cada ponto só em tela
  ≥ 768px e até 6 meses — no celular eles se atropelam.
- O resumo do PDF segue os mesmos seis números.

### Etapa 2 — filtros (08/10/2026)

- **Cliente, produto, categoria, origem e situação** (`visaogeral/filtros.ts`), na URL
  junto do período (`?cliente=…&origem=asaas&situacao=atraso`). Aplicados NO NAVEGADOR
  sobre as parcelas já baixadas: cartões, gráficos, pizza, detalhamento e PDF leem a
  mesma lista filtrada. Por isso os totais dos cartões agora saem das parcelas, não de
  `/dashboard` — a API ficou só para o "a receber daqui para frente" (que não segue
  período nem filtro).
- Cliente e produto só existem em receita; categoria só em despesa. Com um deles o
  outro lado NÃO é filtrado e o **Resultado vira "—"** (receita de uma cliente menos
  todas as despesas não é resultado de nada). Origem e situação valem para os dois.
- Situação pela DATA (`situacaoDa`), como o "Em atraso". Os nomes de cliente/produto/
  categoria são os mesmos do detalhamento (`clienteDa` = `normalizarReceitas`).
- **Origem** vem da API de parcelas: receita é `asaas` quando tem linha em
  `asaas_cobrancas`; despesa usa `despesas.origem` (`manual`/`asaas`).
- O período anterior passa pelos MESMOS filtros ("Asaas em setembro" × "Asaas em agosto").
- Painel embaixo da barra no computador; **gaveta por portal** no celular — a barra
  tem `backdrop-blur`, e `backdrop-filter` prende o `position: fixed` dos filhos nela.
- **Clique no gráfico filtra**: mês (área e barras) vira o período; fatia da pizza vira
  a situação. recharts 3 não manda mais `activePayload` no clique: usar `activeIndex`
  sobre `dadosMensais`, e o índice da fatia no `onClick` do `Pie`.

### Etapa 3 — caixa, previsão, resumo e acessibilidade (08/10/2026)

- **Vencimento × Pagamento** (`?base=pagamento`): a API de parcelas aceita `base` — com
  `pagamento` o período filtra `data_pagamento` e só PAGO (regime de caixa). O mês do
  gráfico vem do `data_pagamento` também. "Em atraso" vira "—" nessa visão. Nenhuma
  parcela PAGO estava sem `data_pagamento` em 08/10.
- **Fluxo de caixa previsto** (`fluxoCaixa.ts` + `FluxoCaixaProjetado.tsx`): sempre de
  HOJE a +90 dias (não segue o período; segue os filtros menos situação), só não pagas,
  sem receita em atraso e sem saldo bancário — parte de zero. Linha em **degrau**
  (`stepAfter`: a sobra só muda no dia do vencimento; `monotone` inventava curvas),
  verde acima/vermelha abaixo de zero por gradiente com a parada na altura do zero, e
  marcador no pior dia quando fica negativo. Horizonte 30/60/90 é estado local.
- **Resumo em frases** (`ResumoEscrito.tsx`, `frasesDoResumo`) no topo e no PDF, a partir
  dos mesmos valores dos cartões. "De 01/04 a 31/07", "Em todo o histórico".
- **Gráficos**: tooltip próprio (`TooltipGrafico`: texto na cor de texto, marca colorida
  ao lado); sem número em cada ponto (removido o `LabelList`); rosca com o faturamento
  no centro e 2px de folga entre fatias; barras com canto 4px; `role="img"` + `aria-label`
  e **"Ver os números em tabela"** (`<details>`) em cada gráfico; mini tendência
  (`Sparkline`) nos cartões de faturamento, despesas e resultado.
- `formatCompact` aceita negativo ("-R$ 1,5k"). Tooltip não usa `capitalize` do CSS
  ("Seg., 19 De Out.") — só a primeira letra.
- No celular, Vencimento/Pagamento e Comparar ficam na gaveta de Filtros (a barra presa
  tem só período + Filtros).

### Master e creator veem o financeiro da empresa inteira (08/10/2026)

Decisão do dono: o administrador vê todas as movimentações de todos os usuários.
`shared/escopoFinanceiro.ts` (`escopoDono`) é a regra única em receitas, despesas,
parcelas (inclusive cobrança manual por e-mail/WhatsApp) e dashboard: super_admin
tudo; master/creator `usuario_id IN (usuários da empresa)`; comum só o próprio.
Vale para ler **e** para editar/dar baixa/excluir — a tela mostra o lançamento do
colega com os mesmos botões, e eles não podem responder "não encontrado". O INSERT
continua gravando quem lançou. Os controllers passam `tipo_usuario` e `empresa_id`
do token; chamadas internas (Duo, conversão do CRM) seguem por usuário. Clientes
NÃO entraram (o "cadastrados" do cartão é do próprio usuário). Na Panteras, o
mesmo master passou de 4 para 52 receitas.

## CRM Dashboard — série temporal e granularidade

O gráfico **Evolução** (criados/ganhos/perdidos) agrupa por **dia, semana, mês ou
ano**, escolhido na própria tela. O agrupamento é feito no **banco**
(`granularidade` em `GET /crm/dashboard`), não no cliente: agregar dia a dia no
navegador exigiria baixar lead a lead.

- A janela padrão (quando não há filtro de data) **muda com a granularidade** —
  30 dias / 12 semanas / 6 meses / 5 anos. Manter 6 meses em `dia` daria ~180
  colunas num gráfico de 260px.
- `DATE_TRUNC('week')` no Postgres começa a semana na **segunda** (ISO-8601).
- O valor entra em interpolação de SQL: `normalizarGranularidade()` reduz
  qualquer entrada aos quatro nomes conhecidos antes de chegar na query.
- A granularidade entra na **queryKey** do react-query — sem isso, trocar de dia
  para mês devolve o cache anterior e o gráfico não muda.
- O backend segue devolvendo a chave `mes`, mas o conteúdo agora é
  `YYYY-MM-DD`, `YYYY-MM` ou `YYYY`. **Todo formatador dessa chave tem que
  deduzir a forma pelo valor** — o `formatMonth` da tabela assumia `YYYY-MM` e
  imprimia "undefined/26" no agrupamento anual.

### Layout e dinâmica do CRM Dashboard (08/10/2026)

Mesmo desenho da Visão Geral financeira, reaproveitando as peças de
`pages/dashboard/visaogeral/` (`BarraFiltros`, `periodo.ts`, `CartaoIndicador`,
`CaixaResumo`, `TooltipGrafico`):

- **Barra presa no topo** com atalhos `ATALHOS_CRM` (Hoje, 7 dias, 30 dias, Este mês,
  Mês passado, Tudo, Personalizado), funil e proprietário (passados em `extra`) e
  Comparar. `usePeriodoNaUrl('tudo')`: **o padrão é "Tudo"** (todo o histórico) — chegou a
  ser "Este mês" e o dono pediu de volta o "Tudo" em 08/10/2026. Funil e proprietário na URL
  (`useNumeroNaUrl`: `?funil=42&responsavel=12`) — F5 e link mantêm o recorte.
- **Resumo em frases** no topo (leads novos com variação, vendas e valor, perdas,
  conversão, tempo até a venda, o que pede atenção).
- **Seis cartões com comparação**: Leads novos (`totalLeads` = criados no período),
  Vendas, Taxa de conversão (diferença em pontos), Perdas, Valor em pipeline, Tempo até
  a venda. O anterior é um segundo `useCRMDashboard(..., { comparacao: true, enabled })`
  — não roda em "Tudo" e não usa `keepPreviousData`.
- "Pede atenção" junta tarefas atrasadas/hoje/sem contato e os follow-ups num cartão.
- Temperatura e origem viraram **barras horizontais em HTML** (número e % escritos;
  origem com uma cor só — o comprimento compara, a cor não identifica nada).
- Evolução: tooltip próprio, rótulo nas barras só até 8 colunas.
- **Rolagem**: a página NÃO tem `overflow` próprio, e o wrapper da aba nos dois
  `*ComAbas` também não. Com `overflow` num ancestral, o `sticky` gruda nele mesmo que
  ele não role, e com dois roladores encaixados a página cortava no meio (o
  `overflow-auto h-full` antigo do CRM). Quem rola é o `flex-1 overflow-auto` do Layout.
- `BarraFiltros` ficou genérica: `atalhos`, `extra`, `mostrarBase`, `referencia`,
  `filtros`/`opcoes` opcionais (sem eles não há botão Filtros e o Comparar aparece no
  celular).

### Produtividade do funil e o funil de vendas corrigido (30/09/2026)

Painel **Produtividade do funil** no topo do CRM Dashboard (`pages/crm/ProdutividadeFunil.tsx`,
`GET /crm/dashboard/produtividade`, serviço `crm/dashboard/produtividade.ts`, teste
`tests/produtividade-funil.test.ts`). Exige funil escolhido; sem data, é o mês corrente de
Brasília. Cartões Boca → FUP → Reuniões → Ofertas → Vendas e tabela dia a dia. Definições do
dono da Panteras — é o que a equipe contava à mão pelo WhatsApp:

- **Contato novo** = lead cuja PRIMEIRA mensagem nossa (da conversa inteira) caiu no período;
  **retorno** = ele respondeu depois.
- **FUP** = toda saída depois do primeiro contato (manual, cadência, disparo, agente) + tarefa
  `follow_up` concluída (`data_conclusao`). **Responderam** = entrada depois do 1º FUP.
  **Primeiro contato = 1ª mensagem + o que sair até 60 min depois** (`JANELA_PRIMEIRO_CONTATO_MIN`):
  a equipe aborda em rajada (texto + áudio + texto) e, sem a janela, o lead novo contava também
  como FUP no mesmo dia (05/10: 16 dos 20 novos da Hellen; 20 novos + 29 FUP em 33 leads).
- **Reunião agendada/realizada**, **Oferta** (Reunião Realizada + Objeção + Fechamento) e
  **Venda** (`is_ganho`) e **Perda** (`is_perdido`) = lead que ENTROU na etapa. Etapas achadas **pelo nome**
  (`marcosDoFunil`); a que faltar volta em `marcosAusentes` e a tela avisa.
- **Valor da venda = receita da conversão** (`receitas.lead_origem_id`): o `valor_potencial`
  do card é vazio nas 19 vendas de setembro da Escola (R$ 37.942,98 pelas receitas).
- Mensagem mandada pelo celular conta (o chip repassa o `fromMe`, gravado como `manual`);
  o que acontece com o chip desconectado não chega. Recorte = funil de HOJE e responsável do lead.
- Cada lead conta uma vez por indicador: mensagem + tarefa concluída no mesmo card = **1 FUP**
  (as duas aparecem em "ações"). No total do período também; somar os dias pode dar mais.

- **Um card, um indicador** (06/10/2026, pedido do dono): no dia e no período o card fica só no
  indicador mais avançado — Novo < FUP < Perda < Agendada < Oferta < Venda (`umIndicadorPorCard`).
  Foi FUP e depois Objeção → só Oferta; ofertou e perdeu → Oferta. Assim os indicadores **somam**.
  Retornos/Resp. FUP são recortes do próprio grupo; "c/ reunião" (realizadas) é recorte de Ofertas.
- **Contato, não mensagem**: saída a menos de 60 min da anterior é o mesmo contato (rajada, conversa
  em andamento). `fup_mensagens` = contatos de FUP de todos os cards que tiveram FUP.
- **Pessoas faladas** (`trabalhados`, 06/10): só CONTATO — mensagem nossa ou tarefa `follow_up`/`reuniao`
  concluída. Mover ou anotar o card não conta. `responderam` = entrada depois do 1º contato do dia.
- **Etapa só com contato e permanência** (06/10): card sem contato no período não entra em Agendada/
  Oferta/Perda, e etapa onde ficou < 10 min (`PERMANENCIA_MIN_ETAPA_MIN`) é passagem — a Hellen
  arrastava Realizada/Objeção → Perda → Nutrição em segundos e isso virava 5 ofertas falsas. Venda conta
  sempre. Com isso, no dia, Faladas = Novos + FUP + Perdas + Agendadas + Ofertas + Vendas.
- **Tarefa sem mensagem não é contato** (06/10): `follow_up` concluída só entra (em FUP/ações) se saiu
  mensagem nossa no mesmo dia; Pessoas faladas é só mensagem.
- **Lead transferido de outro funil = Novo** (06/10): a conversa no funil começa na última
  `transferencia_funil` para ele (`lf.entrou`); o 1º contato depois disso é boca de funil, e as
  mensagens de antes ficam com o funil antigo.
- **Hora da mensagem = `enviado_at`, nunca `created_at`** (06/10): importar o histórico de um chip grava
  meses de conversa com `created_at` = hora da importação (02/10 12h: 18.884 msgs da Jéssica; 05/10 19–20h:
  53.503 da Débora, incluindo leads da Hellen). Cada uma virava contato do dia e "contato no período"
  — as 2 ofertas da Jéssica em 05/10 (Viviane, Silmara: Objeção → Reunião Realizada) vinham disso.
- **Boas-vindas automática conta como contato** (06/10): a do privado, pela fila
  (`grupos_boas_vindas_fila`, `erro IS NULL`), casada pelo TELEFONE do card (variante do 9º dígito) —
  antes de 06/10 ela não ia para o histórico e o card do grupo nasce sem contato vinculado. Lead
  abordado no domingo pela automação é Novo no domingo; mensagem de segunda é FUP.
- Reunião realizada está DENTRO de Ofertas (não é coluna à parte — o dono leu como duplicação).
- **Hoje no funil** (`atual`): cards que ESTÃO agora em Agendada e nas etapas de Oferta — o acumulado
  real. A contagem do período é por ENTRADA na etapa (card movido 1x por dia = 1 por dia).
- **Leads trabalhados** = qualquer ação no card no dia: mensagem enviada (a primeira também),
  tarefa concluída de qualquer tipo, mudança de etapa, transferência de funil ou anotação de gente
  (`anotacoes_lead.origem = 'usuario'`). No cabeçalho do painel e na 1ª coluna da tabela.
- Retornos e Resp. FUP trazem o % na própria célula (sobre novos e sobre leads com FUP).

**O acumulado do Funil de Vendas é um funil de COORTE** (30/09/2026): dos leads que ENTRARAM
no funil no período — criados nele ou transferidos para ele (`transferencia_funil` com
`funil_novo_id`; a `transferencia_automatica` troca responsável, não funil) —, até onde cada um
chegou **até hoje**. Cada lead conta em todas as etapas até a mais avançada que tocou, então
afunila e nenhuma taxa passa de 100%. Antes contava passagens no período: a equipe pula etapa
(349 de 745 movimentos em setembro na Escola) e volta (216), e Conexão saía com o dobro de
Tentativa. **Muda com o tempo de propósito** — os leads de setembro seguem andando em outubro;
o dono analisa períodos pelo filtro. Perda e etapas **depois da de ganho** (Nutrição: quem não
avançou no começo e recebe contato 1x por mês) saem da sequência e aparecem em "Fora da
sequência" (`laterais`). O diário continua sendo atividade (entradas por etapa por dia).

Antes disso, o **Funil de Vendas** (`getFunilAnalytics`) tinha três defeitos:
- lead criado contava na etapa em que está HOJE, não na entrada — dos 534 leads de setembro na
  Escola a boca mostrava ~109; agora 535;
- o **diário ignorava o filtro de data** (sempre os últimos N dias) — agora segue o período, e o
  seletor 7d/14d/30d some quando há data;
- o dia era o de UTC — agora Brasília nos dois modos.

### Filtro de proprietário derrubava o CRM Dashboard (25/08/2026)

`GET /crm/dashboard?responsavel_id=…` **sem funil** devolvia **500** e a tela
inteira ficava vazia. Causa: a consulta de "leads por estágio" chumbava `$2`
para o funil (`${funilId ? 'AND e.funil_id = $2' : ''}`) mas recebia
`paramsBase` inteiro — que carrega empresa, funil E responsável. Com responsável
e sem funil sobrava um parâmetro sem placeholder, e o Postgres respondia
`08P01: bind message supplies 2 parameters, but prepared statement requires 1`.

**Nunca chumbe `$n` numa query com filtros opcionais.** Numere sempre a partir do
array (`params.push(x); \`= $${params.length}\``). Essa consulta agora monta a
própria lista de parâmetros, do zero, porque o funil aparece nela em posição
diferente (`e.funil_id`, não `l.funil_id`) e o responsável entra no LEFT JOIN.

Testado depois: **210 combinações** de endpoint × funil × responsável × período
no CRM, e os 8 proprietários + 21 funis clicados na tela — zero falhas.

### `/dashboard` caía com 500 em data inválida

O controller fazia `{...req.query}` e mandava direto para o SQL: `data_ini=abc`
ou `data_fim=2026-13-45` viravam 500 e o dashboard sumia. Agora só `YYYY-MM-DD`
que exista de verdade passa (2026-02-30 é recusado); o resto é ignorado, que é o
mesmo que não filtrar. Query string é a parte mais fácil de alterar numa
requisição — sanear ali não é opcional.

### Auditoria dos filtros do CRM Dashboard (25/08/2026)

`funil_id` e `responsavel_id` sempre valeram para **todas** as consultas
(`paramsBase`). O que faltava era o **período**. Medido campo a campo na empresa
5, antes e depois:

| Bloco | Reagia ao período? | Agora |
|---|---|---|
| Resumo, série temporal, temperatura, origem, tempo de conversão | sim | sim |
| **Leads por estágio** | não (11.913 fixo) | sim — leads criados no período, onde estão hoje |
| **Atividades recentes** | não | sim — as 10 últimas DO período |
| **Tarefas** (atrasadas/hoje/pendentes) | não | sim — por `data_vencimento` |
| **Leads sem contato há 7 dias** | não | **continua não, de propósito** |

- Em "leads por estágio", o recorte de data vai no **ON do LEFT JOIN**, não no
  WHERE: no WHERE ele viraria INNER e os estágios vazios sumiriam, mudando o
  desenho do funil conforme o filtro.
- "Atrasadas" mantém `< CURRENT_DATE` mesmo com período — atrasado é relativo a
  hoje, não ao recorte escolhido.
- "Leads sem contato há 7 dias" não é filtrável por período: **a janela de 7
  dias É a métrica**. Cruzar com outro intervalo não produz número com
  significado.
- Como no card de follow-ups, `periodoAtivo` volta na resposta e a tela troca
  "Tarefas para Hoje" por "Tarefas no Periodo".

### Card de Follow-ups respeita os filtros (25/08/2026)

`GET /crm/followups/metricas` filtrava **só por `empresa_id`** e a tela chamava o
hook sem argumento nenhum: os cinco números (pendentes / atrasados / para hoje /
enviados hoje / falhados) mostravam a empresa inteira mesmo com um funil
selecionado. Agora aceita `funil_id`, `responsavel_id`, `data_inicio` e
`data_fim`, com `JOIN leads` para chegar ao funil e ao responsável.

**Cada contador tem a sua própria data de referência**, porque medem coisas
diferentes: pendente/atrasado usa `agendado_para` (quando VAI acontecer),
enviado usa `enviado_at` e falhado usa `updated_at` (quando aconteceu).

Sem período, "para hoje" e "enviados hoje" seguem sendo o dia de hoje. **Com
período, os dois passam a contar o período** — a interseção de "hoje" com um
intervalo que pode nem conter hoje daria zero sem explicação. A resposta traz
`periodo_ativo` e a tela troca os rótulos para "No periodo" / "Enviados", para
não prometer "hoje" quando não é hoje.

### Trocar filtro não pode reiniciar a página

`if (isLoading) return <spinner>` **troca a página inteira**: a queryKey nova
zera os dados, o conteúdo some, a altura colapsa e o navegador joga o scroll para
o topo. Toda consulta que depende de filtro leva
`placeholderData: keepPreviousData` — os dados anteriores ficam na tela enquanto
o novo chega, e só `isFetching` muda. Vale para `/dashboard` e `/crm/dashboard`.

Duas armadilhas do mesmo tipo, ambas encontradas testando:
- **Card que some leva o controle junto.** O card de Evolução era condicionado a
  `leadsPorMes.length > 0`; com o seletor de agrupamento morando dentro dele,
  escolher um agrupamento sem dados fazia o card inteiro desaparecer — e não
  havia como voltar. O card fica sempre montado; o vazio é tratado por dentro.
- **O estado vazio reserva a MESMA altura do gráfico** (260px). Vazio mais curto
  encolhe o card, e o navegador puxa o scroll junto.

Cores vêm de `dashboard/contaazul/paleta.ts`, a única do projeto validada contra
as superfícies reais (o trio azul/verde/laranja passa com ΔE 9,2 no pior par sob
deuteranopia). Rótulo direto em cada barra e a tabela logo abaixo são o alívio
exigido pelo aviso de contraste — a cor nunca responde sozinha. Texto de legenda
usa cor de texto; quem carrega identidade é a bolinha.

## Receitas do Asaas (migration 105, 06/10/2026)

Botão **Asaas** em Receitas (`modules/asaas-receitas/`, tabelas `asaas_conexoes` e `asaas_cobrancas`):
a empresa cola a chave de API do Asaas DELA (o Asaas não tem login OAuth para terceiros), o
serviço valida, mostra o nome da conta, registra o webhook sozinho e importa as cobranças desde a
data escolhida. Cada cobrança vira receita na categoria Asaas (pendente/atrasado/pago); o webhook
marca recebida na hora e uma conferência completa roda a cada 6h. Estornada/excluída sai da conta.
Cliente ligado ao do CRM pelo CPF/CNPJ (criado sem vencimento, para o Duo não lembrar em dobro).
Só admin conecta/desconecta. Decisões sem resposta do dono: entra também o "a receber"; todos os
planos; receita pelo valor cheio. **Taxa do Asaas vira despesa** (dono, 06/10): categoria "Taxa Asaas", ligada pela `receita_origem_id`, valor `value - netValue`, só quando paga (estorno/exclusão apaga), à vista com a parcela 1/1 PAGA (`aplicarTaxa`). 1ª carga: 11 taxas, R$ 28,28.
- **1ª conexão real (06/10 14h24 BRT):** empresa 32 (suporte@duofuturo.tech) com a conta da
  Futuron (a mesma das assinaturas, `ASAAS_API_KEY`), desde 01/01/2026 — 27 receitas: 12 pagas
  (R$ 2.587,54), 12 atrasadas (R$ 3.228,00), 3 pendentes (R$ 2.258,00). Script:
  `api/scripts/conectar_asaas_duofuturo_20261006.ts`.
- **Lançado à mão antes de conectar (07/10/2026, chamado 390, Instituto Libertá):** a importação
  criava receita nova para cada cobrança e quem já lançava à mão ficava em dobro (25 parcelas).
  Agora `absorverParcelaManual`, só ao CRIAR o vínculo: parcela de receita NÃO vinda do Asaas, da
  mesma cliente, mesmo valor e mesmo vencimento, sai do lançamento manual (valor e
  `numero_parcelas` recalculados; sobrando 1 vira à vista, por `receitas_parcelas_minimo`; sem
  nenhuma, a receita sai) e fica só a do Asaas. As demais parcelas manuais cobrem os meses que o
  Asaas ainda não gerou. Limpeza da Libertá: `api/scripts/asaas_absorver_duplicadas_liberta_20261007.ts`
  (backup em `backups/libertá_receitas_20261007.txt`). Valor ou data diferentes NÃO casam — a
  cliente confere à mão.
- **Taxas pelo EXTRATO (114, 26/10/2026):** `value - netValue` só pegava a taxa de boleto/Pix/cartão
  da cobrança paga. Ficavam de fora notificação por WhatsApp, mensageria, nota fiscal, antecipação,
  negativação e a taxa de cartão cobrada na confirmação, antes de cada parcela cair (Graciele, 39:
  10 taxas no Duo × 109 no extrato desde 07/10). Agora `sincronizarExtrato` lê `/financialTransactions`
  (no job de 6h, desde uma semana antes de `extrato_ate`; no webhook, os últimos 2 dias) e cada tipo
  com FEE vira despesa "Taxa Asaas" com a descrição do extrato. Tabela `asaas_extrato` (linha ↔
  despesa; apagada à mão não volta). As taxas antigas foram ADOTADAS pela linha PAYMENT_FEE da
  mesma receita, sem duplicar; `aplicarTaxa` saiu. Backup: `api/backups/taxas_asaas_antes_114_20261026.csv`.
- **Saídas do extrato (115, 26/10/2026), só com `asaas_conexoes.importar_saidas`** (hoje só a 39 —
  pedido do dono): Pix, cartão Asaas e conta paga viram despesa categoria "Asaas". Saída com parcela
  manual de mesmo valor e até 3 dias de diferença NÃO duplica: a parcela fica PAGA no dia do extrato
  (`parcela_manual_id`). Estorno de Pix (`PIX_TRANSACTION_DEBIT_REFUND`, casa por `transferId`) tira a
  despesa. Baixa da antecipação não é gasto e fica de fora. 1ª carga da Graciele: 24 saídas novas,
  12 casadas, 1 estorno. Lançamento manual feito DEPOIS da saída importada duplica — não há trava.
- **Antecipação = recebida (26/10/2026):** cobrança com `anticipated` e antecipação CREDITED/DEBITED
  (`/anticipations?payment=`, ou `?installment=`) vira receita `pago` no `anticipationDate` — no cartão
  ela segue CONFIRMED até a operadora pagar e aparecia atrasada (Giovana, parcela 3/10, creditada
  14/08). OVERDUE vence a antecipação (boleto antecipado que o cliente não pagou: o Asaas debita).
  Graciele: 20 receitas antecipadas, todas pagas; 3 foram para agosto. A taxa da antecipação já
  entra pelo extrato, mas só a partir de `importar_desde`.

## Lançamentos do Conta Azul em Receitas e Despesas (migration 106, 09/10/2026)

Pedido do dono: "a integração igual à do Asaas, agora com o Conta Azul". Decidido (recomendação
aceita com "Execute"): só a Panteras por enquanto; contas a **receber → Receitas** e a **pagar →
Despesas**; as duas contas (Panteras e Totem) juntas na empresa 5, com o nome da conta em
`receitas.produto` / `despesas.instituicao`; histórico desde **01/01/2026**; dona dos lançamentos
a creator (Débora, 22). A aba "Conta Azul" do Dashboard continua lendo a API direto, intocada.

- `modules/contaazul/contaazul.importacao.service.ts` + `jobs/contaazul-importacao-scheduler.ts`;
  tabelas `contaazul_importacao` (config por conexão) e `contaazul_lancamentos` (parcela ↔
  receita/despesa). Ligar: `api/scripts/ativar_contaazul_importacao_20261009.ts <conexao> <dono> <desde>`.
- Cada **parcela** do Conta Azul = lançamento à vista com parcela 1/1. Recebida/paga: valor `pago`
  (com juros/desconto) no dia da última baixa (`GET /parcelas/{id}` → `baixas[].data_pagamento`;
  só chamada para as pagas e só quando status/`data_alteracao` mudaram). Perdida, renegociada ou
  excluída → `cancelado` sem parcela, valor preservado. Parcial → pendente pelo total, com "(já
  recebido R$ x)" na descrição. Receita `fonte = 'Conta Azul'`; despesa `origem = 'contaazul'`,
  categoria = 1ª categoria do Conta Azul. Origem "Conta Azul" no filtro do Dashboard.
- Sem webhook: incremental por `data_alteracao` a cada 15 min (10 min de folga), completo a cada
  6 h (acha excluídas: vinculada que não veio na busca → `GET` por id, 404 = excluída). Chamadas
  espaçadas em 125 ms com nova tentativa em 429 (limite: 10/s por conta).
- Cliente do CRM só pelo **nome exato e único** — o Conta Azul não manda CPF/CNPJ; nada é criado
  em `clientes`. Duplicação com lançamento manual: o mesmo `absorverParcelaManual` do Asaas (agora
  ignora também receitas do Conta Azul), que só casa com cliente ligado.
- Apagado à mão no Duo não volta. Conexão 1 (Panteras) não ligada: `invalid_client` desde 14/09.
- Backup antes da 1ª carga: `backups/panteras_financeiro_antes_contaazul_20261009.txt`.

- **Limite de vencimento** `contaazul_importacao.importar_ate` (dono, 09/10: "do início ao fim do ano, sem
  lançamentos futuros"). Totem ligada de 01/01 a 31/12/2026: 1.016 receitas (867 recebidas) e 610 despesas
  (515 pagas), contagens iguais às do Conta Azul. Sem data na tela ainda: só pelo script (4º argumento).
- **A busca do Conta Azul oscila**: o mesmo item vem OVERDUE numa chamada e PENDING na seguinte sem mudar
  `data_alteracao`, e a paginação pode pular item. Quem cobre é a passada de 6 h (GET por id do que não veio).

- **Cliente e produto (09/10, pedido do dono):** a busca só traz id/nome da pessoa → `GET /v1/pessoas/{id}`
  (CPF/CNPJ, e-mail, telefone, endereço). Cliente do CRM como no Asaas: CPF → e-mail → nome igual e único →
  cria (`codigo` `CA-…`, `servico` 'Conta Azul'); quem já existia ganha CPF/e-mail/telefone que faltavam.
  **Produto (`receitas.fonte`) = o item de maior valor da venda** (`parcela.evento.referencia` origem VENDA →
  `GET /v1/venda/{id}/itens`); fora de venda (Pix/boleto avulso, ajuste de saldo) = "Outros". O produto entra
  em `categorias_receitas` do dono e dos admins (a lista é por usuário). `receitas.produto` guarda a conta
  (Totem). Reprocesso das 1.016 já importadas: `scripts/contaazul_reprocessar_receitas_20261009.ts`
  (17 min; backup `backups/panteras_*_antes_cliente_produto_ca_20261009.csv`): 210 clientes novos, 27 antigos
  ganharam CPF, 17 produtos, só 3 sem cliente (ajustes de saldo). Duplicados que já existiam no CRM (Janaina
  Klein, Ludmila Prado ×2) não decidem pelo nome → criou uma 3ª com CPF; não foram juntados.

### Conectar pela tela + junto com o Asaas (107, 09/10/2026)

Pedido do dono: "igual ao Asaas, inclusive usar as duas integrações juntas".
- **Botão "Conta Azul" em Receitas e em Despesas** (`ContaAzulConexaoModal.tsx`, rotas
  `/api/gestao/contaazul-financeiro/*`, `contaazul.conexao.service.ts`). Só admin conecta/desconecta.
  Login OAuth: `iniciar` cria a conexão "Conectando …" com a importação desligada → o `/contaazul/callback`
  (state com `usuario_id`) grava o token e chama `concluir`: nome pela `/v1/pessoas/conta-conectada`
  (`conta_id` = `id_empresa`), recusa a mesma conta repetida na empresa, liga e roda a 1ª carga,
  e volta para `/gestao/receitas|despesas?contaazul=ok|erro`.
- **Um app só para todas as empresas** (`CONTAAZUL_CLIENT_ID/SECRET` do .env = o app da Totem). A 107
  (como postgres) derruba o índice único de `client_id` da 066. Se um dia o Duo tiver app próprio no
  portal, troca o .env — vale para as conexões novas.
- **Reconectar** (conta com `invalid_client`/`invalid_grant` ou ≥3 falhas): nova conexão com
  `substitui_conexao_id`; os vínculos passam só se for a MESMA conta (`conta_id`) — em conta diferente a
  passada completa acharia tudo "excluído" e cancelaria os lançamentos. A antiga fica `ativo=false`.
  É o caminho para a conexão 1 (Panteras, `invalid_client` desde 14/09).
- Conta autorizada antes do botão (só Dashboard): "Importar desde …" liga a importação nela.
- **Asaas + Conta Azul** (`gemeos-asaas.ts`): mesma empresa, mesmo valor, mesmo vencimento e a mesma
  pessoa (cliente do CRM ou nome sem acento/caixa) = a mesma cobrança. A receita é UMA, do Asaas
  (webhook, taxa); a parcela do Conta Azul fica `espelho_asaas` e o job dela não mexe. Vale nos dois
  sentidos: Conta Azul chegando depois liga como espelho; Asaas chegando depois adota a receita do
  Conta Azul (`fonte` vira Asaas). `contaazul_lancamentos.parte_nome` guarda o nome para casar.
