/**
 * Piloto (03/10/2026): agendar um follow-up no card do lead.
 * Cada passo: `fala` (narração e legenda), `acao` (o que a tela faz enquanto se fala),
 * `atraso` (ms antes da ação começar) e `pausa` (respiro depois da fala).
 */
const PAINEL = '.border-t.bg-amber-50'; // painel "Agendar Follow-up" do card

module.exports = {
  canal: 'qr', // 'todos' | 'qr' (Profissional, e Enterprise no QR) | 'oficial'
  titulo: 'Como agendar um follow-up no card do lead',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como agendar um follow-up direto no card do lead. É bem rapidinho.',
      acao: (h) => h.cartaz('Como agendar um follow-up no card do lead', 'WhatsApp por QR Code'),
      pausa: 300,
    },
    {
      fala: 'No CRM, abra o card do lead que você quer acompanhar. Aqui, vou usar a Fernanda.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(500); await h.clicar('div,h4,p,span', 'Fernanda Lima', { ms: 1100 }); },
    },
    {
      fala: 'Lá embaixo, no rodapé do card, clique em Follow-up.',
      acao: async (h) => { await h.dorme(300); await h.clicar('button', 'Follow-up', { ms: 900 }); },
    },
    {
      fala: 'Em Quando enviar, escolha depois de quanto tempo a mensagem sai. Vou colocar dois dias, às nove da manhã.',
      acao: async (h) => {
        await h.destacar('div.flex.items-center.gap-2', 'Após', { dentro: PAINEL });
        await h.dorme(1600);
        await h.clicar('input[type=number]', '', { dentro: PAINEL, ms: 700 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('a'); await h.p.keyboard.up('Control');
        await h.digitar('2', 120);
      },
    },
    {
      fala: 'Os dias permitidos já vêm de segunda a sexta. Se o envio cair num fim de semana, ele passa para o próximo dia permitido.',
      acao: (h) => h.destacar('div', 'Dias permitidos', { dentro: PAINEL }),
    },
    {
      fala: 'Agora, escreva a mensagem. O botão Primeiro Nome coloca o nome de cada lead automaticamente.',
      acao: async (h) => {
        await h.destacar('div.pt-2.border-t', 'Tipo de mensagem', { dentro: PAINEL });
        await h.clicar('textarea', '', { dentro: PAINEL, ms: 700 });
        await h.digitar('Oi ');
        await h.clicar('button', '[PrimeiroNome]', { dentro: PAINEL, ms: 600 });
        await h.clicar('textarea', '', { dentro: PAINEL, ms: 500 });
        await h.p.keyboard.press('End');
        await h.digitar(', tudo bem? Conseguiu ver a proposta que te mandei?', 35);
      },
    },
    {
      fala: 'Se preferir, escolha Agente IA. Aí, a inteligência artificial escreve a mensagem olhando a conversa com o lead.',
      acao: async (h) => {
        await h.clicar('label', 'Agente IA', { dentro: PAINEL, ms: 700 });
        await h.dorme(4200);
        await h.clicar('label', 'Fixa / personalizada', { dentro: PAINEL, ms: 700 });
      },
    },
    {
      fala: 'Para terminar, clique em Confirmar agendamento. Pronto! O follow-up fica marcado no card, e você pode cancelar quando quiser.',
      acao: async (h) => { await h.semDestaque(); await h.clicar('button', 'Confirmar agendamento', { dentro: PAINEL, ms: 900 }); },
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
