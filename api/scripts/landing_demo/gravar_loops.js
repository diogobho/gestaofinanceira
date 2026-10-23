/**
 * Grava os trechos curtos em loop da seção #financeiro da landing (Receitas e Parcelas),
 * na conta DEMO (empresa 31, dados fictícios — nunca empresa real). Só leitura: toda
 * requisição que não é GET é respondida localmente, nada grava no banco.
 *
 *   node api/scripts/landing_demo/gravar_loops.js <pasta>   → <pasta>/receitas.webm, parcelas.webm
 *   ffmpeg -ss 1 -i <pasta>/X.webm -vf "fps=25,scale=1280:-2,format=yuv420p" -c:v libx264 -crf 27 \
 *     -movflags +faststart -an /var/www/apps/landing/assets/loop-X.mp4
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
  const rolar = async (dy, passos = 30) => { for (let i = 0; i < passos; i++) { await p.mouse.wheel({ deltaY: dy / passos }); await dorme(28); } };
  const abrir = async (url) => {
    await p.goto('https://duofuturo.tech/gestao' + url, { waitUntil: 'networkidle2' });
    await dorme(1500); await cursor(); await p.mouse.move(pos.x, pos.y);
    await p.evaluate(() => document.querySelectorAll('.driver-popover,.driver-overlay').forEach(e => e.remove()));
  };

  // 1) Receitas: passa pelos totais e desce pelos lançamentos
  await abrir('/receitas');
  let rec = await p.screencast({ path: `${OUT}/receitas.webm` });
  await dorme(700);
  { const c = await centro('p,span,div', 'Recebidas'); if (c) await ir(c.x, c.y, 900); } await dorme(900);
  { const c = await centro('p,span,div', 'Pendentes'); if (c) await ir(c.x, c.y, 700); } await dorme(900);
  await ir(W * 0.6, H * 0.75, 700); await rolar(420); await dorme(1200);
  await ir(W * 0.55, H * 0.55, 700); await dorme(900);
  await rolar(-420); await ir(W / 2, H / 2, 700); await dorme(600);
  await rec.stop();

  // 2) Parcelas: marca três parcelas e o botão de cobrança acompanha
  await abrir('/parcelas');
  rec = await p.screencast({ path: `${OUT}/parcelas.webm` });
  await dorme(700);
  await ir(W * 0.5, H * 0.7, 700); await rolar(330); await dorme(700);
  // Posição lida na hora de cada clique: marcar a primeira abre um aviso que empurra a tabela.
  for (let k = 0; k < 3; k++) {
    const c = await p.evaluate((n) => { const el = [...document.querySelectorAll('tbody input[type=checkbox]')][n]; if (!el) return null;
      el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, k);
    if (!c) break;
    await ir(c.x, c.y, 550);
    await p.evaluate((x, y) => { const r = document.getElementById('fake-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.animate([{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, c.x, c.y);
    await p.mouse.click(c.x, c.y); await dorme(650);
  }
  await rolar(-330); await dorme(400);
  { const c = await centro('button', 'Enviar WhatsApp'); if (c) await ir(c.x, c.y, 900); } await dorme(1800);
  await ir(W / 2, H / 2, 700); await dorme(500);
  await rec.stop();
  await b.close(); process.exit(0);
})();
