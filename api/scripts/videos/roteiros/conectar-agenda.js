/**
 * Agenda externa (103): conectar o Google Agenda ou o Microsoft 365 em Meu perfil, e a
 * reunião marcada no card aparecer lá com o link do Meet. A janela do Google é de fora do
 * Duo e não é gravável: entra como ilustração. Conexão e tarefas são simuladas — o botão
 * "Conectar" não é clicado (abriria o Google) e o "Criar Tarefa" recebe o ok genérico.
 */
const { ENCERRAMENTO } = require('./_comum');

let conectado = false;
let criada = false;

const status = () => ({
  provedores: [{ provedor: 'google', configurado: true }, { provedor: 'microsoft', configurado: true }],
  conta: conectado ? { provedor: 'google', email: 'ana.ribeiro@gmail.com', erro: null, conectado_em: new Date().toISOString() } : null,
});

const amanha15h = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setUTCHours(18, 0, 0, 0); return d; }; // 15h em Brasília (o gerador roda em UTC)
const tarefas = () => (criada ? [{
  id: 990001, lead_id: 0, empresa_id: 31, responsavel_id: 55, criado_por_id: 55, tipo: 'reuniao',
  titulo: 'Apresentação da proposta', descricao: null, data_vencimento: amanha15h().toISOString(),
  status: 'pendente', prioridade: 'normal', status_visual: 'verde', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  responsavel_nome: 'Ana Ribeiro', link_reuniao: 'https://meet.google.com/abc-defg-hij', agenda_provedor: 'google', duracao_min: 30,
}] : []);

const rolar = (h, sel, texto) => h.p.evaluate((s, t) => {
  [...document.querySelectorAll(s)].find((e) => (e.innerText || '').trim().startsWith(t))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, sel, texto);

// A janela do Google, desenhada ao lado: o passo que acontece fora do Duo.
const janelaGoogle = (h) => h.p.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'ilustra-google';
  d.innerHTML = `<div style="font:600 13px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:14px">NA JANELA DO GOOGLE</div>
    ${['Escolha a sua <b>conta Google</b>', 'Confira as permissões: só os <b>eventos</b> da agenda', 'Clique em <b>Continuar</b>', 'Você volta ao Duo, já <b>conectado</b>']
      .map((t, i) => `<div style="display:flex;gap:12px;align-items:flex-start;margin:12px 0;opacity:0;transform:translateY(6px);transition:all .4s ${0.5 + i * 1}s"><span style="flex:none;width:26px;height:26px;border-radius:50%;background:#D2B773;color:#13264C;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px">${i + 1}</span><span>${t}</span></div>`).join('')}`;
  Object.assign(d.style, { position: 'fixed', right: '16px', top: '170px', width: '320px', padding: '26px 28px', borderRadius: '18px', background: '#13264C', color: '#fff', font: '15px/1.45 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', zIndex: 9999, opacity: 0, transition: 'opacity .4s' });
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = 1; d.querySelectorAll('div[style*="opacity:0"]').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); });
});

module.exports = {
  canal: 'todos',
  titulo: 'Como levar as reuniões do CRM para a sua agenda',
  rota: '/crm',
  simular: [
    [/\/agenda-externa\/status/, () => status()],
    [/\/crm\/leads\/\d+\/tarefas/, () => tarefas()],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como fazer as reuniões marcadas no CRM aparecerem na sua agenda do Google, ou da Microsoft, com o link da reunião pronto.',
      acao: (h) => h.cartaz('Reuniões do CRM na sua agenda', 'Google Agenda ou Microsoft 365 · cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Clique no seu nome, no alto do menu, para abrir Meu perfil. Desça até o cartão Agenda.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('[data-tour="sidebar-perfil"]', '', { ms: 900 });
        await h.dorme(1500);
        await rolar(h, 'h3', 'Agenda (Google');
        await h.dorme(900);
        await h.destacar('h3', 'Agenda (Google', { folga: 8 });
      },
    },
    {
      fala: 'Cada pessoa da equipe conecta a própria agenda. Use Google Agenda, ou Microsoft 365, para quem usa Outlook e Teams.',
      acao: async (h) => {
        await h.semDestaque();
        await h.destacar('button', 'Conectar Google Agenda', { folga: 6 });
        const c = await h.centro('button', 'Conectar Google Agenda');
        await h.ir(c.x, c.y, 900);
        await h.p.evaluate((x, y) => { const r = document.getElementById('v-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px';
          r.animate([{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, c.x, c.y);
      },
    },
    {
      fala: 'Abre a janela do Google. Escolha a sua conta, confira a permissão, que é só para os eventos da agenda, e clique em Continuar.',
      acao: async (h) => { await h.semDestaque(); await janelaGoogle(h); },
      pausa: 800,
    },
    {
      fala: 'De volta ao Duo, o cartão mostra a agenda conectada.',
      acao: async (h) => {
        await h.p.evaluate(() => document.getElementById('ilustra-google')?.remove());
        conectado = true;
        await h.recarregar();
        await h.dorme(1000);
        await rolar(h, 'h3', 'Agenda (Google');
        await h.dorme(900);
        await h.destacar('span', 'Conectada', { folga: 6 });
      },
    },
    {
      fala: 'Agora, no CRM, abra o card do lead, e vá em Tarefas. Clique em Nova Tarefa, e escolha o tipo Reunião.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('a', 'CRM / Funil', { ms: 900 });
        await h.dorme(1800);
        await h.clicar('div,h4,p,span', 'Fernanda Lima', { ms: 1000 });
        await h.dorme(1200);
        await h.clicar('button', 'Tarefas', { ms: 800 });
        await h.dorme(800);
        await h.clicar('button', 'Nova Tarefa', { ms: 800 });
        await h.dorme(700);
        await h.p.evaluate(() => [...document.querySelectorAll('select')].find((e) => [...e.options].some((o) => o.value === 'reuniao') && [...e.options].some((o) => o.value === 'visita'))?.setAttribute('data-v-tipo', '1'));
        await h.escolher('select[data-v-tipo]', 'Reunião');
      },
    },
    {
      fala: 'Escolha a duração. Embaixo, o Duo avisa que a reunião vai para a sua agenda, com link do Meet. Se o lead tiver e-mail, ele recebe o convite.',
      acao: async (h) => {
        await h.dorme(500);
        await h.p.evaluate(() => { const l = [...document.querySelectorAll('label')].find((e) => e.innerText.trim() === 'Duração'); l?.parentElement?.querySelector('select')?.setAttribute('data-v-duracao', '1'); });
        await h.escolher('select[data-v-duracao]', '30 minutos');
        await h.dorme(600);
        await h.destacar('p', 'Vai para a sua agenda', { folga: 6 });
      },
    },
    {
      fala: 'Dê um título, escolha o dia e a hora, e clique em Criar Tarefa.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('input[placeholder^="Ex: Ligar"]', '', { ms: 700 });
        await h.digitar('Apresentação da proposta', 45);
        await h.dorme(400);
        // datetime-local: o seletor nativo não aparece na gravação; o campo recebe amanhã 15h.
        const c = await h.centro('input[type="datetime-local"]', '');
        await h.ir(c.x, c.y, 700);
        await h.p.evaluate(() => {
          const d = new Date(); d.setDate(d.getDate() + 1);
          const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T15:00`;
          const el = document.querySelector('input[type="datetime-local"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await h.dorme(700);
        criada = true;
        await h.clicar('button', 'Criar Tarefa', { ms: 800 });
        await h.dorme(1500);
      },
    },
    {
      fala: 'Em segundos, a reunião está na sua agenda. E no card aparece o botão Entrar na reunião. Remarcar ou cancelar aqui, atualiza lá também.',
      acao: async (h) => {
        await h.clicar('button', 'Tarefas', { ms: 600 }).catch(() => {});
        await h.dorme(900);
        await h.destacar('a', 'Entrar na reunião', { folga: 6 });
      },
    },
    ENCERRAMENTO,
  ],
};
