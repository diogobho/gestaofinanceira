/**
 * Comandos do Duo (23/10/2026): a tela de comandos por frente, o "Usar no Duo" e um
 * disparo personalizado pelo histórico de cada lead, do pedido ao "sim". Respostas
 * simuladas (_chat-duo); nada sai. Leads fictícios da demo.
 */
const { ENCERRAMENTO } = require('./_comum');
const { HISTORICO, respostasDoDuo, mandar } = require('./_chat-duo');

const PEDIDO = 'Leia a conversa de cada lead da etapa Proposta Enviada do funil Comercial e prepare uma mensagem para cada um, convidando para uma conversa de 15 minutos. Me mostre antes de disparar.';

const RESPOSTAS = respostasDoDuo([
  ['proposta enviada', 'Li as 2 conversas da etapa Proposta Enviada. Mensagens:\n\n- **Rafael Souza**: "Oi Rafael! Você comentou que queria começar ainda este mês. Topa 15 minutos amanhã para fechar os detalhes?"\n- **Camila Rocha**: "Oi Camila! Sobre a sua dúvida do parcelamento, consigo te explicar em 15 minutinhos. Que horário fica bom?"\n\nDisparo agora ou agendo?'],
  ['amanhã às 9h', 'Preparei o disparo: **2 mensagens personalizadas**, começando amanhã às 9h, uma a cada 45 a 90 segundos. Depois de receber, cada lead vai para **Fechamento**. Posso confirmar?'],
  ['sim', 'Disparo agendado! Amanhã às 9h as mensagens saem pelo seu WhatsApp. Você acompanha na tela de Disparos, ou me pergunte: como estão meus disparos?'],
]);

const aba = async (h, nome) => { await h.semDestaque(); await h.clicar('[role=tab]', nome, { ms: 800 }); await h.dorme(700); };

module.exports = {
  canal: 'todos',
  titulo: 'Comandos do Duo: o que pedir e como usar',
  rota: '/comandos-duo',
  simular: [HISTORICO],
  responder: [RESPOSTAS],
  passos: [
    {
      fala: 'Neste vídeo, você vai conhecer os principais comandos do Duo, e ver um disparo personalizado feito por ele.',
      acao: (h) => h.cartaz('Comandos do Duo', 'O que pedir e como usar · cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'No menu, abra Comandos do Duo. Os comandos estão separados por área: CRM, WhatsApp, tarefas, financeiro, clientes e textos.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.destacar('[role=tablist]', '', { folga: 8 }); },
    },
    {
      fala: 'O que está entre colchetes você troca pelo nome do lead, do funil ou da etapa. E os marcados com pede confirmação só gravam depois do seu sim.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('li', 'Criar lead', { folga: 2 }).catch(() => h.destacar('li', '', { folga: 2 })); },
    },
    {
      fala: 'Veja o WhatsApp. Aqui está o disparo personalizado: o Duo lê a conversa de cada lead e escreve uma mensagem diferente para cada um.',
      acao: async (h) => { await aba(h, 'WhatsApp'); await h.destacar('li', 'Disparo personalizado', { folga: 2 }); },
    },
    {
      fala: 'Clique em usar no Duo. O comando vai para o chat, e você ajusta antes de mandar.',
      acao: async (h) => { await h.semDestaque(); await h.clicar('button[aria-label^="Usar no Duo: Disparo personalizado"]', '', { ms: 900 }); await h.dorme(1200); },
      pausa: 600,
    },
    {
      fala: 'Com a etapa e o funil escolhidos, ele lê as conversas e mostra cada mensagem antes de qualquer envio.',
      acao: async (h) => { await mandar(h, PEDIDO, { atraso: 6 }); await h.dorme(1500); await h.destacar('[role=dialog] .prose', 'Li as 2', { folga: 4 }).catch(() => {}); },
      pausa: 1500,
    },
    {
      fala: 'Diga quando disparar e para onde mover os leads depois. Ele resume tudo e pergunta se pode.',
      acao: async (h) => { await h.semDestaque(); await mandar(h, 'Pode disparar amanhã às 9h e depois mover para Fechamento'); await h.dorme(1200); await h.destacar('[role=dialog] .prose', 'Preparei', { folga: 4 }).catch(() => {}); },
      pausa: 1200,
    },
    {
      fala: 'Responda sim, e o disparo fica agendado, com o intervalo que protege o seu número.',
      acao: async (h) => { await h.semDestaque(); await mandar(h, 'sim', { atraso: 80 }); await h.dorme(900); await h.destacar('[role=dialog] .prose', 'Disparo agendado', { folga: 4 }).catch(() => {}); },
      pausa: 900,
    },
    {
      fala: 'Usa o Duo no Claude? O botão copiar leva o comando para colar lá. Os comandos são os mesmos.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button[aria-label="Fechar o chat"]', '', { ms: 700 }); await h.dorme(600);
        await aba(h, 'Financeiro');
        await h.destacar('button[aria-label^="Copiar"]', '', { folga: 4 });
      },
      pausa: 600,
    },
    ENCERRAMENTO,
  ],
};
