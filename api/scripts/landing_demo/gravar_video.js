/**
 * Grava a demo em vídeo da landing (/gestao-financeira#demo) na conta DEMO (empresa 31,
 * dados fictícios — nunca empresa real). Só leitura: toda requisição que não é GET é
 * respondida localmente, nada grava no banco.
 *
 *   node api/scripts/landing_demo/gravar_video.js <pasta>   → <pasta>/bruto.webm
 *   ffmpeg -ss 1.5 -i bruto.webm -vf "fps=25,scale=1280:-2,format=yuv420p" -c:v libx264 -crf 26 \
 *     -movflags +faststart -an /var/www/apps/landing/assets/demo-crm.mp4
 */
process.chdir('/var/www/apps/gestao_financeira/api');
require('/var/www/apps/gestao_financeira/api/node_modules/dotenv').config({ path: '/var/www/apps/gestao_financeira/api/.env' });
const puppeteer = require('/var/www/apps/whatsapp-integration/node_modules/puppeteer');
const { signAccessToken } = require('/var/www/apps/gestao_financeira/api/dist/config/jwt.js');
const { query } = require('/var/www/apps/gestao_financeira/api/dist/config/database.js');
const OUT = process.argv[2];
const W = 1440, H = 860;
const dorme = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // Conta DEMO (empresa 31, dados fictícios) — nunca empresa real.
  const u = (await query(`SELECT id, email, nivel, empresa_id, tipo_usuario, nome FROM usuarios WHERE id = 55 AND empresa_id = 31`)).rows[0];
  const token = signAccessToken({ userId: u.id, id: u.id, email: u.email, nivel: u.nivel, empresa_id: u.empresa_id, tipo_usuario: u.tipo_usuario });
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.setRequestInterception(true);
  p.on('request', (r) => (r.method() === 'GET' || !r.url().includes('/api/')) ? r.continue() : r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
  await p.goto('https://duofuturo.tech/gestao/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate((t, usr) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); localStorage.setItem('theme', 'light');
    for (const k of Object.keys(localStorage)) if (/tour|driver/i.test(k)) {} ; localStorage.setItem('tours_vistos', JSON.stringify(['*'])); }, token, { ...u, userId: u.id });
  const cursor = async () => p.evaluate(() => {
    if (document.getElementById('fake-cursor')) return;
    const c = document.createElement('div'); c.id = 'fake-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#13264C" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .05s linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    document.body.appendChild(c);
    const r = document.createElement('div'); r.id = 'fake-ripple'; r.style.cssText = 'position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #D2B773;z-index:2147483646;pointer-events:none;opacity:0';
    document.body.appendChild(r);
    document.addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  });
  let pos = { x: W / 2, y: H / 2 };
  const ir = async (x, y, ms = 700) => { const n = Math.round(ms / 16); for (let i = 1; i <= n; i++) { const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await p.mouse.move(pos.x + (x - pos.x) * e, pos.y + (y - pos.y) * e); await dorme(16); } pos = { x, y }; };
  const centro = async (sel, texto) => p.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(e => !t || (e.innerText || '').trim().startsWith(t)); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel, texto);
  const clicar = async (sel, texto, ms) => { console.log('>', texto, Date.now() % 100000); const c = await centro(sel, texto); if (!c) { console.log('sem', sel, texto); return; } await ir(c.x, c.y, ms);
    await p.evaluate((x, y) => { const r = document.getElementById('fake-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.animate([{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, c.x, c.y);
    await p.mouse.click(c.x, c.y); };
  await p.goto('https://duofuturo.tech/gestao/crm', { waitUntil: 'networkidle2' });
  await dorme(1500); await cursor(); await p.mouse.move(pos.x, pos.y);
  // tira tour/driver aberto, se houver
  await p.evaluate(() => document.querySelectorAll('.driver-popover,.driver-overlay').forEach(e => e.remove()));
  const rec = await p.screencast({ path: `${OUT}/bruto.webm` });
  await dorme(900);
  await ir(700, 420, 900);
  await clicar('div,h4,p,span', 'Fernanda Lima', 900); await dorme(1800);
  await clicar('button', 'Tarefas', 700); await dorme(1200);
  await clicar('button', 'Anotações', 600); await dorme(1200);
  await clicar('button', 'Informações', 600); await dorme(900);
  { const c = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(b => b.querySelector('svg.lucide-x') && b.getBoundingClientRect().width > 0).pop(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (c) { await ir(c.x, c.y, 600); await p.mouse.click(c.x, c.y); } else console.log('sem X'); } await dorme(900);
  await clicar('button', 'Fluxo', 900); await dorme(2600);
  await clicar('button', 'Lista', 700); await dorme(1800);
  await clicar('a', 'Dashboard', 900); await dorme(3000);
  await ir(900, 500, 800); await dorme(700);
  await rec.stop();
  await b.close(); process.exit(0);
})();
