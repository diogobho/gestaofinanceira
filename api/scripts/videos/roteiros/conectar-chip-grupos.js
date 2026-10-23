/**
 * Chip de Grupos (101, Enterprise): quem está no número oficial conecta, na página de Grupos,
 * um segundo WhatsApp por QR Code que serve só aos grupos. A demo não tem chip: o canal passa
 * de "no oficial" → "QR na tela" → "conectado" por simulação; o QR é o de mentira
 * (`demo/qr-demo.png`, não conecta nada) e o "Conectar" recebe o ok genérico do gerador.
 */
const { ENCERRAMENTO } = require('./_comum');

const QR = '/var/www/apps/landing/assets/videos/tutoriais/demo/qr-demo.png';
let estado = 'oficial'; // oficial → qr → conectado

const GRUPOS = [
  ['Workshop Vendas 2027 · Turma 1', 212], ['Workshop Vendas 2027 · Turma 2', 187], ['Clientes Clínica Vida Leve', 64], ['Equipe comercial', 8],
].map(([nome, participantes], i) => ({ id: `1203630000000${i}@g.us`, nome, participantes, soAdminsEnviam: false, souAdmin: true, descricao: null }));

const canal = () => (estado === 'oficial'
  ? { provedor: 'cloud_api', conectado: false }
  : { provedor: 'baileys', chipDeGrupos: true, conectado: estado === 'conectado', numero: estado === 'conectado' ? '5511999990000' : null, temQr: estado === 'qr' });

// Painel "no celular", ao lado do QR: o passo que acontece fora do Duo.
const celular = (h) => h.p.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'ilustra-celular';
  d.innerHTML = `<div style="font:600 13px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:14px">NO CELULAR DOS GRUPOS</div>
    ${['Abra o <b>WhatsApp</b>', 'Toque em <b>⋮</b> (Android) ou <b>Configurações</b> (iPhone)', 'Entre em <b>Dispositivos conectados</b>', 'Toque em <b>Conectar dispositivo</b>', 'Aponte a câmera para o <b>QR Code</b>']
      .map((t, i) => `<div style="display:flex;gap:12px;align-items:flex-start;margin:12px 0;opacity:0;transform:translateY(6px);transition:all .4s ${0.5 + i * 0.9}s"><span style="flex:none;width:26px;height:26px;border-radius:50%;background:#D2B773;color:#13264C;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px">${i + 1}</span><span>${t}</span></div>`).join('')}`;
  Object.assign(d.style, { position: 'fixed', right: '16px', top: '200px', width: '300px', padding: '26px 28px', borderRadius: '28px', background: '#13264C', color: '#fff', font: '15px/1.45 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', border: '6px solid #0b1730', zIndex: 9999, opacity: 0, transition: 'opacity .4s' });
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = 1; d.querySelectorAll('div[style*="opacity:0"]').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); });
});

module.exports = {
  canal: 'oficial',
  titulo: 'Como conectar o WhatsApp dos grupos',
  rota: '/crm',
  simular: [
    [/\/grupos\/canal/, () => canal()],
    [/\/grupos\/lista/, () => GRUPOS],
    [/\/grupos\/mensagens$/, () => []],
    [/\/grupos\/boas-vindas$/, () => []],
    [/\/grupos\/crm$/, () => []],
  ],
  arquivos: [[/\/qr-image/, { tipo: 'image/png', caminho: QR }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar um WhatsApp por QR Code para os seus grupos, mesmo com o atendimento no número oficial. Esse recurso é do plano Enterprise.',
      acao: (h) => h.cartaz('Como conectar o WhatsApp dos grupos', 'Plano Enterprise · cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'O número oficial da Meta só cria grupos pequenos, de até oito pessoas. Para comunidade, turma e lista de avisos, os grupos ficam num WhatsApp por QR Code. No menu, clique em Grupos.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'Grupos', { ms: 900 });
        await h.dorme(1500);
        await h.destacar('h2', 'Grupos com um WhatsApp', { folga: 8 });
      },
    },
    {
      fala: 'Esse WhatsApp serve só aos grupos: mensagens, boas-vindas, criar lead e campanhas. As conversas com os leads continuam no número oficial.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('p', 'Ele serve só a esta página', { folga: 6 });
      },
    },
    {
      fala: 'De preferência, use o número que já está nos seus grupos. Clique em Conectar WhatsApp por QR Code.',
      acao: async (h) => {
        await h.semDestaque();
        estado = 'qr';
        await h.clicar('button', 'Conectar WhatsApp por QR Code', { ms: 900 });
        await h.dorme(2500);
        await h.destacar('img[alt^="QR Code"]', '', { folga: 6 });
      },
    },
    {
      fala: 'Agora, pegue o celular desse número. Abra o WhatsApp, toque nos três pontinhos, ou em Configurações, no iPhone. Entre em Dispositivos conectados, toque em Conectar dispositivo, e aponte a câmera para o código.',
      acao: async (h) => { await h.semDestaque(); await celular(h); },
      pausa: 600,
    },
    {
      fala: 'A página atualiza sozinha. Conectado, aparecem os seus grupos, e o selo no topo mostra o número dos grupos.',
      acao: async (h) => {
        await h.p.evaluate(() => document.getElementById('ilustra-celular')?.remove());
        estado = 'conectado';
        await h.dorme(4000);
        await h.destacar('span', 'WhatsApp dos grupos conectado', { folga: 6 });
      },
    },
    {
      fala: 'Para usar outro número nos grupos, clique em Trocar o número dos grupos, e leia um QR novo.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('button', 'Trocar o número dos grupos', { folga: 6 });
      },
    },
    ENCERRAMENTO,
  ],
};
