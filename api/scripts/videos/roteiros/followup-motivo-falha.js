/**
 * Follow-up que não saiu: o card mostra o motivo real (utils/followupErros.ts) e deixa reagendar,
 * avisando quando reagendar não resolve. Os três falhados da Fernanda são simulados; o
 * Reagendar é respondido localmente. Nada é enviado.
 */
const { ENCERRAMENTO } = require('./_comum');

const PAINEL = '.border-t.bg-amber-50';
const ITEM = '[class*="border-red-200"][class*="bg-red-50"]';
const h0 = (dias, hora) => { const d = new Date(Date.now() - dias * 864e5); d.setUTCHours(hora + 3, 0, 0, 0); return d.toISOString(); };
const base = { lead_id: 0, usuario_id: 55, empresa_id: 31, mensagem: 'Oi Fernanda, tudo bem?', instrucao_ia: null, media_url: null, media_mimetype: null,
  media_filename: null, status: 'falhou', enviado_at: null, dias_semana: [1, 2, 3, 4, 5], tentativas: 3 };
const FALHADOS = [
  { ...base, id: 9301, tipo: 'manual', origem: 'lead', agendado_para: h0(1, 10), erro_categoria: 'transitorio',
    erro: 'Timeout ao falar com o provedor do WhatsApp' },
  { ...base, id: 9302, tipo: 'agente_ia', origem: 'estagio', agendado_para: h0(2, 9), erro_categoria: 'canal_bloqueado',
    erro: 'Sessão do WhatsApp encerrada (logged out)' },
  { ...base, id: 9303, tipo: 'manual', origem: 'estagio', agendado_para: h0(3, 9), erro_categoria: 'conflito_config',
    erro: 'Este contato nunca escreveu para você, e o primeiro contato só sai pelo número oficial da Meta. O responsável por este lead está no WhatsApp por QR Code: conecte o número oficial dele ou passe o lead para quem já está no oficial. A cadência volta a valer para ele assim que o contato responder.' },
];

const marcarItem = (h, i) => h.p.evaluate((s, i) => {
  const el = document.querySelectorAll(s)[i];
  document.querySelectorAll('[data-v-item]').forEach((e) => e.removeAttribute('data-v-item'));
  el.setAttribute('data-v-item', '1'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, ITEM, i);

module.exports = {
  canal: 'todos',
  titulo: 'Por que um follow-up não saiu, e como resolver',
  rota: '/crm',
  simular: [[/\/crm\/leads\/\d+\/followups$/, (atual) => [...(Array.isArray(atual) ? atual.filter((f) => f.status !== 'falhou') : []), ...FALHADOS]]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver onde aparece o motivo de um follow-up que não saiu, e como saber se adianta reagendar.',
      acao: (h) => h.cartaz('Por que o follow-up não saiu', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Abra o card do lead, e clique em Follow-up, no rodapé. Os envios que não saíram ficam em Falhados, em vermelho.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(500);
        await h.clicar('div,h4,p,span', 'Fernanda Lima', { ms: 1100 });
        await h.dorme(600);
        await h.clicar('button', 'Follow-up', { ms: 900 });
        await h.dorme(900);
        await h.p.evaluate(() => [...document.querySelectorAll('p')].find((p) => p.innerText.trim() === 'Falhados:')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(900);
        await h.destacar(`${PAINEL} div.space-y-1\\.5`, 'Falhados', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Cada um diz o motivo, em português. Este aqui foi uma instabilidade passageira. Nesse caso, reagendar resolve.',
      acao: async (h) => {
        await h.semDestaque();
        await marcarItem(h, 0);
        await h.dorme(700);
        await h.destacar('[data-v-item]', '', { folga: 4 });
      },
    },
    {
      fala: 'Clique em Reagendar. A sugestão é daqui a uma hora, e você pode mudar. Confirme, e ele volta para a fila.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('[data-v-item] button', 'Reagendar', { ms: 700 });
        await h.dorme(1600);
        // Reagendado, ele sai de Falhados e volta para a fila de pendentes.
        const nova = new Date(Date.now() + 36e5).toISOString();
        h.simular(/\/crm\/leads\/\d+\/followups$/, (j) => j.map((f) => (f.id === 9301 ? { ...f, status: 'pendente', erro: null, erro_categoria: null, agendado_para: nova } : f)));
        await h.clicar('[data-v-item] button', 'Confirmar', { ms: 700 });
        await h.dorme(900);
      },
    },
    {
      fala: 'Já neste, o número do responsável estava desconectado. A linha em vermelho diz o que fazer: reconectar o número. Reagendar antes disso só daria a mesma falha.',
      acao: async (h) => {
        await marcarItem(h, 0);
        await h.dorme(700);
        await h.destacar('[data-v-item] p.font-medium', '', { folga: 4 });
      },
    },
    {
      fala: 'E aqui, o contato nunca escreveu para você. O primeiro contato só sai pelo número oficial. Ele volta a valer sozinho, assim que a pessoa responder.',
      acao: async (h) => {
        await h.semDestaque();
        await marcarItem(h, 1);
        await h.dorme(700);
        await h.destacar('[data-v-item]', '', { folga: 4 });
      },
    },
    {
      fala: 'Resumindo: leia o motivo antes de reagendar. Se a causa ainda estiver lá, resolva primeiro, e só depois reagende.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(400); },
    },
    ENCERRAMENTO,
  ],
};
