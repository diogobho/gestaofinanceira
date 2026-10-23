/**
 * Follow-up automático de uma etapa (cadência): abrir "Configurar estágio", ver os passos,
 * adicionar um passo com o Agente IA, mover depois do último passo e salvar.
 * Usa a etapa "Novos Leads" da demo, que já tem 2 passos. O Salvar não grava nada.
 */
const MODAL = '.fixed.inset-0';
const rolarAte = (h, sel, texto) => h.p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (e.innerText || '').trim().startsWith(t));
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, sel, texto || '');

module.exports = {
  canal: 'qr', // 'todos' | 'qr' (Profissional, e Enterprise no QR) | 'oficial'
  titulo: 'Como montar o follow-up automático de uma etapa',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como montar uma sequência de mensagens automáticas para uma etapa do funil.',
      acao: (h) => h.cartaz('Como montar o follow-up automático de uma etapa', 'WhatsApp por QR Code'),
      pausa: 300,
    },
    {
      fala: 'No CRM, clique nos três pontinhos da etapa, e depois em Configurar estágio.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        const menu = await h.p.evaluate(() => {
          const t = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Novos Leads');
          const bts = [...t.closest('div').parentElement.querySelectorAll('button')];
          const r = bts[bts.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await h.clicarPonto(menu, { ms: 1000 });
        await h.dorme(700);
        await h.clicar('button', 'Configurar estágio', { ms: 700 });
      },
    },
    {
      fala: 'Desça até Follow-up automático. Cada passo é uma mensagem, com o dia em que ela sai. Esta etapa já tem dois.',
      acao: async (h) => {
        await h.dorme(900);
        await rolarAte(h, 'button', 'Adicionar passo');
        await h.dorme(900);
        await h.destacar('button', '1\nPasso 1', { folga: 4 });
        await h.dorme(1400);
        await h.destacar('button', '2\nPasso 2', { folga: 4 });
      },
    },
    {
      fala: 'Para incluir mais um, clique em Adicionar passo.',
      acao: async (h) => { await h.semDestaque(); await h.clicar('button', 'Adicionar passo', { ms: 800 }); await h.dorme(700); await rolarAte(h, 'label', 'Quando enviar'); },
    },
    {
      fala: 'Escolha se ele conta a partir da mensagem anterior ou da entrada na etapa. Depois, diga depois de quantos dias, e em que horário.',
      acao: async (h) => {
        await h.dorme(400);
        await h.destacar('button', 'Após a mensagem anterior', { folga: 5 });
        await h.dorme(2000);
        await h.semDestaque();
        await h.clicar('input[type=number]', '', { dentro: MODAL, ms: 700 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('a'); await h.p.keyboard.up('Control');
        await h.digitar('5', 120);
        // A linha "Após [n] dia(s) às [hora]" do passo novo (o único aberto): a que contém o input numérico.
        await h.p.evaluate((m) => { const i = document.querySelector(m).querySelector('input[type=number]'); i.closest('div.flex').setAttribute('data-v-quando', '1'); }, MODAL);
        await h.destacar('[data-v-quando]', '', { folga: 6 });
      },
    },
    {
      fala: 'No tipo de mensagem, você escolhe um texto fixo, ou o Agente IA, que escreve olhando a conversa com o lead. Aqui, vou dar a instrução para o agente.',
      acao: async (h) => {
        await h.semDestaque();
        await rolarAte(h, 'label', 'Agente IA');
        await h.dorme(700);
        await h.destacar('label', 'Agente IA', { dentro: MODAL, folga: 5 });
        await h.dorme(1800);
        await h.semDestaque();
        await h.clicar('textarea', '', { dentro: MODAL, ms: 700 });
        await h.digitar('Pergunte se ficou alguma dúvida e ofereça um horário para conversar.', 32);
      },
    },
    {
      fala: 'Lá em cima, em Após enviar a mensagem agendada, escolha para qual etapa o lead vai depois do último passo.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Após enviar a mensagem agendada');
        await h.dorme(900);
        await h.p.evaluate(() => {
          const l = [...document.querySelectorAll('label')].find((e) => (e.innerText || '').startsWith('Após enviar a mensagem agendada'));
          const s = l.parentElement.nextElementSibling; s.setAttribute('data-v-mover', '1');
        });
        await h.destacar('select[data-v-mover]', '', { folga: 5 });
        await h.escolher('select[data-v-mover]', 'Primeiro Contato');
      },
    },
    {
      fala: 'Clique em Salvar. A partir daí, todo lead que entrar nesta etapa recebe a sequência sozinho.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(400); await h.clicar('button', 'Salvar', { ms: 900 }); },
    },
    {
      fala: 'Lembrando: no WhatsApp conectado por QR Code, o follow-up só é enviado para quem já conversou com você.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(300); },
    },
    {
      fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
      acao: async (h) => { await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
      pausa: 1200,
    },
  ],
};
