/**
 * Fábrica dos vídeos-tutoriais: um roteiro (frases + ações) vira um mp4 narrado, com
 * legenda numa faixa própria abaixo da tela (nunca cobre o que está sendo mostrado),
 * um .vtt e uma capa. Grava na conta DEMO (empresa 31, dados fictícios — nunca empresa
 * real) e só lê: toda requisição que não é GET é respondida localmente, nada grava.
 *
 *   node api/scripts/videos/gerar.js agendar-followup [pasta-de-saída]
 *
 * A tela anda no ritmo da fala: cada passo dura o que a frase dura (ou o que a ação
 * leva, se for mais). Mudou a tela do Duo? Roda de novo — a voz vem do cache.
 */
process.chdir('/var/www/apps/gestao_financeira/api');
require('/var/www/apps/gestao_financeira/api/node_modules/dotenv').config({ path: '/var/www/apps/gestao_financeira/api/.env' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('/var/www/apps/whatsapp-integration/node_modules/puppeteer');
const { signAccessToken } = require('/var/www/apps/gestao_financeira/api/dist/config/jwt.js');
const { query } = require('/var/www/apps/gestao_financeira/api/dist/config/database.js');
const { falar } = require('./tts');

const W = 1440, H = 860;             // tela gravada
const VW = 1280, VH = 764, FAIXA = 120; // vídeo final: tela escalada + faixa da legenda
const NAVY = '#13264C', DOURADO = '#D2B773';
const BASE = 'https://duofuturo.tech/gestao';
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const id = process.argv[2];
if (!id) { console.error('uso: node gerar.js <roteiro> [saída]'); process.exit(1); }
const roteiro = require(`./roteiros/${id}.js`);
const SAIDA = process.argv[3] || '/var/www/apps/landing/assets/videos/tutoriais';
const TMP = path.join(__dirname, '.tmp', id);

// ---------- legenda ----------
// Frase longa vira blocos curtos (até ~70 caracteres), com o tempo dividido pelo tamanho.
function blocos(texto, ini, fim) {
  const partes = texto.match(/[^,.;:!?]+[,.;:!?]*/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let atual = '';
  for (const p of partes) {
    if (atual && (atual + ' ' + p).length > 70) { out.push(atual); atual = p; } else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) out.push(atual);
  const total = out.reduce((s, b) => s + b.length, 0);
  let t = ini;
  return out.map((b) => { const d = ((fim - ini) * b.length) / total; const c = { ini: t, fim: t + d, texto: b }; t += d; return c; });
}
const hms = (s, sep) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${String(h).padStart(sep === '.' ? 2 : 1, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(sep === '.' ? 3 : 2).padStart(sep === '.' ? 6 : 5, '0')}`;
};
function vtt(cues) {
  return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${hms(c.ini, '.')} --> ${hms(c.fim, '.')}\n${c.texto}\n`).join('\n');
}
function ass(cues) {
  const y = VH + FAIXA / 2;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${VW}
PlayResY: ${VH + FAIXA}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Poppins Medium,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.map((c) => `Dialogue: 0,${hms(c.ini, ',')},${hms(c.fim, ',')},Leg,,0,0,0,,{\\an5\\pos(${VW / 2},${y})}${c.texto}`).join('\n')}
`;
}

// ---------- gravação ----------
async function gravar(passos) {
  // `usuario` no roteiro: grava com outra conta (ex.: o vídeo de verificação do Google, que
  // precisa da agenda REAL conectada). Padrão: a demo (55, empresa 31) — nunca empresa real (LGPD).
  const uid = roteiro.usuario || 55;
  const u = (await query(`SELECT id, email, nivel, empresa_id, tipo_usuario, nome FROM usuarios WHERE id = $1 AND (empresa_id = 31 OR $2)`, [uid, !!roteiro.usuario])).rows[0];
  if (!u) throw new Error(`Usuário ${uid} não encontrado`);
  const token = signAccessToken({ userId: u.id, id: u.id, email: u.email, nivel: u.nivel, empresa_id: u.empresa_id, tipo_usuario: u.tipo_usuario });
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--lang=pt-BR',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', // microfone falso: gravar áudio no vídeo
      // COM_MOUSE=1: o headless se declara touch e esconde o que é só de mouse (dica de vídeo, olhar do Duo).
      ...(process.env.COM_MOUSE ? ['--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'] : [])],
    env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR:pt' } }); // só o --lang não muda o campo de data
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' }); // datas em dd/mm/aaaa
  await p.emulateTimezone('America/Sao_Paulo');
  // O que o vídeo "salva" só existe na tela: o roteiro registra, com h.simular(), como a
  // resposta de um GET deve sair depois da ação (card em outra etapa, lead novo na lista…).
  // As do roteiro (`simular: [[regex, fn]]`) valem desde o carregamento — ex.: a demo "no número oficial".
  const simulacoes = (roteiro.simular || []).map(([padrao, fn]) => ({ padrao, fn }));
  await p.setRequestInterception(true);
  p.on('request', async (r) => {
    const url = r.url();
    if (!url.includes('/api/')) return r.continue();
    // `real: true`: as ações vão de verdade para a API (nada é respondido pelo gerador).
    if (r.method() !== 'GET' && !roteiro.real) {
      // `responder: [[regex, corpo]]` no roteiro: a resposta que a tela espera daquela ação
      // (ex.: o upload de imagem devolve a URL). O resto recebe um "ok" genérico.
      const resp = (roteiro.responder || []).find(([re]) => re.test(url));
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(resp ? resp[1] : { success: true, data: { id: 0 } }) });
    }
    // `arquivos: [[regex, { tipo, caminho }]]`: GET respondido com um arquivo local (ex.: imagem do QR).
    const arq = (roteiro.arquivos || []).find(([re]) => re.test(url));
    if (arq) return r.respond({ status: 200, contentType: arq[1].tipo, body: fs.readFileSync(arq[1].caminho) });
    const ativas = simulacoes.filter((s) => s.padrao.test(url));
    if (!ativas.length) return r.continue();
    try {
      const res = await fetch(url, { headers: r.headers() });
      let json = await res.json().catch(() => ({}));
      for (const s of ativas) json = s.fn(json, url) ?? json;
      r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(json) }); // simulado: o real pode até recusar (demo sem conta)
    } catch (e) { console.log('  simulação falhou:', e.message); r.continue(); }
  });
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((t, usr) => {
    localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); localStorage.setItem('theme', 'light');
    localStorage.setItem('tours_vistos', JSON.stringify(['*']));
  }, token, { ...u, userId: u.id });
  await p.goto(`${BASE}${roteiro.rota}`, { waitUntil: 'networkidle2' });
  await dorme(1500);
  await p.evaluate(() => document.querySelectorAll('.driver-popover,.driver-overlay').forEach((e) => e.remove()));

  // Cursor, clique e destaque desenhados na página (o screencast não mostra o cursor real).
  // Em função: `h.recarregar()` desenha de novo depois de um reload.
  const vestir = () => p.evaluate((NAVY, DOURADO) => {
    const c = document.createElement('div'); c.id = 'v-cursor';
    c.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="${NAVY}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    document.body.appendChild(c);
    const r = document.createElement('div'); r.id = 'v-ripple';
    r.style.cssText = `position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid ${DOURADO};z-index:2147483646;pointer-events:none;opacity:0`;
    document.body.appendChild(r);
    const d = document.createElement('div'); d.id = 'v-destaque';
    d.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;border:3px solid ${DOURADO};border-radius:10px;box-shadow:0 0 0 4px rgba(210,183,115,.25),0 0 24px rgba(210,183,115,.55);opacity:0;transition:all .35s ease`;
    document.body.appendChild(d);
    document.addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  }, NAVY, DOURADO);
  await vestir();

  let pos = { x: W / 2, y: H / 2 };
  await p.mouse.move(pos.x, pos.y);
  const ir = async (x, y, ms = 700) => {
    const n = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await p.mouse.move(pos.x + (x - pos.x) * e, pos.y + (y - pos.y) * e); await dorme(16);
    }
    pos = { x, y };
  };
  // Acha o elemento visível cujo texto começa com `texto` (ou o 1º do seletor) e devolve o retângulo.
  const caixa = (sel, texto, dentro) => p.evaluate((s, t, dentro) => {
    const raiz = (dentro && document.querySelector(dentro)) || document;
    const el = [...raiz.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (!t || (e.innerText || e.placeholder || '').trim().startsWith(t)));
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel, texto || '', dentro || '');
  const h = {
    p, dorme, ir,
    simular(padrao, fn) { simulacoes.push({ padrao, fn }); },
    // Arrasta (com o cursor visível) do elemento A até o ponto B — o Kanban usa @hello-pangea/dnd.
    async arrastar(de, ate, { ms = 1400 } = {}) {
      await ir(de.x, de.y, 700);
      await p.mouse.down(); await dorme(200);
      await p.mouse.move(de.x + 6, de.y + 6); await dorme(120);
      pos = { x: de.x + 6, y: de.y + 6 };
      await ir(ate.x, ate.y, ms);
      await dorme(350); await p.mouse.up();
    },
    centro: async (sel, texto, dentro) => { const c = await caixa(sel, texto, dentro); if (!c) throw new Error(`não achei ${sel} "${texto}"`); return { ...c, x: c.x + c.w / 2, y: c.y + c.h / 2 }; },
    async clicar(sel, texto, { ms = 750, dentro } = {}) {
      const c = await caixa(sel, texto, dentro);
      if (!c) throw new Error(`não achei ${sel} "${texto}"`);
      await h.clicarPonto({ x: c.x + c.w / 2, y: c.y + c.h / 2 }, { ms });
    },
    async clicarPonto({ x, y }, { ms = 750 } = {}) {
      await ir(x, y, ms);
      await p.evaluate((x, y) => { const r = document.getElementById('v-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px';
        r.animate([{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, x, y);
      await p.mouse.click(x, y);
    },
    // <select> nativo: a lista aberta não aparece na gravação (é janela do sistema), então o
    // cursor vai até o campo, "clica" e a opção é escolhida direto — o campo mostra a troca.
    async escolher(sel, opcao, { dentro, ms = 750 } = {}) {
      const c = await caixa(sel, '', dentro);
      if (!c) throw new Error(`não achei ${sel}`);
      await ir(c.x + c.w / 2, c.y + c.h / 2, ms);
      await p.evaluate((x, y) => { const r = document.getElementById('v-ripple'); r.style.left = x + 'px'; r.style.top = y + 'px';
        r.animate([{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450 }); }, c.x + c.w / 2, c.y + c.h / 2);
      await dorme(350);
      const ok = await p.evaluate((s, opcao, dentro) => {
        const raiz = (dentro && document.querySelector(dentro)) || document;
        const el = [...raiz.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0);
        const o = el && [...el.options].find((o) => o.text.trim().startsWith(opcao));
        if (!o) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, o.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, sel, opcao, dentro || '');
      if (!ok) throw new Error(`não achei a opção "${opcao}" em ${sel}`);
    },
    async destacar(sel, texto, { dentro, folga = 6 } = {}) {
      const c = await caixa(sel, texto, dentro);
      if (!c) throw new Error(`não achei ${sel} "${texto}" para destacar`);
      await p.evaluate((c, f) => { const d = document.getElementById('v-destaque');
        Object.assign(d.style, { left: c.x - f + 'px', top: c.y - f + 'px', width: c.w + 2 * f + 'px', height: c.h + 2 * f + 'px', opacity: 1 }); }, c, folga);
    },
    async semDestaque() { await p.evaluate(() => { document.getElementById('v-destaque').style.opacity = 0; }); },
    async digitar(texto, atraso = 45) { await p.keyboard.type(texto, { delay: atraso }); },
    async cartaz(titulo, sub) {
      await p.evaluate((titulo, sub, NAVY, DOURADO) => {
        const el = document.createElement('div'); el.id = 'v-cartaz';
        el.style.cssText = `position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 30% 20%,#1d3766,${NAVY} 60%);font-family:Poppins,sans-serif;transition:opacity .6s ease;text-align:center;padding:0 120px`;
        el.innerHTML = `<div style="color:${DOURADO};font-size:18px;letter-spacing:.25em;font-weight:600">TUTORIAL · DUO</div>
          <div style="color:#fff;font-size:52px;font-weight:600;line-height:1.15;max-width:1000px">${titulo}</div>
          ${sub ? `<div style="color:#c9d3e6;font-size:22px;font-weight:400">${sub}</div>` : ''}
          <div style="width:80px;height:4px;border-radius:2px;background:${DOURADO};margin-top:6px"></div>`;
        document.body.appendChild(el);
        document.getElementById('v-cursor').style.visibility = 'hidden';
      }, titulo, sub || '', NAVY, DOURADO);
    },
    // Recarrega a página (ex.: o canal "conectou" e a tela só relê no carregamento) sem perder cursor e destaque.
    async recarregar() {
      await p.reload({ waitUntil: 'networkidle2' });
      await vestir();
      await p.evaluate(() => document.querySelectorAll('.driver-popover,.driver-overlay').forEach((e) => e.remove()));
      await p.mouse.move(pos.x + 1, pos.y); await p.mouse.move(pos.x, pos.y);
    },
    async tirarCartaz() { await p.evaluate(() => { const e = document.getElementById('v-cartaz'); if (e) { e.style.opacity = 0; setTimeout(() => e.remove(), 700); } document.getElementById('v-cursor').style.visibility = 'visible'; }); await dorme(650); },
  };

  // Captura própria pelo DevTools: cada quadro chega com o horário em que foi desenhado,
  // então a imagem casa com a fala ao centésimo (o p.screencast() perdia ~5 s).
  const cdp = await p.createCDPSession();
  const quadros = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const arq = path.join(TMP, `q${String(quadros.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(arq, Buffer.from(data, 'base64'));
    quadros.push({ ts: metadata.timestamp, arq });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await p.mouse.move(pos.x + 1, pos.y); // força o primeiro quadro
  await dorme(300);
  const t0 = Date.now();
  const linha = [];
  await dorme(400);
  for (const [i, passo] of passos.entries()) {
    const ini = (Date.now() - t0) / 1000;
    console.log(`  passo ${i + 1}/${passos.length} @ ${ini.toFixed(1)}s — ${passo.fala.slice(0, 60)}`);
    const acao = (async () => { await dorme(passo.atraso || 0); if (passo.acao) await passo.acao(h); })()
      .catch(async (e) => { // quadro do erro, para ver o que a tela mostrava
        if (process.env.VOZ_ENSAIO) await p.screenshot({ path: path.join(SAIDA, `${id}-erro.png`) }).catch(() => {});
        throw e;
      });
    await Promise.all([acao, dorme(passo.voz.duracao * 1000 + (passo.pausa ?? 450))]);
    linha.push({ ini, voz: passo.voz, legenda: passo.legenda || passo.fala });
  }
  await dorme(600);
  const total = (Date.now() - t0) / 1000;
  await cdp.send('Page.stopScreencast');
  await b.close();
  return { linha, total, quadros, t0: t0 / 1000 };
}

// ---------- montagem ----------
function montar({ linha, total, quadros, t0 }) {
  // Quadros → vídeo com a duração real de cada um (a tela parada não gera quadro novo).
  const fim = t0 + total;
  const uteis = quadros.filter((q, i) => i === quadros.length - 1 || quadros[i + 1].ts > t0);
  let lista = 'ffconcat version 1.0\n';
  uteis.forEach((q, i) => {
    const de = Math.max(q.ts, t0), ate = Math.min(i + 1 < uteis.length ? uteis[i + 1].ts : fim, fim);
    if (ate > de) lista += `file '${q.arq}'\nduration ${(ate - de).toFixed(4)}\n`;
  });
  lista += `file '${uteis[uteis.length - 1].arq}'\n`;
  const arqLista = path.join(TMP, 'quadros.txt');
  fs.writeFileSync(arqLista, lista);
  console.log(`  ${quadros.length} quadros; 1º quadro ${(uteis[0].ts - t0).toFixed(2)}s após o início`);

  const entradas = linha.flatMap((l) => ['-i', l.voz.arquivo]);
  const filtros = linha.map((l, i) => `[${i}:a]adelay=${Math.round(l.ini * 1000)}:all=1[a${i}]`).join(';')
    + `;${linha.map((_, i) => `[a${i}]`).join('')}amix=inputs=${linha.length}:normalize=0,apad,atrim=0:${total.toFixed(2)},loudnorm=I=-16:TP=-1.5[a]`;
  const audio = path.join(TMP, 'audio.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...entradas, '-filter_complex', filtros, '-map', '[a]', '-ar', '48000', audio]);

  const cues = linha.flatMap((l) => blocos(l.legenda, l.ini, l.ini + l.voz.duracao));
  const arqAss = path.join(TMP, 'legenda.ass');
  fs.writeFileSync(arqAss, ass(cues));
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, `${id}.vtt`), vtt(cues));

  const mp4 = path.join(SAIDA, `${id}.mp4`);
  const fontes = path.join(__dirname, 'fonts');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', arqLista, '-i', audio,
    '-filter_complex', `[0:v]fps=30,scale=${VW}:${VH},pad=${VW}:${VH + FAIXA}:0:0:color=0x13264C,ass=${arqAss}:fontsdir=${fontes}[v]`,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', mp4]);
  // Capa: o cartaz de abertura, antes de a primeira legenda entrar.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.3', '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(SAIDA, `${id}.jpg`)]);
  const tam = (fs.statSync(mp4).size / 1048576).toFixed(1);
  console.log(`\n✔ ${mp4} — ${total.toFixed(1)}s, ${tam} MB, ${cues.length} legendas`);
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  console.log(`Voz (${roteiro.passos.length} frases)…`);
  for (const passo of roteiro.passos) passo.voz = await falar(passo.fala, roteiro.idioma);
  console.log('Gravando…');
  const r = await gravar(roteiro.passos);
  console.log('Montando…');
  montar(r);
  process.exit(0);
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
