/**
 * Conversar com o lead pelo card (chamados #173, #188, #111, #44, #45, #176): responder
 * citando, reagir, gravar áudio, anexar — e o balão vermelho quando não sai.
 */
const { ENCERRAMENTO } = require('./_comum');
const { criarConversa, acaoNoBalao } = require('./_conversa');

const conversa = criarConversa();

const passos = [
  {
    fala: 'Neste vídeo, você vai ver como conversar com o lead pelo próprio card, sem precisar abrir o celular.',
    acao: (h) => h.cartaz('Como conversar com o lead pelo card', 'WhatsApp por QR Code'),
    pausa: 300,
  },
  {
    fala: 'Abra o card do lead e clique na aba WhatsApp. A conversa toda fica aqui, igual ao celular.',
    acao: async (h) => {
      await h.tirarCartaz(); await h.dorme(300);
      await h.clicar('div,h4,p,span', 'Eduardo Freitas', { ms: 900 });
      await h.dorme(900);
      await h.clicar('button', 'WhatsApp', { ms: 800 });
    },
  },
  {
    fala: 'Para responder uma mensagem específica, passe o mouse sobre ela e clique na setinha de Responder.',
    acao: async (h) => { await h.dorme(900); await acaoNoBalao(h, 'dá para fazer em 3 vezes', 'Responder'); },
  },
  {
    fala: 'Escreva a resposta e aperte Enter. O lead recebe a mensagem citando a pergunta dele.',
    acao: async (h) => {
      await h.dorme(400);
      await h.digitar('Dá sim! Em até 3 vezes no cartão, sem juros.', 38);
      conversa.estado.respondeu = true;
      await h.p.keyboard.press('Enter');
    },
  },
  {
    fala: 'Para reagir, clique na carinha ao lado da mensagem e escolha o emoji. A reação aparece no WhatsApp do lead.',
    acao: async (h) => {
      await h.dorme(1200);
      await acaoNoBalao(h, 'Vi a proposta que você mandou', 'Reagir');
      await h.dorme(900);
      conversa.estado.reagiu = true;
      await h.clicar('button[role=menuitem]', '👍', { ms: 600 });
    },
  },
  {
    fala: 'Para mandar áudio, clique no microfone e fale. Clique de novo para parar, e depois em enviar.',
    acao: async (h) => {
      await h.dorme(900);
      await h.clicar('button[title="Gravar áudio"]', '', { ms: 800 });
      await h.dorme(2600);
      await h.clicar('button[title="Parar gravação"]', '', { ms: 400 });
      await h.dorme(900);
      conversa.estado.audio = true;
      await h.p.evaluate(() => { const i = document.querySelector('input[placeholder="Legenda (opcional)..."]'); i.nextElementSibling.setAttribute('data-v-enviar', '1'); });
      await h.clicar('button[data-v-enviar]', '', { ms: 700 });
    },
  },
  {
    fala: 'No clipe, você anexa foto, vídeo ou documento, do mesmo jeito.',
    acao: async (h) => { await h.dorme(1200); await h.destacar('button[title="Anexar arquivo"]', '', { folga: 6 }); },
  },
  {
    fala: 'Se uma mensagem não sair, o balão fica vermelho com o motivo. O mais comum é número digitado errado, ou telefone fixo, que não tem WhatsApp. Aí, é só corrigir o número no card.',
    acao: async (h) => { await h.semDestaque(); await h.dorme(300); },
  },
  ENCERRAMENTO,
];

module.exports = { canal: 'qr', titulo: 'Como conversar com o lead pelo card', rota: '/crm', simular: [conversa.simulacao], passos, conversa };
