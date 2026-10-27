/**
 * Grupos do WhatsApp (só QR): aviso agendado para vários grupos e boas-vindas a quem entra.
 * A demo não tem chip: canal, grupos e o que o vídeo "salva" são simulados. Nada é enviado.
 */
const { ENCERRAMENTO } = require('./_comum');

const MODAL = '.fixed.inset-0.z-50';
const GRUPOS = [
  ['Workshop Vendas 2027 · Turma 1', 212], ['Workshop Vendas 2027 · Turma 2', 187], ['Workshop Vendas 2027 · Turma 3', 96],
  ['Clientes Clínica Vida Leve', 64], ['Equipe comercial', 8],
].map(([nome, participantes], i) => ({ id: `1203630000000${i}@g.us`, nome, participantes, soAdminsEnviam: false, souAdmin: true, descricao: null }));
const agora = new Date().toISOString();
const quando = '2026-10-18T12:00:00.000Z'; // 18/10, 9h de Brasília
const MSG = {
  id: 901, usuario_id: 55, usuario_nome: 'Ana Ribeiro', titulo: 'Lembrete do workshop',
  texto: '*Hoje é dia!* 🎉 O workshop começa às 19h. O link chega aqui no grupo meia hora antes.',
  media_url: null, media_mimetype: null, media_filename: null, mencionar_todos: false,
  grupos: GRUPOS.slice(0, 3).map(({ id, nome }) => ({ id, nome })), modo: 'agendada', agendado_para: quando, recorrencia: null,
  proxima_execucao: quando, ultima_execucao: null, ativa: true, intervalo_segundos: 30, total_enviados: 0, total_falhas: 0,
  campanha_id: null, campanha_nome: null, mencoes: [],
};
const BV = {
  id: 902, usuario_id: 55, usuario_nome: 'Ana Ribeiro', grupo_whatsapp_id: GRUPOS[0].id, grupo_nome: GRUPOS[0].nome,
  mensagem: '', ativa: true, delay_segundos: 60, mencionar: true, total_disparos: 0, ultimo_disparo_at: null, destino: 'grupo', mencoes: [],
};

module.exports = {
  canal: 'todos', // Grupos usam o chip por QR, mas valem também para quem tem o oficial (Enterprise)
  titulo: 'Como agendar mensagens e dar boas-vindas nos grupos',
  rota: '/crm',
  simular: [
    [/\/grupos\/canal/, () => ({ provedor: 'baileys', conectado: true, numero: '5511999990000' })],
    [/\/grupos\/lista/, () => GRUPOS],
    [/\/grupos\/mensagens$/, () => []],
    [/\/grupos\/boas-vindas$/, () => []],
    [/\/grupos\/crm$/, () => []],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como agendar um aviso para vários grupos do WhatsApp, e como receber quem entra com uma mensagem de boas-vindas.',
      acao: (h) => h.cartaz('Mensagens e boas-vindas nos grupos', 'Cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'No menu, clique em Grupos. Aparecem os grupos do WhatsApp que você conectou por QR Code.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'Grupos', { ms: 900 });
        await h.dorme(1500);
        await h.destacar('span', 'WhatsApp conectado', { folga: 5 }).catch(() => {});
      },
    },
    {
      fala: 'Na aba Mensagens, clique em Nova mensagem. Dê um nome, só para você achar depois, e marque os grupos que vão receber.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Nova mensagem', { ms: 800 });
        await h.dorme(900);
        await h.clicar(`${MODAL} input`, '', { ms: 600 });
        await h.digitar('Lembrete do workshop', 45);
        for (const g of GRUPOS.slice(0, 3)) { await h.clicar(`${MODAL} label`, g.nome, { ms: 550 }); await h.dorme(250); }
      },
    },
    {
      fala: 'Escreva o texto como escreveria no grupo. Asteriscos deixam em negrito, e dá para anexar imagem ou vídeo.',
      acao: async (h) => {
        await h.clicar(`${MODAL} textarea`, '', { ms: 700 });
        await h.digitar(MSG.texto, 28);
      },
    },
    {
      fala: 'Em Quando enviar, escolha Agendar, e coloque o dia e a hora. Também dá para Repetir, toda semana, nos dias que você marcar.',
      acao: async (h) => {
        await h.p.evaluate((m) => [...document.querySelectorAll(`${m} legend`)].find((e) => e.innerText.startsWith('Quando'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), MODAL);
        await h.dorme(800);
        await h.clicar(`${MODAL} button`, 'Agendar', { ms: 700 });
        await h.dorme(500);
        await h.clicar(`${MODAL} input[type=datetime-local]`, '', { ms: 600 });
        await h.digitar('18102026', 90); await h.p.keyboard.press('Tab'); await h.digitar('0900', 90);
        await h.dorme(400);
        await h.destacar(`${MODAL} button`, 'Repetir', { folga: 4 });
      },
    },
    {
      fala: 'Os grupos recebem um de cada vez, com um intervalo entre eles, para proteger o seu número. Clique em Salvar, e a mensagem fica na lista, com a data do próximo envio.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.getElementById('intervalo-grupos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(700);
        await h.destacar('#intervalo-grupos', '', { folga: 4 });
        await h.dorme(1800);
        await h.semDestaque();
        h.simular(/\/grupos\/mensagens$/, () => [MSG]);
        await h.clicar(`${MODAL} button`, 'Salvar', { ms: 700 });
        await h.dorme(1500);
        await h.destacar('li', 'Lembrete do workshop', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Agora, as boas-vindas. Na aba Boas-vindas, clique em Nova boas-vindas, e escolha o grupo.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Boas-vindas', { ms: 800 });
        await h.dorme(800);
        await h.clicar('button', 'Nova boas-vindas', { ms: 800 });
        await h.dorme(900);
        await h.escolher('#bv-grupo', GRUPOS[0].nome);
      },
    },
    {
      fala: 'Ela pode sair no grupo, marcando quem entrou, ou no privado de cada pessoa. No privado há risco de bloqueio, por isso o Duo espaça os envios e limita quantos saem por dia.',
      acao: async (h) => {
        await h.destacar('[role="radiogroup"]', '', { folga: 5 });
        await h.dorme(2600);
        await h.semDestaque();
        await h.clicar('[role="radio"]', 'No privado', { ms: 700 });
        await h.dorme(2600);
        await h.clicar('[role="radio"]', 'No grupo', { ms: 700 });
      },
    },
    {
      fala: 'O texto já vem pronto, e você ajusta como quiser. Embaixo, o exemplo mostra como a mensagem vai aparecer no WhatsApp.',
      acao: async (h) => {
        await h.p.evaluate(() => document.querySelector('.bg-\\[\\#efeae2\\]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(800);
        await h.destacar('.bg-\\[\\#efeae2\\]', '', { folga: 4 });
      },
    },
    {
      fala: 'Escolha quando enviar: quem entrar nesse intervalo recebe uma mensagem só, todos juntos. Clique em Salvar, e pronto: quem entrar no grupo já é recebido.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('#bv-atraso', '', { folga: 4 });
        await h.dorme(2200);
        await h.semDestaque();
        const texto = await h.p.evaluate((m) => document.querySelector(`${m} textarea`)?.value || '', MODAL);
        h.simular(/\/grupos\/boas-vindas$/, () => [{ ...BV, mensagem: texto }]);
        await h.clicar(`${MODAL} button`, 'Salvar', { ms: 700 });
        await h.dorme(1500);
        await h.destacar('li', GRUPOS[0].nome, { folga: 4 }).catch(() => {});
      },
    },
    ENCERRAMENTO,
  ],
};
