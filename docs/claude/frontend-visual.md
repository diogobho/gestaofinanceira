# Frontend — Duo (avatar e chat), altura das páginas, modo escuro, material de onboarding

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

## Interações do Duo (`components/avatar/DuoFace.tsx` + `duo.css`)

Ocioso: respiração, squash e pisca-pisca dos dois olhos. Sob demanda:

| Gesto | Quando |
|---|---|
| Olhar seguindo o ponteiro | Sempre, pela **tela inteira** — não só quando o mouse está em cima dele |
| Piscadela de um olho | Sozinha a cada 9–18s (sorteado) e no hover, junto com o pulo |
| Pulo + sobrancelha | Hover/foco, ou pela prop `ativo` |

- O olhar **satura por distância** (`RAIO_SATURACAO = 190px`), não por tamanho do
  avatar: normalizar por 60px faria o olho bater no limite a qualquer movimento
  e viraria liga-desliga. Perto move pouco, longe move tudo.
- Amplitude é **por eixo** (`MAX_PUPILA_X = 9`, `_Y = 11`) porque o olho é elipse.
  A íris nasce deslocada (+4,+4) do centro, o que deixaria só 6,5 de folga para a
  direita — por isso o grupo `#d3-pupils` é recortado por `#d3-eyes` no SVG: com
  o recorte ela no máximo encosta na borda, nunca escapa do olho. Era 3,5 nos
  dois eixos até 24/08/2026 e o olhar quase não se lia.
- `mousemove` é global, `passive`, coalescido por `requestAnimationFrame`, e o
  `getBoundingClientRect` fica em cache (só re-mede em `scroll`/`resize`) —
  medir por evento forçaria reflow dezenas de vezes por segundo.
- A piscadela é **dirigida por JS**, não um `@keyframes` em loop: ela sobrescreve
  a pálpebra esquerda, e duas animações infinitas disputando o mesmo `transform`
  não convivem. O olho direito segue no ciclo ocioso — é a assimetria que faz
  ler como gesto, e não como trava.
- `animationend` **borbulha** de dentro do SVG: o handler filtra por
  `duo-hop`, senão o fim da piscadela derrubaria o pulo no meio.
- Nada disso roda em tela de toque (`(hover:hover) and (pointer:fine)`) nem com
  `prefers-reduced-motion` — olhar que persegue o cursor é movimento.

Duas instâncias são interativas (lançador e cabeçalho do chat), mas **nunca ao
mesmo tempo**: o lançador desmonta quando o painel abre, então os ids do SVG não
colidem. O Duo de corpo inteiro dos estados vazios é `<img>` e não tem nada
disso — JS não alcança dentro de `<img>`.

## Altura das páginas — quem manda a rolagem

O app autenticado já é `h-screen` com rolagem **interna** (`Layout.tsx`): a
página em si nunca rola, só a área de conteúdo. Telas soltas (login, cadastro)
não passam por ele e precisam resolver isso por conta.

**Armadilha do SVG com proporção própria.** `height: 100%` só resolve contra
altura **definida**. Num grid com a linha em `auto`, um `<svg>` com `viewBox`
cai na proporção intrínseca e estica a página: no login a cena (557×706) gerava
1246px de conteúdo numa janela de 830 — barra de rolagem e cena cortada.
Corrigido em 24/08/2026 com `lg:h-screen` no grid + `lg:overflow-y-auto` na
coluna do formulário: janela baixa rola a COLUNA, e a arte ao lado fica inteira.

**Enquadramento da cena:** `viewBox="0 0 1000 740"` + `xMidYMid slice`. A faixa
vertical antiga (`205 16 557 706` + `YMax`) era bem mais retrato que a coluna, e
o `slice` cortava em cima — decepava a cabeça da Lena em qualquer janela baixa.
Com a cena inteira a proporção fica perto da coluna e o que sai é parede.

Regra para tela nova: decoração com proporção fixa **nunca** pode ditar a altura
da página. Ou o container tem altura definida, ou a arte vai em `background-image`.

## Modo escuro — o override global do `index.css` corta os dois lados

O bloco "DARK MODE — Overrides globais" repinta classes inteiras com
`html.dark .classe`, fora de `@layer`. Isso tem duas consequências opostas, e a
tela de login pegou as duas de uma vez (25/08/2026):

- **O override ganha de qualquer `dark:`.** `html.dark .bg-white` é
  `html` + `.dark` + `.bg-white` = **(0,2,1)**, e a variante do Tailwind
  (`.dark\:bg-transparent:is(.dark *)`) é (0,2,0). Escrever `dark:bg-transparent`
  **não** desfaz nada. Para escapar, o elemento não pode ter a classe literal:
  `max-lg:bg-white`, valor arbitrário (`bg-[#fff]`) ou `!bg-white`.
- **Quem tem prefixo não é alcançado.** `lg:bg-white`, `sm:bg-white` e as paradas
  de gradiente (`from-*`/`to-*`) seguem CLARAS no escuro — o seletor casa a
  classe literal, e `from-slate-50` não tem override nenhum.

No login isso dava: coluna do formulário branca (`lg:bg-white`) com o cartão
(`bg-white`) virando um retângulo cinza-800 flutuando nela; no cadastro, o
gradiente claro mais `text-gray-900` (que o override joga para branco) escondia
o título "DuoFuturo" em fundo branco.

Também no escuro: `bg-primary-600` (#243a65) quase some sobre `gray-900` — o
botão Entrar sobe para `primary-500`. E o **autopreenchimento do Chrome** pinta
o campo de azul-claro ignorando `background-color`; só `box-shadow` interno
cobre (regra `:-webkit-autofill` no `index.css`, com `outline` de foco porque o
shadow disputa a propriedade com o `focus:ring` do Tailwind).

A cena do login é clara por natureza: no escuro ela leva filtro
(`brightness .62`) e um véu `gray-900` da esquerda para a direita, que costura a
emenda com a coluna do formulário. Arte trocada, não.

## Material de onboarding

Fonte única: `landing/onboarding/guia.html`. **Nunca editar PDF à mão** — edite o
HTML e rode `api/scripts/gerar_guia_onboarding.js`, que refaz as nove capturas (só
com a conta DEMO, empresa 31 — LGPD) e os **quatro** PDFs: um por plano mais a
versão completa. Seção nova entra com `data-plano` ("web starter profissional
enterprise"); sem o atributo ela aparece em todos.

`landing/onboarding/index.html` é o índice interno do material. O antigo
`email-primeiros-passos.html` (um convite para CRIAR a conta, que ia justamente
para quem acabou de criá-la) saiu de cena: o e-mail agora é montado pela API, e
o que resta na pasta é a moldura `email-molde.html`.

A seção **Instalar no celular** (24/08/2026) cobre o PWA. O app é instalável
hoje — manifest válido em `/gestao/manifest.json` e o Chrome não aponta nenhum
erro de instalabilidade. **Não existe service worker**: por isso as instruções
são pelo menu do navegador (funciona em Android e iPhone) e o guia diz que
precisa de internet. Sem SW não há offline nem banner automático de instalação.

## Como o Duo escreve no chat

O prompt fica em `chat-financeiro.service.ts`. Ele **proíbe** título (`##`),
tabela, linha divisória e citação, limita emoji a no máximo um, mira 4–8 linhas
e manda **terminar quando a resposta acaba** — nada de "ficou alguma dúvida?".
O agente é reativo: perguntou, respondeu, espera; a próxima pergunta pode não ter
relação com a anterior. Pergunta só quando falta dado para responder.

A diretriz antiga dizia literalmente "formate tabelas e listas em markdown quando
útil", e o resultado era uma resposta com `##`, tabela de campos e `---` numa
janela de 380px.

**O widget flutuante renderizava texto puro** (a tela cheia já usava
`react-markdown`), então todo `**negrito**` e `##` aparecia cru. Agora os dois
renderizam markdown — mas isso é rede de segurança, não licença: quem controla o
formato é o prompt, porque tabela em 380px continua ilegível mesmo renderizada.

**Automação de grupo de WhatsApp não tem tela.** Existe tabela
(`automacoes_grupo`), serviço (`automacoes-grupo.service.ts`), rotas montadas em
`/api/gestao/automacoes` e até o `automacoesApi` no frontend — mas **nenhuma
página importa esse client** e não há rota nem item de menu. O prompt listava
"Automações de grupo WhatsApp" nas capacidades, e o Duo inventava um caminho
dentro da tela de WhatsApp. Agora o prompt diz explicitamente que isso não está
na interface. O que existe sobre grupo é a aba **Grupos** dentro do botão
**Contatos**, no CRM (lista grupos e importa participantes como leads).

O prompt também lista os **nomes reais do menu** (Dashboard · CRM / Funil · CRM
Dashboard · CRM CX · Clientes · Receitas · Despesas · Parcelas · Sessões ·
WhatsApp · Agente IA · Suporte). Sem isso ele inventava caminho — mandava
procurar a conexão do WhatsApp "em Configurações", que não existe. **Ao mexer no
menu, atualize essa lista.**

## Ajuda em vídeo — dica, player no canto e oferta do Duo (04/10/2026)

`src/tutoriais/`. Aprovado pelo dono a partir do protótipo "Ajuda em vídeo no Duo".
Um player só (`VideoAjudaProvider`, montado no `Layout` — fora das telas de bloqueio)
e três portas para ele:

- **`DicaVideo`** envolve o botão da ação (CRM: Filtros, Importar, Disparar só no
  oficial, E-mail, Novo Lead; Receitas; Grupos; microfone do chat do card). Balão
  depois de **0,7s parado** em cima, só com mouse (`(hover:hover) and (pointer:fine)`)
  ou foco por Tab; some de vez quando a pessoa assiste ou dispensa. Vai num **portal
  com `fixed`** (dentro de modal com rolagem um `absolute` era cortado).
  **Armadilha:** fechar o balão no `onClickCapture` do invólucro matava o clique —
  o React aplica a atualização da captura antes da bolha e o botão do balão já
  estava desmontado. `.click()` via JS passava no teste; clique de mouse não.
- **`LinkVideo`** ("Ver em vídeo · 1min10") ao lado do título de seção de
  configuração (agente da etapa, criar lead, cadência, follow-up do card, título da
  página WhatsApp): ali a pessoa lê, não está prestes a clicar — e serve no celular.
- **Chat do Duo**: o prompt lista os ids do `catalogo.json` (relido quando o arquivo
  muda) e ele termina a resposta de "como fazer" com `[[video:<id>]]`;
  `VideosNaResposta` tira o marcador e põe o botão. Id sem `-oficial`: o frontend
  troca pela versão do canal da conta (`resolverVideo`).
- **Oferta do Duo** (`sinalizarDificuldade`): fechar Importar/Disparo/E-mail sem
  concluir, ou QR na tela >90s sem leitura. **Uma por sessão**, nunca para vídeo já
  visto ou oferta recusada, some sozinha em 20s.

Player: canto inferior direito acima do lançador; com o chat aberto, à esquerda do
painel; no celular, largura toda. Lena no cabeçalho (é a voz dos vídeos), Duo espia
ao lado só quando ele "entregou" o vídeo (dica/oferta). Vistos, dicas dispensadas e
ofertas recusadas ficam no `localStorage` por usuário — conveniência, nada depende
disso. Rostos em `public/avatar/lena-face.svg` e `duo-face.svg` (recortes; `<img>`,
sem id duplicado com o `DuoFace` inline).

Testar hover em headless: `COM_MOUSE=1` no `scripts/videos/gerar.js`.

**Novidade com vídeo (05/10).** `pages/suporte/atualizacoes.ts` aceita `video` (id do
catálogo) e a aba Atualizações mostra o `LinkVideo` — que some sozinho enquanto o vídeo
não estiver publicado. Na landing, `releases.html` usa `<a data-video="<id>">`: um script
lê o `catalogo.json`, põe a duração e **remove o link se o vídeo ainda não existe**. Dá
para escrever a novidade e o link antes de gravar; o link aparece quando o mp4 sai.
