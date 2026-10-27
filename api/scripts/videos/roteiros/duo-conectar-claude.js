/**
 * Conectar o Duo ao Claude (MCP, 23/10/2026). As telas do Claude não são gravadas:
 * entram como cartaz neutro com o que escolher. A página de login do conector é a
 * real, servida de um HTML salvo (demo/login-conector.html) — nada é enviado. A lista
 * de conexões depois do login é simulada.
 */
const { rolarAte, ENCERRAMENTO } = require('./_comum');

const CONEXOES = /\/mcp-conexoes/;
const LOGIN = 'https://duofuturo.tech/api/gestao/oauth/authorize?client_id=demo&state=video';
const ARQ_LOGIN = '/var/www/apps/landing/assets/videos/tutoriais/demo/login-conector.html';
const conectado = (r) => ({ ...(r || {}), url: 'https://duofuturo.tech/api/gestao/mcp',
  conexoes: [{ id: 1, aplicativo: 'Claude', created_at: new Date().toISOString(), ultimo_uso_em: new Date().toISOString() }] });

module.exports = {
  canal: 'todos',
  titulo: 'Como conectar o Duo ao Claude',
  rota: '/agente-duo?aba=configurar',
  simular: [[CONEXOES, (r) => ({ ...(r || {}), url: 'https://duofuturo.tech/api/gestao/mcp', conexoes: [] })]],
  arquivos: [[/\/oauth\/authorize/, { tipo: 'text/html; charset=utf-8', caminho: ARQ_LOGIN }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar o Duo ao Claude, para pedir as coisas do sistema direto numa conversa com o Claude.',
      acao: (h) => h.cartaz('Como conectar o Duo ao Claude', 'Cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'No Duo, abra Agente IA, na aba Configurar Agente. Em Usar o Duo dentro do Claude, copie o endereço do conector.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await rolarAte(h, 'h2', 'Usar o Duo dentro do Claude'); await h.dorme(900);
        await h.destacar('input[aria-label="Endereço do conector do Duo"]', '', { folga: 6 }); await h.dorme(1800);
        await h.semDestaque(); await h.clicar('button', 'Copiar endereço', { ms: 800 });
      },
      pausa: 500,
    },
    {
      fala: 'No Claude, abra Configurações, depois Conectores, e escolha adicionar um conector personalizado. Dê o nome Duo e cole o endereço.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(400); await h.cartaz('No Claude: Configurações → Conectores', 'Adicionar conector personalizado · nome "Duo" · cole o endereço'); },
      pausa: 500,
    },
    {
      fala: 'Nas opções, deixe como o Claude detectar: autenticação, entrar agora; cliente, registrar automaticamente; e os cabeçalhos em branco.',
      acao: (h) => h.cartaz('Deixe como o Claude detectar', 'Autenticação: Entrar agora · Cliente OAuth: Registrar automaticamente · Cabeçalhos: em branco'),
      pausa: 500,
    },
    {
      fala: 'Clique em conectar. Abre esta página do Duo: entre com o seu e-mail e a sua senha do Duo e autorize.',
      acao: async (h) => {
        await h.navegar(LOGIN); await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('#email', '', { ms: 800 }); await h.digitar('ana@studioaurora.com.br', 35);
        await h.clicar('#senha', '', { ms: 600 }); await h.digitar('********', 70);
        await h.destacar('button', 'Entrar e autorizar', { folga: 6 });
      },
      pausa: 500,
    },
    {
      fala: 'O Claude passa a ver e fazer só o que você já pode no sistema, sempre pedindo a sua confirmação antes de gravar.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('ul', '', { folga: 8 }); },
      pausa: 500,
    },
    {
      fala: 'Pronto. No Duo, a conexão aparece na lista, e você pode desconectar quando quiser.',
      acao: async (h) => {
        await h.semDestaque();
        h.simular(CONEXOES, conectado);
        await h.navegar('https://duofuturo.tech/gestao/agente-duo?aba=configurar'); await h.dorme(1200);
        await rolarAte(h, 'h3', 'Conectados à sua conta'); await h.dorme(900);
        await h.destacar('li', 'Claude', { folga: 6 }).catch(() => {});
      },
      pausa: 600,
    },
    {
      fala: 'Agora abra uma conversa nova no Claude, confira se o Duo está ligado nas ferramentas e peça em português normal.',
      acao: async (h) => { await h.semDestaque(); await h.cartaz('Numa conversa nova do Claude', '"Quais são minhas tarefas de hoje no Duo?" · "Como está o funil Comercial?"'); },
      pausa: 600,
    },
    {
      fala: 'Dica: nas permissões do conector, marque sempre permitir nas ferramentas que só consultam, para o Claude não pedir licença a cada pergunta.',
      acao: (h) => h.cartaz('Dica de permissões', '"Sempre permitir" nas consultas · nas que gravam, o Duo já pede confirmação'),
      pausa: 600,
    },
    ENCERRAMENTO,
  ],
};
