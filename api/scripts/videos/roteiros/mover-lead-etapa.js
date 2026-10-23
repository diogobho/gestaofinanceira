/**
 * Mover o lead de etapa: arrastar no quadro, a barra de etapas que aparece ao arrastar
 * (para etapa fora da tela) e a troca pelo seletor dentro do card.
 * O "mover" não grava nada: h.simular() faz o GET do funil devolver o lead na etapa nova.
 */
const ETAPAS = { 278: 'Primeiro Contato', 279: 'Avaliação Agendada', 280: 'Proposta Enviada' };
// Vale para a lista do funil (array) e para o GET do lead aberto no card (objeto, puro ou em data).
// Recalcula total_no_estagio: sem isso a coluna de origem mostra "Carregar mais".
const mover = (nome, estagioId) => (json) => {
  const troca = (l) => (l && l.nome === nome
    ? { ...l, estagio_id: estagioId, estagio_nome: ETAPAS[estagioId], ordem_estagio: 0, is_entrada: false }
    : l);
  if (Array.isArray(json)) {
    const leads = json.map(troca);
    const total = {};
    leads.forEach((l) => { total[l.estagio_id] = (total[l.estagio_id] || 0) + 1; });
    return leads.map((l) => ({ ...l, total_no_estagio: String(total[l.estagio_id]) }));
  }
  if (json && json.data && !Array.isArray(json.data)) return { ...json, data: troca(json.data) };
  return troca(json);
};
const LEADS = /\/crm\/(funis\/42\/leads|leads\/\d+(\?|$))/;

// Centro do texto exato (o elemento mais interno), escolhendo o mais baixo ou o mais alto na tela.
const ponto = (h, texto, { maisBaixo = false } = {}) => h.p.evaluate((t, maisBaixo) => {
  const els = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim() === t && e.getBoundingClientRect().width > 0);
  els.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
  const el = maisBaixo ? els[els.length - 1] : els[0];
  const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, texto, maisBaixo);

module.exports = {
  canal: 'todos', // 'todos' | 'qr' (Profissional, e Enterprise no QR) | 'oficial'
  titulo: 'Como mover o lead de etapa no funil',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver três jeitos de mover um lead de etapa no funil.',
      acao: (h) => h.cartaz('Como mover o lead de etapa no funil', 'Menos de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No CRM, cada coluna é uma etapa do funil, e cada card é um lead.',
      acao: async (h) => { await h.tirarCartaz(); await h.p.evaluate(() => { // a coluna inteira: sobe do título até o bloco alto
          let el = [...document.querySelectorAll('h3')].find((e) => e.innerText.trim() === 'Novos Leads');
          while (el && el.getBoundingClientRect().height < 450) el = el.parentElement;
          el?.setAttribute('data-v-coluna', '1');
        });
        await h.destacar('[data-v-coluna]', '', { folga: 4 }); },
    },
    {
      fala: 'O jeito mais rápido é arrastar. Clique no card, segure, e solte na etapa seguinte. A Mariana vai para Primeiro Contato.',
      acao: async (h) => {
        await h.semDestaque();
        await h.dorme(1800);
        h.simular(LEADS, mover('Mariana Castro', 278));
        const de = await ponto(h, 'Mariana Castro');
        const col = await ponto(h, 'Primeiro Contato');
        await h.arrastar(de, { x: col.x, y: col.y + 75 }, { ms: 1600 });
      },
    },
    {
      fala: 'Repare que, enquanto você arrasta, aparece uma barra lá embaixo com todas as etapas. Ela ajuda quando a etapa de destino está fora da tela.',
      acao: async (h) => {
        await h.dorme(600);
        h.simular(LEADS, mover('Patrícia Gomes', 280));
        const de = await ponto(h, 'Patrícia Gomes');
        await h.ir(de.x, de.y, 700);
        await h.p.mouse.down(); await h.dorme(200);
        await h.p.mouse.move(de.x + 6, de.y + 6);
        await h.ir(de.x + 260, 700, 1300);
        await h.dorme(900);
        const chip = await ponto(h, 'Proposta Enviada', { maisBaixo: true });
        await h.destacar('div', 'Solte aqui', { folga: 4 }).catch(() => {});
        await h.ir(chip.x, chip.y, 1300);
        await h.dorme(900);
        await h.p.mouse.up();
        await h.semDestaque();
      },
    },
    {
      fala: 'Pronto: a Patrícia foi direto para Proposta Enviada, sem precisar rolar o quadro.',
      acao: async (h) => { await h.dorme(400); await h.p.evaluate(() => document.querySelector('[class*=overflow-x]')?.scrollBy({ left: 500, behavior: 'smooth' })); },
    },
    {
      fala: 'O terceiro jeito é pelo próprio card. Abra o lead e, logo abaixo do nome, clique na etapa e escolha a nova.',
      acao: async (h) => {
        await h.p.evaluate(() => document.querySelector('[class*=overflow-x]')?.scrollTo({ left: 0, behavior: 'smooth' }));
        await h.dorme(700);
        await h.clicar('div,h4,p,span', 'Aline Barros', { ms: 900 });
        await h.dorme(1200);
        h.simular(LEADS, mover('Aline Barros', 279));
        // O seletor de etapa do card é um <select> nativo: destaca, "clica" e troca o valor.
        await h.p.evaluate(() => {
          const el = [...document.querySelectorAll('select')].find((s) => s.getBoundingClientRect().width > 0 && [...s.options].some((o) => o.text.includes('Avaliação Agendada')));
          el.setAttribute('data-v-etapa', '1');
          const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await h.destacar('select[data-v-etapa]', '', { folga: 6 });
        await h.dorme(900);
        await h.escolher('select[data-v-etapa]', 'Avaliação Agendada');
        await h.dorme(1200);
      },
    },
    {
      fala: 'Em qualquer um dos três jeitos, as mensagens automáticas da etapa anterior são canceladas, e as da etapa nova começam a contar a partir de agora.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(1600); await h.p.keyboard.press('Escape'); },
    },
    {
      fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
      acao: async (h) => { await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
      pausa: 1200,
    },
  ],
};
