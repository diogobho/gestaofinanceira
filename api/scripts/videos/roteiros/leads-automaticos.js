/**
 * Lead novo entrando sozinho pelo WhatsApp (chamados #177 e #175): "Criar lead
 * automaticamente" no estágio de entrada, para quais números, e "Ao lead responder, mover para".
 */
const { rolarAte, abrirConfigEtapa, marcarPorTexto, ENCERRAMENTO, EQUIPE_COM_NUMERO } = require('./_comum');

module.exports = {
  canal: 'todos',
  titulo: 'Como fazer quem manda mensagem virar lead sozinho',
  rota: '/crm',
  simular: [EQUIPE_COM_NUMERO],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como fazer quem manda mensagem no seu WhatsApp virar lead sozinho, já dentro do funil.',
      acao: (h) => h.cartaz('Como fazer quem manda mensagem virar lead sozinho', 'Menos de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Escolha a etapa onde os contatos novos devem entrar. Normalmente, é a primeira. Clique nos três pontinhos e em Configurar estágio.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await abrirConfigEtapa(h, 'Novos Leads'); },
    },
    {
      fala: 'Marque Criar lead automaticamente.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Criar lead automaticamente'); await h.dorme(800);
        const sel = await marcarPorTexto(h, 'Criar lead automaticamente', 'data-v-auto');
        await h.clicar(`${sel} input`, '', { ms: 800 });
      },
    },
    {
      fala: 'Depois, escolha de quais números da equipe vêm esses contatos. Se não marcar nenhum, vale para todos.',
      acao: async (h) => {
        await h.dorme(400);
        await h.destacar('[data-v-auto]', '', { folga: 6 });
        await h.dorme(1200);
        await h.semDestaque();
        const sel = await marcarPorTexto(h, 'Ana Ribeiro', 'data-v-ana');
        await h.clicar(`${sel} input`, '', { ms: 800 });
      },
    },
    {
      fala: 'Pronto. Quando alguém que ainda não está no funil mandar mensagem para esse número, o card aparece nesta etapa, com o nome e o telefone.',
      acao: async (h) => { await h.dorme(300); },
    },
    {
      fala: 'Se a pessoa já tem um card neste funil, o Duo não cria outro. Assim, nada fica duplicado.',
      acao: async (h) => { await h.dorme(300); },
    },
    {
      fala: 'Aproveite e configure, lá em cima, Ao lead responder, mover para. Assim, quem responde já avança de etapa sozinho.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Ao lead responder'); await h.dorme(900);
        await h.p.evaluate(() => {
          const l = [...document.querySelectorAll('label')].find((e) => (e.innerText || '').startsWith('Ao lead responder'));
          l.parentElement.nextElementSibling.setAttribute('data-v-resp', '1');
        });
        await h.destacar('select[data-v-resp]', '', { folga: 5 });
        await h.escolher('select[data-v-resp]', 'Primeiro Contato');
      },
    },
    {
      fala: 'Clique em Salvar, e está feito.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(300); await h.clicar('button', 'Salvar', { ms: 900 }); },
    },
    ENCERRAMENTO,
  ],
};
