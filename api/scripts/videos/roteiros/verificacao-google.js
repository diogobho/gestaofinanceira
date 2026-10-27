/**
 * Vídeo de verificação do Google (OAuth, escopo sensível calendar.events) — em inglês e REAL,
 * autorizado explicitamente pelo dono em 06/10/2026: conta suporte@ (usuário 57), já
 * conectada ao Google Agenda futuroncontato@gmail.com; as ações vão de verdade para a API
 * (`real: true`) e o evento é lido AO VIVO na API do Google a cada passo (criado → remarcado →
 * excluído). Lead temporário 18183 no funil Teste (62), sem telefone e sem e-mail: nenhum
 * convite nem lembrete sai para ninguém.
 * A tela de consentimento LOGADA não é gravável daqui (o servidor não entra numa conta Google):
 * mostra-se a página real do Google com o client_id e os escopos pedidos.
 * Montagem: verificacao-google/montar.sh (abertura + este + encerramento).
 */
const { query } = require('/var/www/apps/gestao_financeira/api/dist/config/database');
const { eventoAoVivo } = require('/var/www/apps/gestao_financeira/api/dist/modules/agenda-externa/agenda-externa.service');

const LEAD = 18183;
const BASE = 'https://duofuturo.tech/gestao';
let fingirDesconectado = true;
let tarefaId = null;
let eventoId = null;

const diaDaReuniao = () => new Date(Date.now() + 3 * 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const preencherData = (h, hora) => h.p.evaluate((v) => {
  const el = document.querySelector('input[type="datetime-local"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, `${diaDaReuniao()}T${hora}`);

const marcarSelect = (h, valor, attr) => h.p.evaluate((v, a) => [...document.querySelectorAll('select')]
  .find((e) => [...e.options].some((o) => o.value === v))?.setAttribute(a, '1'), valor, attr);

const rolarAteAgenda = (h) => h.p.evaluate(() => [...document.querySelectorAll('h3')]
  .find((e) => e.innerText.startsWith('Agenda (Google'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

// Painel com o evento lido agora na API do Google Agenda.
async function painelEvento(h, titulo) {
  const ev = await eventoAoVivo(tarefaId, eventoId, 57);
  const fmt = (x) => (x ? new Date(x.dateTime || x).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', dateStyle: 'medium', timeStyle: 'short' }) + ' (BRT)' : '—');
  const linhas = !ev ? [['status', 'not found']]
    : ev.status === 'deleted' || ev.status === 'cancelled' ? [['event id', ev.id], ['status', `${ev.status} — removed from the calendar`]]
    : [['summary', ev.summary], ['start', fmt(ev.start)], ['end', fmt(ev.end)], ['Google Meet', ev.hangoutLink || '(creating…)'], ['status', ev.status], ['event id', ev.id]];
  await h.p.evaluate((titulo, linhas) => {
    document.getElementById('v-evento')?.remove();
    const d = document.createElement('div'); d.id = 'v-evento';
    d.innerHTML = `<div style="font:600 12px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:6px">LIVE FROM GOOGLE CALENDAR API · futuroncontato@gmail.com</div>
      <div style="font:600 18px Poppins,sans-serif;margin-bottom:12px">${titulo}</div>
      ${linhas.map(([k, v]) => `<div style="display:flex;gap:10px;margin:5px 0"><span style="flex:none;width:105px;color:#C9D3E6">${k}</span><span style="word-break:break-all">${v}</span></div>`).join('')}`;
    Object.assign(d.style, { position: 'fixed', right: '16px', bottom: '16px', width: '470px', padding: '20px 22px', borderRadius: '16px', background: '#13264C', color: '#fff', font: '14px/1.4 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', zIndex: 9999 });
    document.body.appendChild(d);
  }, titulo, linhas);
  return ev;
}
const tirarPainel = (h) => h.p.evaluate(() => document.getElementById('v-evento')?.remove());

async function abrirTarefas(h) {
  await h.p.goto(`${BASE}/crm?funil=62&lead=${LEAD}`, { waitUntil: 'networkidle2' });
  await h.recarregar();
  await h.dorme(1500);
  await h.clicar('button', 'Tarefas', { ms: 700 });
  await h.dorme(900);
}

module.exports = {
  canal: 'todos',
  idioma: 'en',
  usuario: 57,
  real: true,
  titulo: 'Duo — Google Calendar integration (OAuth verification demo)',
  rota: '/perfil',
  simular: [
    // Só no começo: o cartão aparece desconectado, para mostrar o botão de conectar.
    [/\/agenda-externa\/status/, (j) => (fingirDesconectado ? { ...j, conta: null } : j)],
  ],
  passos: [
    {
      fala: 'This is Duo, logged in as a real user. In My profile, the Calendar card lets each user connect their own Google Calendar.',
      acao: async (h) => {
        await h.dorme(800);
        await rolarAteAgenda(h);
        await h.dorme(900);
        await h.destacar('h3', 'Agenda (Google', { folga: 8 });
      },
    },
    {
      fala: 'The user clicks Connect Google Calendar, and Duo starts the standard Google OAuth flow.',
      acao: async (h) => {
        await h.semDestaque();
        // A página do Google exige Trusted Types: sem isto, cursor e painel do vídeo não entram.
        await h.p.setBypassCSP(true);
        await Promise.all([
          h.p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          h.clicar('button', 'Conectar Google Agenda', { ms: 900 }),
        ]);
        const url = h.p.url();
        await h.p.goto(url + (url.includes('?') ? '&' : '?') + 'hl=en', { waitUntil: 'networkidle2' });
        await h.recarregar();
      },
    },
    {
      fala: 'This is the real Google page, shown in English. The address carries Duo\'s client ID and the exact scopes requested: openid, email, and calendar dot events. After signing in, the user sees the consent screen and grants calendar dot events.',
      acao: async (h) => {
        const u = new URL(h.p.url());
        const cont = u.searchParams.get('continue');
        const alvo = cont ? new URL(cont) : u;
        const cid = alvo.searchParams.get('client_id') || u.searchParams.get('client_id') || '';
        const escopo = alvo.searchParams.get('scope') || u.searchParams.get('scope') || '';
        await h.p.evaluate((url, cid, escopo) => {
          const d = document.createElement('div'); d.id = 'v-url';
          d.innerHTML = `<div style="font:600 12px Poppins,sans-serif;color:#D2B773;letter-spacing:.12em;margin-bottom:8px">ADDRESS BAR</div>
            <div style="font:13px monospace;word-break:break-all;color:#C9D3E6;margin-bottom:12px">${url.slice(0, 180)}…</div>
            <div style="margin:4px 0"><b>client_id</b>: ${cid}</div>
            <div style="margin:4px 0"><b>scope</b>: ${escopo.split(' ').join(' · ')}</div>`;
          Object.assign(d.style, { position: 'fixed', left: '16px', right: '16px', bottom: '16px', padding: '18px 22px', borderRadius: '14px', background: '#13264C', color: '#fff', font: '14px/1.5 Poppins,sans-serif', boxShadow: '0 20px 50px rgba(0,0,0,.35)', zIndex: 9999 });
          document.body.appendChild(d);
        }, h.p.url(), cid, escopo);
      },
      pausa: 1500,
    },
    {
      fala: 'Back in Duo, the card now shows the connected Google account. From here on, everything happens for real, in this account\'s Google Calendar.',
      acao: async (h) => {
        fingirDesconectado = false;
        await h.p.goto(`${BASE}/perfil`, { waitUntil: 'networkidle2' });
        await h.recarregar();
        await h.dorme(900);
        await rolarAteAgenda(h);
        await h.dorme(900);
        await h.destacar('span', 'Conectada', { folga: 6 }).catch(() => h.destacar('h3', 'Agenda (Google', { folga: 8 }));
      },
    },
    {
      fala: 'Now, in the CRM, the user opens a lead and creates a task of type Meeting, with a title, a date, a time and a duration.',
      acao: async (h) => {
        await h.semDestaque();
        await abrirTarefas(h);
        await h.clicar('button', 'Nova Tarefa', { ms: 700 });
        await h.dorme(600);
        await marcarSelect(h, 'visita', 'data-v-tipo');
        await h.escolher('select[data-v-tipo]', 'Reunião');
        await h.dorme(500);
        await h.clicar('input[placeholder^="Ex: Ligar"]', '', { ms: 600 });
        await h.digitar('Demo meeting', 50);
        const c = await h.centro('input[type="datetime-local"]', '');
        await h.ir(c.x, c.y, 600);
        await preencherData(h, '10:00');
        await h.dorme(400);
        await h.p.evaluate(() => { const l = [...document.querySelectorAll('label')].find((e) => e.innerText.trim() === 'Duração'); l?.parentElement?.querySelector('select')?.setAttribute('data-v-duracao', '1'); });
        await h.escolher('select[data-v-duracao]', '30 minutos');
        await h.dorme(500);
        await h.destacar('p', 'Vai para a sua agenda', { folga: 6 });
      },
    },
    {
      fala: 'The form confirms that the meeting goes to the connected Google Calendar. The user clicks Create.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Criar Tarefa', { ms: 800 });
        await h.dorme(1000);
        tarefaId = (await query(`SELECT id FROM tarefas_lead WHERE lead_id = $1 ORDER BY id DESC LIMIT 1`, [LEAD])).rows[0]?.id;
        // Espera o evento existir (sincronização imediata + leitura do link do Meet).
        for (let i = 0; i < 25 && !eventoId; i++) {
          await h.dorme(1000);
          const r = (await query(`SELECT evento_id, link_reuniao FROM agenda_eventos WHERE tarefa_id = $1`, [tarefaId])).rows[0];
          if (r?.link_reuniao) eventoId = r.evento_id;
        }
        if (!eventoId) throw new Error(`tarefa ${tarefaId}: o evento não chegou ao Google`);
      },
    },
    {
      fala: 'Using calendar dot events, Duo created the event in the user\'s Google Calendar, with a Google Meet link. The panel shows the event read live from the Google Calendar API. The task in Duo now shows the Join meeting link.',
      acao: async (h) => {
        await abrirTarefas(h);
        await painelEvento(h, 'Event created by Duo');
        await h.destacar('a', 'Entrar na reunião', { folga: 6 });
      },
      pausa: 1500,
    },
    {
      fala: 'If the meeting is rescheduled in Duo, here from ten to eleven o\'clock, Duo updates the same event in Google Calendar.',
      acao: async (h) => {
        await h.semDestaque(); await tirarPainel(h);
        await h.clicar('button[title="Editar tarefa"]', '', { ms: 700 });
        await h.dorme(600);
        const c = await h.centro('input[type="datetime-local"]', '');
        await h.ir(c.x, c.y, 600);
        await preencherData(h, '11:00');
        await h.dorme(500);
        await h.clicar('button', 'Salvar alterações', { ms: 700 });
        await h.dorme(5000);
        await painelEvento(h, 'Event updated by Duo — new time');
        await h.dorme(4500); // o painel fica na tela antes do próximo passo
      },
      pausa: 1500,
    },
    {
      fala: 'And if the meeting is canceled, by deleting the task, Duo deletes the event from Google Calendar.',
      acao: async (h) => {
        await tirarPainel(h);
        h.p.once('dialog', (d) => d.accept());
        await h.clicar('button[title="Excluir tarefa"]', '', { ms: 700 });
        await h.dorme(5000);
        await painelEvento(h, 'Event deleted by Duo');
        await h.dorme(4500);
      },
      pausa: 1500,
    },
    {
      fala: 'Duo only creates, updates and deletes the events of meetings scheduled in its CRM. It never reads other events.',
      acao: async (h) => { await h.dorme(500); },
      pausa: 800,
    },
  ],
};
