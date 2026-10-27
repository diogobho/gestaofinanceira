/**
 * Versão do número oficial de `conversa-card`: a janela de 24h (aberta na conversa do
 * Eduardo, fechada no Ricardo) e o "Enviar modelo" quando ela fecha.
 */
const base = require('./conversa-card');
const canalOficial = require('./_canal-oficial');

const EDUARDO = 14618;
const janela = [/\/whatsapp\/canal\/janela/, (j, url) => (new RegExp(`lead_id=${EDUARDO}(&|$)`).test(url)
  ? { provedor: 'cloud_api', aberta: true, ultimaEntrada: new Date(Date.now() - 12 * 60000).toISOString(), restaSegundos: 23 * 3600 + 48 * 60 }
  : { provedor: 'cloud_api', aberta: false, ultimaEntrada: new Date(Date.now() - 3 * 86400000).toISOString(), restaSegundos: 0 })];

const passos = [...base.passos];
passos[0] = { ...passos[0], acao: (h) => h.cartaz(base.titulo, 'WhatsApp oficial · Enterprise') };
const depoisDeAbrir = passos.findIndex((p) => p.fala.startsWith('Abra o card do lead')) + 1;
passos.splice(depoisDeAbrir, 0, {
  fala: 'No número oficial, aqui em cima aparece a janela de 24 horas. Enquanto ela estiver aberta, você escreve à vontade.',
  acao: async (h) => { await h.dorme(900); await h.destacar('div', 'WhatsApp oficial · janela aberta', { folga: 4 }); await h.dorme(3200); await h.semDestaque(); },
});
const antesDoErro = passos.findIndex((p) => p.fala.startsWith('Se uma mensagem não sair'));
passos.splice(antesDoErro, 0,
  {
    fala: 'Mas, se o lead não escreveu nas últimas 24 horas, a janela fecha. Veja o Ricardo: aí, a Meta só entrega modelo aprovado.',
    acao: async (h) => {
      await h.semDestaque();
      await h.p.keyboard.press('Escape'); await h.dorme(300);
      await h.p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.querySelector('svg') && e.closest('.fixed.inset-0') && !e.innerText.trim() && e.getBoundingClientRect().y < 120); b?.click(); });
      await h.dorme(900);
      await h.clicar('div,h4,p,span', 'Ricardo Nunes', { ms: 900 });
      await h.dorme(900);
      await h.clicar('button', 'WhatsApp', { ms: 800 });
      await h.dorme(1000);
      await h.destacar('div', 'Janela de 24h fechada', { folga: 4 });
    },
  },
  {
    fala: 'Clique em Enviar modelo, escolha um dos seus modelos, confira o nome do lead, e envie.',
    acao: async (h) => {
      await h.semDestaque();
      await h.clicar('button', 'Enviar modelo', { ms: 800 });
      await h.dorme(1200);
      await h.p.evaluate(() => { const s = [...document.querySelectorAll('select')].find((e) => [...e.options].some((o) => o.text.startsWith('retomada_conversa'))); s.setAttribute('data-v-modelo', '1'); });
      await h.escolher('select[data-v-modelo]', 'retomada_conversa');
      await h.dorme(1200);
    },
  });

module.exports = { ...base, canal: 'oficial', simular: [...base.simular, ...canalOficial, janela], passos };
