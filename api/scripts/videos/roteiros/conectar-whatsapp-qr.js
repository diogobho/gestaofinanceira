/**
 * Conectar o WhatsApp por QR Code (Profissional, ou Enterprise que segue no QR). A demo não
 * tem chip: o cartão da Ana é simulado — QR de mentira (`demo/qr-demo.png`, não conecta nada)
 * e, depois da "leitura", o status passa a conectado. A parte do celular entra como ilustração.
 */
const { ENCERRAMENTO } = require('./_comum');

const QR = '/var/www/apps/landing/assets/videos/tutoriais/demo/qr-demo.png';
let conectado = false;
const status = () => (conectado
  ? { clientId: 'demo', status: 'connected', hasQrCode: false, pareado: true, numero: '5511999990000', timestamp: new Date().toISOString() }
  : { clientId: 'demo', status: 'disconnected', hasQrCode: true, qrExpiraEm: 58, qrGeradoEm: 'demo-1', pareado: false, aguardandoQr: true, timestamp: new Date().toISOString() });
const semOficial = (j) => {
  const tira = (d) => (d && Array.isArray(d.capacidades) ? { ...d, capacidades: d.capacidades.filter((c) => c !== 'whatsapp_oficial') } : d);
  return j && j.data ? { ...j, data: tira(j.data) } : tira(j);
};

// Painel "no celular", ao lado do cartão: o passo que acontece fora do Duo.
const celular = (h) => h.p.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'ilustra-celular';
  d.innerHTML = `<div style="font:600 13px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:14px">NO CELULAR</div>
    ${['Abra o <b>WhatsApp</b>', 'Toque em <b>⋮</b> (Android) ou <b>Configurações</b> (iPhone)', 'Entre em <b>Dispositivos conectados</b>', 'Toque em <b>Conectar dispositivo</b>', 'Aponte a câmera para o <b>QR Code</b>']
      .map((t, i) => `<div style="display:flex;gap:12px;align-items:flex-start;margin:12px 0;opacity:0;transform:translateY(6px);transition:all .4s ${0.5 + i * 0.9}s"><span style="flex:none;width:26px;height:26px;border-radius:50%;background:#D2B773;color:#13264C;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px">${i + 1}</span><span>${t}</span></div>`).join('')}`;
  Object.assign(d.style, { position: 'fixed', right: '48px', top: '200px', width: '330px', padding: '26px 28px', borderRadius: '28px', background: '#13264C', color: '#fff', font: '15px/1.45 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', border: '6px solid #0b1730', zIndex: 9999, opacity: 0, transition: 'opacity .4s' });
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = 1; d.querySelectorAll('div[style*="opacity:0"]').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); });
});

module.exports = {
  canal: 'qr',
  titulo: 'Como conectar o seu WhatsApp por QR Code',
  rota: '/crm',
  simular: [
    [/\/assinaturas\/minha/, semOficial],
    [/\/whatsapp\/canal\/oficial/, (j) => ({ ...j, conta: null })],
    [/\/whatsapp\/empresa\/usuarios$/, (us) => (Array.isArray(us) ? us.map((u) => ({ ...u, configurado: true, porta: 3099, canal: 'qr', podeOficial: false })) : us)],
    [/\/whatsapp\/empresa\/usuarios\/\d+\/status/, () => status()],
  ],
  arquivos: [[/\/qr-image/, { tipo: 'image/png', caminho: QR }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar o seu WhatsApp ao Duo, lendo um QR Code com o celular.',
      acao: (h) => h.cartaz('Como conectar o seu WhatsApp por QR Code', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No menu, clique em WhatsApp. Aparece um cartão com o seu nome, e nele, o QR Code.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'WhatsApp', { ms: 900 });
        await h.dorme(1800);
        await h.destacar('[data-tour="wa-card"]', '', { folga: 6 });
      },
    },
    {
      fala: 'O código vale por um minuto, e se renova sozinho. Não precisa ter pressa.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('p', '⏰', { folga: 4 });
      },
    },
    {
      fala: 'Agora, pegue o celular com o número que vai usar. Abra o WhatsApp, toque nos três pontinhos, ou em Configurações, no iPhone. Entre em Dispositivos conectados, toque em Conectar dispositivo, e aponte a câmera para o código.',
      acao: async (h) => { await h.semDestaque(); await celular(h); },
      pausa: 600,
    },
    {
      fala: 'Em poucos segundos, o cartão fica verde: o seu WhatsApp está conectado, e as mensagens do CRM já saem por ele.',
      acao: async (h) => {
        await h.p.evaluate(() => document.getElementById('ilustra-celular')?.remove());
        conectado = true;
        await h.clicar('button[title="Atualizar status"]', '', { ms: 700 });
        await h.dorme(1200);
        await h.destacar('[data-tour="wa-card"]', '', { folga: 6 });
      },
    },
    {
      fala: 'Mantenha o celular com internet. Se um dia o cartão aparecer desconectado, é só voltar aqui e ler um QR novo. E para trocar de chip, use Conectar outro número.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('button', 'Conectar outro número', { folga: 4 });
      },
    },
    ENCERRAMENTO,
  ],
};
