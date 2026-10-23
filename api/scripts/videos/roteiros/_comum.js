/** Ações repetidas entre roteiros. */

// Rola suavemente até o primeiro elemento visível do seletor cujo texto começa com `texto`.
const rolarAte = (h, sel, texto = '') => h.p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (e.innerText || '').trim().startsWith(t));
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, sel, texto);

// Três pontinhos da coluna → "Configurar estágio".
async function abrirConfigEtapa(h, etapa) {
  const menu = await h.p.evaluate((nome) => {
    const t = [...document.querySelectorAll('h3')].find((e) => e.innerText.trim() === nome);
    const bts = [...t.closest('div').parentElement.parentElement.querySelectorAll('button')];
    const r = bts[bts.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, etapa);
  await h.clicarPonto(menu, { ms: 1000 });
  await h.dorme(700);
  await h.clicar('button', 'Configurar estágio', { ms: 700 });
  await h.dorme(900);
}

// Marca um checkbox pela etiqueta (o <label> que contém o texto) e devolve o seletor dele.
async function marcarPorTexto(h, texto, attr) {
  await h.p.evaluate((t, a) => {
    const l = [...document.querySelectorAll('label')].find((e) => (e.innerText || '').includes(t));
    l.setAttribute(a, '1');
  }, texto, attr);
  return `[${attr}]`;
}

const ENCERRAMENTO = {
  fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
  acao: async (h) => { await h.semDestaque(); await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
  pausa: 1200,
};

// A demo não tem número conectado: simula a Ana (e uma colega) com WhatsApp, para a lista
// "Para quais números?" aparecer como aparece para o cliente.
const EQUIPE_COM_NUMERO = [/\/crm\/usuarios(\?|$)/, (us) => (Array.isArray(us)
  ? [...us.map((u) => ({ ...u, whatsapp_porta: 39001 })), { id: 999055, nome: 'Bruno Lima', email: 'bruno@demo', whatsapp_porta: 39002 }]
  : us)];

module.exports = { rolarAte, abrirConfigEtapa, marcarPorTexto, ENCERRAMENTO, EQUIPE_COM_NUMERO };
