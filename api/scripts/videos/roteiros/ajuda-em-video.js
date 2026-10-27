/**
 * A própria ajuda em vídeo (frontend/src/tutoriais): dica no hover, mini-player, "Ver em vídeo"
 * nas configurações, vídeo na resposta do Duo e Suporte → Tutoriais.
 * Gravar com COM_MOUSE=1 — sem ele o headless não tem hover e a dica não aparece.
 * A resposta do Duo é respondida localmente (não gasta IA). Nada é gravado.
 */
const { ENCERRAMENTO, abrirConfigEtapa } = require('./_comum');

const PLAYER = 'section[aria-label^="Vídeo-tutorial"]';
const CHAT = '[aria-label="Chat com o Duo"]';

// Para o mouse em cima do botão (o cursor desenhado vai junto) e espera a dica.
async function pararEm(h, sel, texto) {
  const c = await h.p.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (e.innerText || '').trim().startsWith(t));
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel, texto);
  await h.ir(c.x, c.y, 900);
  await h.dorme(1300);
}

module.exports = {
  canal: 'todos',
  titulo: 'Como achar o vídeo de cada tela',
  rota: '/crm',
  simular: [[/\/chat-financeiro\/historico/, () => []]],
  responder: [[/\/chat-financeiro\/mensagem/, { resposta: 'É no CRM: clique em **Importar**, escolha a planilha e confira as colunas antes de importar. Quem já está no funil não é duplicado.\n\n[[video:importar-planilha]]' }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como achar, em cada tela, um vídeo curto mostrando como fazer o que você precisa.',
      acao: (h) => h.cartaz('Ajuda em vídeo, na própria tela', 'Cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'Em vários botões, basta parar o mouse em cima por um instante. No CRM, por exemplo, no botão Importar.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(400);
        await pararEm(h, 'button', 'Importar');
        await h.destacar('[role=tooltip]', '', { folga: 5 }).catch(() => {});
      },
    },
    {
      fala: 'Aparece o Ver como funciona. Clique, e a Lena mostra o passo a passo, num canto da tela, com narração e legenda, enquanto você continua trabalhando.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('[role=tooltip] button', 'Ver como funciona', { ms: 700 });
        await h.dorme(2500);
        await h.destacar(PLAYER, '', { folga: 5 }).catch(() => {});
      },
    },
    {
      fala: 'Se o vídeo estiver na frente, minimize: ele continua tocando, numa faixa pequena. Também dá para levar para o outro lado da tela.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button[aria-label="Minimizar vídeo"]', '', { ms: 700 });
        await h.dorme(1800);
        await h.clicar('button[aria-label="Mostrar o vídeo"]', '', { ms: 700 });
        await h.dorme(900);
        await h.clicar('button[aria-label="Levar o vídeo para a esquerda"]', '', { ms: 700 });
        await h.dorme(1200);
        await h.clicar('button[aria-label="Fechar vídeo"]', '', { ms: 700 });
      },
    },
    {
      fala: 'Depois que você assiste, a dica daquele botão não aparece mais. Se preferir não ver, clique em Não mostrar de novo.',
      acao: async (h) => {
        await pararEm(h, 'button', 'E-mail');
        await h.destacar('[role=tooltip] button', 'Não mostrar', { folga: 4 }).catch(() => {});
        await h.dorme(1500);
        await h.semDestaque();
        await h.clicar('[role=tooltip] button', 'Não mostrar', { ms: 600 }).catch(() => {});
      },
    },
    {
      fala: 'Nas configurações, procure o Ver em vídeo, ao lado do título de cada parte. Ele também funciona no celular.',
      acao: async (h) => {
        await abrirConfigEtapa(h, 'Novos Leads');
        await h.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Ver em vídeo'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(900);
        await h.destacar('button', 'Ver em vídeo', { folga: 4 });
        await h.dorme(1800);
        await h.semDestaque();
        await h.clicar('button', 'Cancelar', { ms: 700 });
      },
    },
    {
      fala: 'E você pode perguntar ao Duo: como eu faço tal coisa? Quando existe um vídeo sobre o assunto, ele vem junto com a resposta.',
      acao: async (h) => {
        await h.dorme(500);
        await h.clicar('button[aria-label="Abrir o chat com o Duo"]', '', { ms: 800 });
        await h.dorme(900);
        await h.clicar('textarea[aria-label="Mensagem para o Duo"], input[aria-label="Mensagem para o Duo"]', '', { ms: 600 });
        await h.digitar('Como importo uma planilha de leads?', 40);
        await h.p.keyboard.press('Enter');
        await h.dorme(1800);
        await h.destacar(`${CHAT} button`, 'Como importar', { folga: 4 }).catch((e) => console.log('  destaque:', e.message));
      },
    },
    {
      fala: 'E todos os vídeos ficam em Suporte, na aba Tutoriais, separados por assunto.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button[aria-label="Fechar o chat"]', '', { ms: 600 });
        await h.dorme(400);
        await h.clicar('a[href$="/suporte"]', '', { ms: 800 });
        await h.dorme(1200);
        await h.clicar('button', 'Tutoriais', { ms: 700 });
        await h.dorme(3000);
      },
    },
    ENCERRAMENTO,
  ],
};
