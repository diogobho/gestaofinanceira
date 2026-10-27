/**
 * Conectar o número oficial da Meta (Enterprise) — a primeira conexão, feita pelo dono da
 * conta. A janela da Meta (Embedded Signup) é de fora do Duo e não é gravável: entra como
 * ilustração, como o celular no vídeo do QR. Nada é conectado de verdade: a tela de escolha
 * e o painel do número são simulados, e o botão não é clicado (abriria o Facebook).
 */
const { ENCERRAMENTO } = require('./_comum');
const canalOficial = require('./_canal-oficial');

let conectado = false;

const ES = { configurado: true, faltando: [], appId: 'demo', configId: 'demo', graphVersion: 'v21.0' };
const oficial = () => ({
  portfolio: conectado ? { nome: 'Clínica Demo', businessId: 'demo', wabaId: 'demo', pagamentoPendente: false } : null,
  podeDefinirPortfolio: true,
  donoDaConta: 'Ana Ribeiro',
  embeddedSignup: ES,
  conta: conectado
    ? { id: 1, numero: '+55 11 3000-0031', nomeExibicao: 'Clínica Demo', ativo: true, origem: 'embedded_signup', qualidade: 'GREEN', conectado: true, erro: null, meu: true, daEmpresa: false }
    : null,
});
const SAUDE = {
  saude: {
    numero: '+55 11 3000-0031', nomeExibido: 'Clínica Demo', statusNome: 'APPROVED', nomeNovo: null, statusNomeNovo: null,
    qualidade: 'GREEN', limite: 'TIER_250', verificacao: 'VERIFIED', status: 'CONNECTED', modo: 'LIVE', podeEnviar: 'AVAILABLE', pendencias: [],
  },
  wabaId: 'demo',
};

// A janela da Meta, desenhada ao lado da tela: o passo que acontece fora do Duo.
const janelaMeta = (h) => h.p.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'ilustra-meta';
  d.innerHTML = `<div style="font:600 13px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:14px">NA JANELA DA META</div>
    ${['Entre com o seu <b>Facebook</b>', 'Escolha o <b>portfólio</b> da empresa, ou crie um', 'Defina o <b>nome</b> que os clientes vão ver', 'Informe o <b>número</b> e confirme o código do <b>SMS</b>', 'Clique em <b>Concluir</b>']
      .map((t, i) => `<div style="display:flex;gap:12px;align-items:flex-start;margin:12px 0;opacity:0;transform:translateY(6px);transition:all .4s ${0.5 + i * 1.1}s"><span style="flex:none;width:26px;height:26px;border-radius:50%;background:#D2B773;color:#13264C;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px">${i + 1}</span><span>${t}</span></div>`).join('')}`;
  Object.assign(d.style, { position: 'fixed', right: '48px', top: '170px', width: '360px', padding: '26px 28px', borderRadius: '18px', background: '#13264C', color: '#fff', font: '15px/1.45 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', zIndex: 9999, opacity: 0, transition: 'opacity .4s' });
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = 1; d.querySelectorAll('div[style*="opacity:0"]').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); });
});

module.exports = {
  canal: 'oficial',
  titulo: 'Como conectar o WhatsApp oficial da Meta',
  rota: '/crm',
  simular: [
    [/\/whatsapp\/config(\?|$)/, (j) => (conectado ? j : { ...j, configurado: false, aguardandoEscolhaDeCanal: true })],
    [/\/whatsapp\/canal(\?|$)/, (c) => (conectado ? canalOficial[0][1](c) : { provedor: 'baileys' })],
    [/\/whatsapp\/canal\/oficial(\?|$)/, () => oficial()],
    [/\/whatsapp\/canal\/oficial\/saude/, () => SAUDE],
    [/\/whatsapp\/canal\/modelos/, () => ({ modelos: [] })],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar o número oficial do WhatsApp, da Meta, ao Duo. Esse recurso é do plano Enterprise.',
      acao: (h) => h.cartaz('Como conectar o WhatsApp oficial da Meta', 'Plano Enterprise · cerca de 2 minutos'),
      pausa: 300,
    },
    {
      fala: 'No menu, clique em WhatsApp. Como o seu plano tem o número oficial, aparece no topo o convite para conectar.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'WhatsApp', { ms: 900 });
        await h.dorme(1800);
        await h.destacar('div', 'O seu plano inclui o WhatsApp Oficial', { folga: 4 });
      },
    },
    {
      fala: 'A primeira conexão é a do dono da conta. Ela cria o portfólio da empresa na Meta, onde depois entram os números da equipe, com o cartão de pagamento cadastrado uma vez só.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('span', 'Esta é a conexão da empresa', { folga: 10 });
      },
    },
    {
      fala: 'Se você já usa o WhatsApp Business no celular, use a outra opção. O número continua no app, e passa a funcionar também aqui.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('button', 'Já uso o WhatsApp Business', { folga: 6 });
      },
    },
    {
      fala: 'Use um número que não esteja em nenhum WhatsApp de celular, e clique em Conectar meu número oficial.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('button', 'Conectar meu número oficial', { folga: 6 });
        // Não clica: abriria a janela do Facebook. O cursor vai até o botão e marca o clique.
        const c = await h.centro('button', 'Conectar meu número oficial');
        await h.ir(c.x, c.y, 900);
        await h.p.evaluate((x, y) => { const r = document.getElementById('v-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px';
          r.animate([{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, c.x, c.y);
      },
    },
    {
      fala: 'Abre a janela da Meta. Entre com o seu Facebook, escolha o portfólio da empresa, ou crie um, defina o nome que os clientes vão ver, informe o número, e confirme o código que chega por SMS. No fim, clique em Concluir.',
      acao: async (h) => { await h.semDestaque(); await janelaMeta(h); },
      pausa: 800,
    },
    {
      fala: 'De volta ao Duo, o painel mostra o número conectado, com o selo de oficial, a qualidade e o limite de envio.',
      acao: async (h) => {
        await h.p.evaluate(() => document.getElementById('ilustra-meta')?.remove());
        conectado = true;
        await h.recarregar();
        await h.dorme(1200);
        await h.destacar('h1', '', { folga: 8 });
      },
    },
    {
      fala: 'Falta um passo, fora do Duo: cadastrar a forma de pagamento no WhatsApp Manager, da Meta. Sem ela, as conversas que você começa não saem.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('a', 'WhatsApp Manager', { folga: 6 });
      },
    },
    {
      fala: 'Depois disso, cada pessoa da equipe conecta o próprio número em um minuto, só com o código do SMS, e ele entra no mesmo portfólio da empresa.',
      acao: async (h) => { await h.dorme(300); },
    },
    ENCERRAMENTO,
  ],
};
