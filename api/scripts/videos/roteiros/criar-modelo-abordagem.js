/**
 * Criar um modelo de mensagem de abordagem no número oficial (Enterprise). Sem modelo
 * aprovado, o número oficial só responde quem escreveu primeiro — por isso este é o passo
 * que destrava disparo, cadência e a primeira mensagem. Canal e modelos são simulados; o
 * envio para aprovação recebe o "ok" genérico do gerador (nada chega à Meta).
 */
const { ENCERRAMENTO } = require('./_comum');
const canalOficial = require('./_canal-oficial');

const MODAL = '.fixed.inset-0';
let estado = 'nenhum'; // nenhum → em_analise → aprovado

const CONTA = { id: 1, numero: '+55 11 3000-0031', nomeExibicao: 'Clínica Demo', ativo: true, origem: 'embedded_signup', qualidade: 'GREEN', conectado: true, erro: null, meu: true, daEmpresa: false };
const SAUDE = {
  saude: {
    numero: '+55 11 3000-0031', nomeExibido: 'Clínica Demo', statusNome: 'APPROVED', nomeNovo: null, statusNomeNovo: null,
    qualidade: 'GREEN', limite: 'TIER_250', verificacao: 'VERIFIED', status: 'CONNECTED', modo: 'LIVE', podeEnviar: 'AVAILABLE', pendencias: [],
  },
  wabaId: 'demo',
};
const NOVO = () => ({
  id: 'demo-convite', nome: 'convite_conversa', idioma: 'pt_BR', categoria: 'MARKETING',
  status: estado === 'aprovado' ? 'APPROVED' : 'PENDING', formato: 'POSITIONAL', cabecalho: null,
  corpo: 'Oi {{1}}, aqui é {{2}} da {{3}}.\nVi que você entrou no {{4}}. Separei 15 minutos esta semana para entender seu momento e te dizer, com honestidade, se a gente consegue ajudar.\nQuer que eu te mande dois horários?\nPara não receber mais mensagens, responda SAIR.',
  rodape: null, botoes: ['Quero os horários'], variaveis: ['{{1}}', '{{2}}', '{{3}}', '{{4}}'], variavelCabecalho: null,
  suportado: true, motivoNaoSuportado: null, motivoRecusa: null,
});

module.exports = {
  canal: 'oficial',
  titulo: 'Como criar um modelo de mensagem de abordagem',
  rota: '/crm',
  simular: [
    canalOficial[0],
    [/\/whatsapp\/canal\/oficial(\?|$)/, (j) => ({ ...j, conta: CONTA })],
    [/\/whatsapp\/canal\/oficial\/saude/, () => SAUDE],
    [/\/whatsapp\/canal\/modelos/, (r) => {
      const base = canalOficial[1][1](r).modelos;
      return { ...r, modelos: estado === 'nenhum' ? base : [NOVO(), ...base] };
    }],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como criar um modelo de mensagem para abordar leads pelo número oficial. Esse recurso é do plano Enterprise.',
      acao: (h) => h.cartaz('Como criar um modelo de mensagem de abordagem', 'Plano Enterprise · número oficial da Meta'),
      pausa: 300,
    },
    {
      fala: 'No número oficial, para chamar alguém que ainda não falou com você, a Meta exige um modelo de mensagem aprovado.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'WhatsApp', { ms: 900 });
        await h.dorme(1800);
      },
    },
    {
      fala: 'Abra a aba Modelos de mensagem. Aqui ficam todos os seus modelos, com a situação de cada um. Clique em Criar modelo.',
      acao: async (h) => {
        await h.clicar('button', 'Modelos de mensagem', { ms: 800 });
        await h.dorme(1200);
        await h.destacar('span', 'Aprovado', { folga: 4 });
        await h.dorme(1500);
        await h.semDestaque();
        await h.clicar('button', 'Criar modelo', { ms: 800 });
        await h.dorme(1000);
      },
    },
    {
      fala: 'Comece de um modelo pronto. Eles já vêm no formato que a Meta costuma aprovar, dizendo de onde a pessoa veio logo na primeira linha. Para abordagem, escolha Convite para conversa.',
      acao: async (h) => {
        await h.destacar('p', 'Começar de um modelo pronto', { dentro: MODAL, folga: 6 });
        await h.dorme(1500);
        await h.semDestaque();
        await h.clicar('button', 'Convite para conversa', { dentro: MODAL, ms: 900 });
      },
    },
    {
      fala: 'O nome é só para você achar o modelo depois. E a categoria de uma abordagem é Marketing.',
      acao: async (h) => {
        await h.destacar('input', 'ex.: promocao', { dentro: MODAL, folga: 4 });
        await h.dorme(1600);
        await h.destacar('select', '', { dentro: MODAL, folga: 4 });
      },
    },
    {
      fala: 'Na mensagem, cada número entre chaves é um campo que o Duo preenche na hora do envio: o nome do lead, o seu nome, a sua empresa e de onde a pessoa veio. Ajuste o texto ao seu jeito de falar.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('textarea', '', { dentro: MODAL, folga: 4 });
      },
    },
    {
      fala: 'A Meta pede um exemplo de cada campo para analisar o modelo, e a prévia ao lado mostra como a pessoa vai ler.',
      acao: async (h) => {
        await h.destacar('p', 'A Meta exige um exemplo', { dentro: MODAL, folga: 8 });
        await h.dorme(1800);
        await h.destacar('p', 'Oi Marina', { dentro: MODAL, folga: 8 });
      },
    },
    {
      fala: 'Se quiser, adicione um botão de resposta rápida. Com um toque, a pessoa responde, e o clique pode mover o card e disparar uma resposta automática.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Resposta rápida', { dentro: MODAL, ms: 800 });
        await h.dorme(500);
        await h.clicar('input', 'Texto do botão', { dentro: MODAL, ms: 600 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('KeyA'); await h.p.keyboard.up('Control');
        await h.digitar('Quero os horários', 55);
      },
    },
    {
      fala: 'Agora, clique em Enviar para aprovação.',
      acao: async (h) => {
        estado = 'em_analise';
        await h.clicar('button', 'Enviar para aprovação', { dentro: MODAL, ms: 900 });
        await h.dorme(1500);
        await h.p.evaluate(() => { if (document.querySelector('.fixed.inset-0')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        await h.dorme(600);
        await h.clicar('button', 'atualizar', { ms: 700 });
        await h.dorme(1000);
        await h.destacar('span', 'Em análise', { folga: 4 });
      },
    },
    {
      fala: 'A Meta costuma responder em minutos, ou em algumas horas. Aprovado, o modelo aparece no disparo em massa, na cadência e no chat do card. Se for recusado, o motivo aparece aqui, e você ajusta e envia de novo.',
      acao: async (h) => {
        await h.semDestaque();
        await h.dorme(1500);
        estado = 'aprovado';
        await h.clicar('button', 'atualizar', { ms: 700 });
        await h.dorme(1000);
        await h.destacar('span', 'Aprovado', { folga: 4 });
      },
    },
    ENCERRAMENTO,
  ],
};
