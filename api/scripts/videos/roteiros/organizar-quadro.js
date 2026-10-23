/**
 * Organizar o quadro (chamados #59 e #196): ordem dos cards, filtros e tags no card.
 * A demo não tem tags: a lista simula duas, e aplicar "Workshop" na Mariana aparece no
 * card e no filtro por tag (nada é gravado).
 */
const { ENCERRAMENTO } = require('./_comum');

const TAG = { id: 901, usuario_id: 55, nome: 'Workshop', cor: '#8b5cf6', created_at: '2026-10-01T12:00:00Z' };
const TAGS = [TAG, { id: 902, usuario_id: 55, nome: 'Indicação', cor: '#10b981', created_at: '2026-10-01T12:00:00Z' }];
let aplicada = false; // vira true quando o vídeo aplica a tag
let ultimaLista = [];
const comTag = (l) => (l && l.nome === 'Mariana Castro' && aplicada ? { ...l, tags: [TAG] } : l);

module.exports = {
  canal: 'todos',
  titulo: 'Como organizar o quadro: ordem, filtros e tags',
  rota: '/crm',
  simular: [
    [/\/crm\/tags(\?|$)/, () => TAGS],
    [/\/crm\/(funis\/42\/leads|estagios\/\d+\/leads|leads\/\d+(\?|$))/, (json, url) => {
      // Filtro pela tag simulada: o servidor não a conhece e devolve vazio; monta a partir
      // da última lista completa do funil (o quadro também busca por etapa).
      if (Array.isArray(json) && /[?&]tags=/.test(url)) {
        const etapa = (url.match(/estagios\/(\d+)\/leads/) || [])[1];
        const achados = ultimaLista.map(comTag).filter((l) => l.tags?.some((t) => t.id === TAG.id) && (!etapa || String(l.estagio_id) === etapa));
        return achados.map((l) => ({ ...l, total_no_estagio: String(achados.filter((o) => o.estagio_id === l.estagio_id).length) }));
      }
      if (Array.isArray(json) && /estagios\/\d+\/leads/.test(url)) return json.map(comTag);
      if (Array.isArray(json)) { ultimaLista = json; return json.map(comTag); }
      if (json && json.data && !Array.isArray(json.data)) return { ...json, data: comTag(json.data) };
      return comTag(json);
    }],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como organizar o quadro do CRM, para achar rápido o lead certo.',
      acao: (h) => h.cartaz('Como organizar o quadro: ordem, filtros e tags', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Comece pela ordem dos cards. Aqui, você escolhe como eles aparecem em cada coluna. Por exemplo, Última mensagem primeiro, para ver no topo quem falou com você por último.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.p.evaluate(() => { const s = [...document.querySelectorAll('select')].find((e) => [...e.options].some((o) => o.text === 'Ordem manual')); s.setAttribute('data-v-ordem', '1'); });
        await h.destacar('select[data-v-ordem]', '', { folga: 5 });
        await h.dorme(900);
        await h.escolher('select[data-v-ordem]', 'Última mensagem primeiro');
      },
    },
    {
      fala: 'Também dá para ordenar pelo maior valor, pelos mais quentes, ou pela data de entrada.',
      acao: async (h) => { await h.dorme(1500); await h.escolher('select[data-v-ordem]', 'Maior valor primeiro'); },
    },
    {
      fala: 'Em Filtros, você vê só o que interessa agora. Os leads quentes, os com tarefa atrasada, ou os que mandaram mensagem e ainda não foram lidos.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Filtros', { ms: 800 });
        await h.dorme(1200);
        await h.clicar('button', 'Quente', { ms: 800 });
        await h.dorme(1500);
        await h.clicar('button', 'Quente', { ms: 600 }); // desliga de novo
        await h.p.keyboard.press('Escape');
      },
    },
    {
      fala: 'E as tags marcam o que é importante para você, como a origem do lead ou o produto. Abra o card, e clique em Adicionar tag.',
      acao: async (h) => {
        await h.p.mouse.click(1300, 820); await h.dorme(400); // fecha o painel de filtros, se ficou aberto
        await h.clicar('div,h4,p,span', 'Mariana Castro', { ms: 900 });
        await h.dorme(1000);
        await h.clicar('button', 'Adicionar tag', { ms: 800 });
      },
    },
    {
      fala: 'Digite o nome e aperte Enter. Se a tag ainda não existir, o Duo cria na hora.',
      acao: async (h) => {
        await h.dorme(400);
        await h.digitar('Work', 120);
        await h.dorme(900);
        aplicada = true;
        await h.p.keyboard.press('Enter');
        await h.dorme(1200);
        await h.destacar('div', 'Tags', { folga: 6 }).catch(() => {});
      },
    },
    {
      fala: 'Depois, em Filtros, é só escolher a tag para ver todos os leads que têm ela.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.keyboard.press('Escape'); await h.dorme(300);
        await h.clicarPonto({ x: 1074, y: 229 }, { ms: 600 }).catch(() => {}); // X do card
        await h.dorme(800);
        await h.clicar('button', 'Filtros', { ms: 800 });
        await h.dorme(900);
        await h.p.evaluate(() => { const p = [...document.querySelectorAll('div')].find((d) => (d.innerText || '').startsWith('Filtrar Leads') && d.scrollHeight > d.clientHeight); if (p) p.scrollTop = p.scrollHeight; });
        await h.dorme(1200);
        await h.centro('button', 'Workshop'); // rola até a tag; mede de novo depois que a rolagem assenta
        await h.dorme(700);
        await h.clicarPonto(await h.centro('button', 'Workshop'), { ms: 800 });
        await h.dorme(1500);
      },
    },
    ENCERRAMENTO,
  ],
};
