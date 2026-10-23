/**
 * Capturas do tour da landing (tour-*.webp), conta DEMO (empresa 31). Só leitura.
 *   node api/scripts/landing_demo/capturas.js <pasta>
 *   ffmpeg -i <pasta>/X.png -vf scale=1600:-2 -c:v libwebp -quality 80 landing/assets/tour-X.webp
 */
process.chdir('/var/www/apps/gestao_financeira/api');
require('/var/www/apps/gestao_financeira/api/node_modules/dotenv').config({ path: '/var/www/apps/gestao_financeira/api/.env' });
const puppeteer = require('/var/www/apps/whatsapp-integration/node_modules/puppeteer');
const { signAccessToken } = require('/var/www/apps/gestao_financeira/api/dist/config/jwt.js');
const { query } = require('/var/www/apps/gestao_financeira/api/dist/config/database.js');
const OUT = process.argv[2];
(async () => {
  const u = (await query(`SELECT id, email, nivel, empresa_id, tipo_usuario, nome FROM usuarios WHERE id = 55 AND empresa_id = 31`)).rows[0];
  const token = signAccessToken({ userId: u.id, id: u.id, email: u.email, nivel: u.nivel, empresa_id: u.empresa_id, tipo_usuario: u.tipo_usuario });
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const shot = async (nome, url, depois) => {
    const p = await b.newPage(); await p.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1.5 });
    await p.setRequestInterception(true);
    p.on('request', (r) => (r.method() === 'GET' || !r.url().includes('/api/')) ? r.continue() : r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
    await p.goto('https://duofuturo.tech/gestao/login', { waitUntil: 'domcontentloaded' });
    await p.evaluate((t, usr) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); localStorage.setItem('theme', 'light'); }, token, { ...u, userId: u.id });
    await p.goto('https://duofuturo.tech/gestao' + url, { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1800));
    if (depois) { await depois(p); await new Promise(r => setTimeout(r, 1200)); }
    await p.screenshot({ path: `${OUT}/${nome}.png` }); console.log(nome); await p.close();
  };
  const clicar = (t) => (p) => p.evaluate((tt) => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().startsWith(tt)); b && b.click(); }, t);
  if (process.argv[3]) { await shot('crm-fluxo', '/crm?visao=fluxo'); await b.close(); process.exit(0); }
  await shot('crm-kanban', '/crm?funil=42');
  await shot('crm-lead', '/crm?lead=14620');
  await shot('crm-fluxo', '/crm?visao=fluxo');
  await shot('dashboard', '/dashboard');
  await shot('agendamentos', '/crm?aba=agenda');
  await shot('receitas', '/receitas');
  await b.close(); process.exit(0);
})();
