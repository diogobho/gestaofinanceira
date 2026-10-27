/**
 * E-mail marketing pelo CRM (chamados #53, #57, #58, #112, #113): destinatários, assunto
 * com variável, corpo com banner (que se ajusta à largura — #58), rodapé/assinatura,
 * preview e agendamento. A demo não tem lead com e-mail: a lista é simulada. Nada é enviado.
 */
const path = require('path');
const { ENCERRAMENTO, rolarAte } = require('./_comum');

const BANNER_LOCAL = '/var/www/apps/landing/assets/videos/tutoriais/demo/banner-workshop.png';
const BANNER_URL = 'https://duofuturo.tech/assets/videos/tutoriais/demo/banner-workshop.png';
const NOMES = ['Mariana Castro', 'Patrícia Gomes', 'Aline Barros', 'João Pedro Alves', 'Bruno Carvalho', 'Felipe Moraes', 'Fernanda Lima', 'Camila Duarte', 'Thiago Antunes', 'Ricardo Nunes', 'Eduardo Freitas', 'Sofia Mendes'];
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LEADS = NOMES.map((nome, i) => ({ id: 14625 - i, nome, email: `${sem(nome.split(' ')[0])}@exemplo.com`, empresa: null, estagio_nome: 'Novos Leads' }));
const MODAL = '.fixed.inset-0';

module.exports = {
  canal: 'todos',
  titulo: 'Como enviar um e-mail marketing pelo CRM',
  rota: '/crm',
  simular: [[/\/crm\/disparos-email\/leads/, () => ({ leads: LEADS, total: LEADS.length, paginas: 1 })]],
  responder: [[/\/crm\/email-images/, { url: BANNER_URL }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como mandar um e-mail marketing para os leads do funil, com banner e assinatura.',
      acao: (h) => h.cartaz('Como enviar um e-mail marketing pelo CRM', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No CRM, clique em E-mail. Escolha quem recebe: todo o funil, ou só os leads que você selecionar. Só entra quem tem e-mail cadastrado.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('button', 'E-mail', { ms: 900 });
        await h.dorme(1500);
        await h.destacar('div', '12', { folga: 4 }).catch(() => {});
        await h.dorme(1800);
        await h.semDestaque();
        await h.clicar('button', 'Continuar', { ms: 800 });
      },
    },
    {
      fala: 'Escreva o assunto. Primeiro Nome, entre colchetes, vira o nome de cada lead, e o e-mail chega personalizado.',
      acao: async (h) => {
        await h.dorme(900);
        await h.clicar(`${MODAL} input[type=text]`, '', { ms: 700 });
        await h.digitar('[PrimeiroNome], seu convite para o workshop', 45);
      },
    },
    {
      fala: 'No corpo, vale o mesmo. Escreva a mensagem e, para colocar um banner, clique no ícone de imagem e escolha o arquivo. Ele se ajusta sozinho à largura do e-mail, no computador e no celular.',
      acao: async (h) => {
        await h.dorme(500);
        await h.clicar(`${MODAL} .ProseMirror`, '', { ms: 700 });
        await h.digitar('Oi, [PrimeiroNome]! Você está convidado para o nosso workshop gratuito. Veja os detalhes:', 30);
        await h.p.keyboard.press('Enter');
        await h.clicar(`${MODAL} button[title="Fazer upload de imagem do computador"]`, '', { ms: 700 });
        const input = await h.p.$(`${MODAL} input[type=file][accept="image/*"]`);
        await input.uploadFile(BANNER_LOCAL);
        await h.dorme(1500);
      },
    },
    {
      fala: 'Lá embaixo, em Assinatura e Rodapé, fica a sua assinatura. Ela vem do seu perfil e entra no fim de todos os e-mails.',
      acao: async (h) => {
        await rolarAte(h, 'button', 'Assinatura / Rodapé'); await h.dorme(900);
        await h.clicar('button', 'Assinatura / Rodapé', { ms: 800 });
        await h.dorme(900);
        await h.destacar('button', 'Assinatura / Rodapé', { folga: 4 });
      },
    },
    {
      fala: 'Antes de enviar, abra o preview, e veja o e-mail do jeito que o lead vai receber.',
      acao: async (h) => {
        await h.semDestaque();
        await rolarAte(h, 'button', 'Ver preview do e-mail'); await h.dorme(800);
        await h.clicar('button', 'Ver preview do e-mail', { ms: 800 });
        await h.dorme(900);
        await h.p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => (e.innerText || '').startsWith('Ocultar preview')); b?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      },
    },
    {
      fala: 'Se quiser, marque Agendar para depois, e escolha o dia e a hora. Por fim, clique em Agendar, ou em Enviar, se for agora.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Agendar para depois'); await h.dorme(900);
        await h.clicar('label', 'Agendar para depois', { ms: 800 });
        await h.dorme(500);
        await h.clicar(`${MODAL} input[type=datetime-local]`, '', { ms: 600 });
        await h.digitar('18102026', 90);
        await h.p.keyboard.press('Tab');
        await h.digitar('0900', 90);
        await h.dorme(500);
        await h.destacar('button', 'Agendar para', { folga: 5 }).catch(() => {});
      },
    },
    {
      fala: 'O nome que aparece como remetente é configurado uma vez só, em Config. E-mail, no menu.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.keyboard.press('Escape'); await h.dorme(300);
        await h.p.evaluate(() => { const b = [...document.querySelectorAll('.fixed.inset-0 button')].find((e) => e.querySelector('svg') && !e.innerText.trim() && e.getBoundingClientRect().y < 280); b?.click(); });
        await h.dorme(900);
        await h.destacar('a', 'Config. E-mail', { folga: 4 }).catch(() => {});
      },
    },
    ENCERRAMENTO,
  ],
};
