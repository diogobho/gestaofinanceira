/**
 * Versão do número oficial (Enterprise) de `cadencia-etapa`: cada passo ganha o
 * "Modelo de reserva" para quando a janela de 24h do lead estiver fechada.
 */
const base = require('./cadencia-etapa');
const canalOficial = require('./_canal-oficial');

const MODAL = '.fixed.inset-0';
const RESERVA = `${MODAL} [class*="border-emerald-200"]`;
const passos = base.passos.filter((p) => !p.fala.startsWith('Lembrando: no WhatsApp conectado por QR Code'));
passos[0] = { ...passos[0], acao: (h) => h.cartaz(base.titulo, 'WhatsApp oficial · Enterprise') };
const depoisDoAgente = passos.findIndex((p) => p.fala.startsWith('No tipo de mensagem')) + 1;
passos.splice(depoisDoAgente, 0, {
  fala: 'No número oficial, cada passo tem também um Modelo de reserva. Se o lead não escreveu nas últimas 24 horas, é esse modelo aprovado que sai no lugar da mensagem.',
  acao: async (h) => {
    // O bloco do passo novo é o último (os dois passos antigos estão fechados).
    await h.p.evaluate((s) => { const b = [...document.querySelectorAll(s)].pop(); b.setAttribute('data-v-reserva', '1'); b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, RESERVA);
    await h.dorme(800);
    await h.destacar('[data-v-reserva]', '', { folga: 4 });
    await h.dorme(1800);
    await h.escolher('[data-v-reserva] select', 'retomada_conversa');
  },
});

module.exports = { ...base, canal: 'oficial', simular: canalOficial, passos };
