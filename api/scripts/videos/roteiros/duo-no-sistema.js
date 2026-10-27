/**
 * Usar o Duo dentro do sistema (23/10/2026): abrir o chat, perguntar, pedir uma ação,
 * confirmar com "sim" e os atalhos do topo. Respostas simuladas (_chat-duo); demo.
 */
const { ENCERRAMENTO } = require('./_comum');
const { HISTORICO, respostasDoDuo, mandar } = require('./_chat-duo');

const RESPOSTAS = respostasDoDuo([
  ['tarefas de hoje', 'Você tem 3 tarefas para hoje:\n\n- 10h: ligação com Mariana Castro\n- 14h: reunião com Eduardo Freitas\n- 16h: enviar proposta para Sofia Mendes\n\nNenhuma atrasada. Quer que eu reagende alguma?'],
  ['eduardo', 'Vou agendar a tarefa **"Ligação para Eduardo Freitas"** amanhã, 24/10, às 15h, com você como responsável. Ainda não gravei nada. Posso confirmar?'],
  ['sim', 'Pronto! A ligação com o Eduardo Freitas está agendada para amanhã às 15h. Ela já aparece no card dele e nas suas tarefas.'],
]);

module.exports = {
  canal: 'todos',
  titulo: 'Como usar o Duo, o assistente de IA, dentro do sistema',
  rota: '/dashboard',
  simular: [HISTORICO],
  responder: [RESPOSTAS],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como usar o Duo, o assistente de inteligência artificial que fica dentro do sistema.',
      acao: (h) => h.cartaz('Como usar o Duo dentro do sistema', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Em qualquer tela, clique no Duo, no canto de baixo à direita. Abre o chat.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.clicar('button[aria-label="Abrir o chat com o Duo"]', '', { ms: 1000 }); await h.dorme(900); },
    },
    {
      fala: 'Pergunte do jeito que você falaria com alguém da equipe. Por exemplo: quais são minhas tarefas de hoje?',
      acao: (h) => mandar(h, 'Quais são minhas tarefas de hoje?'),
      pausa: 1200,
    },
    {
      fala: 'Ele consulta o sistema com o seu login e responde na hora.',
      acao: async (h) => { await h.dorme(400); await h.destacar('[role=dialog] .prose', 'Você tem 3', { folga: 4 }).catch(() => {}); },
    },
    {
      fala: 'Também dá para pedir ações. Crie uma tarefa de ligação para o Eduardo Freitas amanhã às três da tarde.',
      acao: async (h) => { await h.semDestaque(); await mandar(h, 'Crie uma tarefa de ligação para o Eduardo Freitas amanhã às 15h'); },
      pausa: 1200,
    },
    {
      fala: 'Antes de gravar, o Duo sempre mostra o que vai fazer e pergunta se pode. Nada muda sem a sua confirmação.',
      acao: async (h) => { await h.dorme(300); await h.destacar('[role=dialog] .prose', 'Vou agendar', { folga: 4 }).catch(() => {}); },
    },
    {
      fala: 'Responda sim, e ele faz.',
      acao: async (h) => { await h.semDestaque(); await mandar(h, 'sim', { atraso: 80 }); await h.dorme(900); await h.destacar('[role=dialog] .prose', 'Pronto', { folga: 4 }).catch(() => {}); },
      pausa: 900,
    },
    {
      fala: 'No topo do chat, a lâmpada abre os comandos sugeridos, a moeda mostra os seus créditos, e as setas abrem o Duo em tela cheia.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('a[aria-label="Comandos do Duo"]', '', { folga: 4 }); await h.dorme(1600);
        await h.destacar('a[aria-label="Créditos do Duo"]', '', { folga: 4 }); await h.dorme(1600);
        await h.destacar('a[aria-label="Abrir em tela cheia"]', '', { folga: 4 });
      },
      pausa: 500,
    },
    {
      fala: 'O Duo só vê e faz o que você já pode no sistema, e nunca exclui nada.',
      acao: async (h) => { await h.semDestaque(); await h.cartaz('Seguro por padrão', 'Só o que você já pode no sistema · pede confirmação · nunca exclui'); },
      pausa: 600,
    },
    ENCERRAMENTO,
  ],
};
