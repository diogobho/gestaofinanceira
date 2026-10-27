/**
 * Versão do número oficial (Enterprise) de `agendar-followup`: mesma tela, mais o
 * "Modelo de reserva" (migration 098), que sai no lugar da mensagem quando o lead
 * não escreveu nas últimas 24h. A demo "vira" oficial por simulação (_canal-oficial).
 */
const base = require('./agendar-followup');
const canalOficial = require('./_canal-oficial');

const RESERVA = '.border-t.bg-amber-50 [class*="border-emerald-200"]';
const passos = base.passos.filter((p) => !p.fala.startsWith('Lembrando: no WhatsApp conectado por QR Code'));
passos[0] = { ...passos[0], acao: (h) => h.cartaz(base.titulo, 'WhatsApp oficial · Enterprise') };
const confirmar = passos.findIndex((p) => p.fala.startsWith('Para terminar'));
passos.splice(confirmar, 0,
  {
    fala: 'No número oficial, aparece também o Modelo de reserva. Se o lead não escreveu nas últimas 24 horas, a Meta só entrega modelo aprovado, e é ele que sai no lugar da mensagem.',
    acao: async (h) => {
      await h.p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), RESERVA);
      await h.dorme(700);
      await h.destacar(RESERVA, '', { folga: 4 });
    },
  },
  {
    fala: 'Escolha um dos seus modelos aprovados. O primeiro nome do lead já entra sozinho na mensagem.',
    acao: async (h) => { await h.escolher(`${RESERVA} select`, 'retomada_conversa'); await h.dorme(900); },
  });

module.exports = { ...base, canal: 'oficial', simular: canalOficial, passos };
