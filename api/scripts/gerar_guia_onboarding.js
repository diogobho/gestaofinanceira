/**
 * Regera o guia de onboarding: capturas de tela + PDF.
 *
 *   DEMO_SENHA='...' node api/scripts/gerar_guia_onboarding.js
 *
 * Fonte do conteúdo: /var/www/apps/landing/onboarding/guia.html — editar lá e
 * rodar isto; nunca editar o PDF à mão.
 * Saída: onboarding/telas/*.png + UM PDF POR PLANO.
 *
 * São três PDFs porque a trilha é diferente em cada plano: o Starter não tem CRM
 * e receberia um guia mandando montar funil. Quem recorta é o próprio guia.html,
 * pelo `?plano=` (as seções têm `data-plano`) — assim a página publicada e o PDF
 * nunca divergem. O `primeiros-passos-duofuturo-crm.pdf` continua sendo gerado
 * como a versão completa: é o arquivo que a landing publica e que e-mail antigo
 * já linkou.
 *
 * Regra de ouro: só a conta DEMO (empresa 31, "Clínica Vida Leve", dados 100%
 * fictícios). Nunca empresa real — os cards do CRM têm nome e telefone de gente
 * de verdade (LGPD). Senha da conta demo: CREDENCIAIS.md, via env DEMO_SENHA.
 *
 * A tela de WhatsApp é renderizada com as respostas da API interceptadas: a UI é
 * a real, mas o QR é um código de exemplo que aponta para o próprio guia — assim
 * o print não expõe um QR de produção (quem escaneasse entraria na nossa sessão).
 *
 * Duas armadilhas do PDF, já resolvidas: não declarar `@page { margin }` no CSS
 * (sobrescreve a margem passada aqui e o texto invade o rodapé) e nada de emoji
 * (o Chrome do servidor não tem a fonte e desenha um quadradinho).
 */
const puppeteer = require('/var/www/apps/whatsapp-integration/node_modules/puppeteer');
const QRCode = require('/var/www/apps/whatsapp-integration/node_modules/qrcode');
const fs = require('fs');
const path = require('path');

const BASE = 'https://duofuturo.tech/gestao';
const DEST = '/var/www/apps/landing/onboarding';
const TELAS = path.join(DEST, 'telas');
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 2 };

const DEMO = { email: 'demo-screenshots@futuron.interno', senha: process.env.DEMO_SENHA, id: 55 };
if (!DEMO.senha) {
  console.error('Falta DEMO_SENHA.  Uso: DEMO_SENHA=... node gerar_guia_onboarding.js');
  process.exit(1);
}

// Recorte de cada print, em coordenadas CSS (não multiplicar pelo dpr).
// Sem isso sobra muito vazio, e o PDF encolhe justamente o que importa.
const RECORTES = {
  '01-cadastro':     { x: 380, y: 90,  width: 520, height: 760 },  // só o cartão do formulário
  '02-whatsapp-qr':  { x: 256, y: 0,   width: 524, height: 500 },  // conteúdo + card do QR
  '03-config-email': { x: 256, y: 0,   width: 1014, height: 710 }, // conteúdo + formulário
  '05-crm-funil':    { x: 0,   y: 0,   width: 1280, height: 890 }, // tela toda: serve de mapa do menu
  '06-receitas':     { x: 256, y: 0,   width: 1024, height: 720 },
  '07-parcelas':     { x: 256, y: 0,   width: 1024, height: 720 },
  '08-dashboard':    { x: 256, y: 0,   width: 1024, height: 800 },
  '09-agente-ia':    { x: 256, y: 0,   width: 1024, height: 760 },
};

// Um PDF por plano. A chave é o `?plano=` que o guia entende; `null` é a versão
// completa (tudo, inclusive o passo de criar a conta).
const PDFS = [
  { plano: null,           arquivo: 'primeiros-passos-duofuturo-crm.pdf' },
  { plano: 'starter',      arquivo: 'primeiros-passos-starter.pdf' },
  { plano: 'profissional', arquivo: 'primeiros-passos-profissional.pdf' },
  { plano: 'enterprise',   arquivo: 'primeiros-passos-enterprise.pdf' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(TELAS, { recursive: true });
  const qrExemplo = await QRCode.toBuffer('https://duofuturo.tech/onboarding/guia', { width: 512, margin: 1 });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const shot = async (page, nome, seletor) => {
    const destino = path.join(TELAS, `${nome}.png`);
    if (seletor) {
      const el = await page.$(seletor);
      if (!el) throw new Error(`seletor não encontrado para ${nome}: ${seletor}`);
      await el.screenshot({ path: destino });
    } else {
      await page.screenshot({ path: destino, clip: RECORTES[nome] });
    }
    console.log('✔', nome);
  };

  // ---------- 1. Cadastro (tela pública) ----------
  {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await shot(page, '01-cadastro');
    await page.close();
  }

  // ---------- login na conta demo ----------
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const json = body => req.respond({ status: 200, contentType: 'application/json', body });
    // `pareado: false` é o que a tela usa para dizer "Aguardando leitura"; sem ele o
    // cartão caía em "Reconectando", que não é o que um cliente novo vê.
    const statusDesconectado = JSON.stringify({
      clientId: 'demo', status: 'disconnected', hasQrCode: true,
      pareado: false, numero: null, aguardandoQr: true,
      qrExpiraEm: 45, qrGeradoEm: new Date().toISOString(),
      banido: false, lastDisconnect: null, timestamp: new Date().toISOString(),
    });

    if (url.includes('/whatsapp/config')) {
      return json(JSON.stringify({ configurado: true, porta: 3020, conectado: false }));
    }
    /**
     * A conta demo é Enterprise, e desde 20/09/2026 a tela de WhatsApp de quem tem
     * direito ao número oficial abre com o convite do canal oficial em cima do QR
     * Code — o print da seção "Conectar o seu WhatsApp", que é do PROFISSIONAL,
     * sairia mostrando a tela de outro plano. Aqui a assinatura é respondida sem
     * `whatsapp_oficial`, e a tela fotografada é a que o leitor daquela seção tem.
     */
    if (url.match(/\/assinaturas\/minha$/)) {
      return json(JSON.stringify({
        assinatura: { plano: { nome: 'Profissional' }, status: 'ativa' },
        capacidades: ['financeiro', 'relatorios', 'duo_chat', 'crm', 'whatsapp_qr',
                      'agente_reativo', 'followup_morno', 'disparo_email', 'grupos_whatsapp'],
      }));
    }
    // A faixa do canal oficial não entra no print do QR (ver acima).
    if (url.includes('/whatsapp/canal/oficial')) {
      return json(JSON.stringify({ embeddedSignup: { configurado: false, faltando: [], appId: null, configId: null, graphVersion: 'v25.0' }, conta: null }));
    }
    // visão do dono da conta ("WhatsApp da Empresa"): um cartão por usuário
    if (url.match(/\/whatsapp\/empresa\/usuarios$/)) {
      return json(JSON.stringify([{
        id: DEMO.id, nome: 'Ana Ribeiro', email: 'ana@clinicavidaleve.com.br',
        configurado: true, porta: 3020, conectado: false,
      }]));
    }
    if (url.includes('/whatsapp/empresa/usuarios/') && url.includes('/status')) return json(statusDesconectado);
    if (url.includes('/whatsapp/status')) return json(statusDesconectado);
    if (url.includes('qr-image')) {
      return req.respond({ status: 200, contentType: 'image/png', body: qrExemplo });
    }
    if (url.includes('/whatsapp/qr')) {
      return json(JSON.stringify({ clientId: 'demo', qrCode: 'exemplo', hasQrCode: true }));
    }
    return req.continue();
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.type('input[type="email"]', DEMO.email);
  await page.type('input[type="password"]', DEMO.senha);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /entrar|login/i.test(x.innerText));
    if (b) b.click();
  });
  await sleep(4500);
  // sem isso o modal do tour cobre todas as telas
  await page.evaluate(id => {
    localStorage.setItem(`tour_done_${id}`, '1');
    localStorage.setItem('tour_done_welcome', '1');
  }, DEMO.id);

  const ir = async (rota, espera = 3500) => {
    await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle2' });
    await sleep(espera);
    await page.evaluate(() => window.scrollTo(0, 0));
  };

  await ir('/whatsapp', 4000);
  await shot(page, '02-whatsapp-qr');

  await ir('/configuracoes/email');
  // fecha o guia Brevo: o print tem que mostrar o formulário
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Ocultar.*guia Brevo/i.test(x.innerText));
    if (b) b.click();
  });
  await sleep(800);
  await shot(page, '03-config-email');

  await ir('/perfil');
  await page.evaluate(() => {
    const el = document.querySelector('[data-tour="perfil-assinatura"]');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await sleep(1200);
  await shot(page, '04-assinatura', '[data-tour="perfil-assinatura"]');

  await ir('/crm', 5000);
  await shot(page, '05-crm-funil');

  await ir('/receitas');
  await shot(page, '06-receitas');

  await ir('/parcelas');
  await shot(page, '07-parcelas');

  await ir('/dashboard', 5000);
  await shot(page, '08-dashboard');

  // Agente IA → aba "Configurar Agente". A conta demo é `creator`, que é quem
  // enxerga essa aba — com um usuário `master` o print sairia sem ela.
  await ir('/agente-duo', 4000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Configurar Agente/i.test(x.innerText));
    if (b) b.click();
  });
  await sleep(1500);
  await shot(page, '09-agente-ia');

  await page.close();

  // ---------- PDFs (um por plano) ----------
  const pdfPage = await browser.newPage();
  for (const { plano, arquivo } of PDFS) {
    const url = 'https://duofuturo.tech/onboarding/guia' + (plano ? `?plano=${plano}` : '');
    await pdfPage.goto(url, { waitUntil: 'networkidle0' });
    await pdfPage.pdf({
      path: path.join(DEST, arquivo),
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '17mm', left: '0mm', right: '0mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#9aa1ad;font-family:Arial;padding:0 18mm;' +
        'display:flex;justify-content:space-between;">' +
        '<span>DuoFuturo &middot; Gest\u00e3o Financeira CRM &middot; suporte@duofuturo.tech</span>' +
        '<span>P\u00e1gina <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    });
    console.log('✔', arquivo);
  }

  await browser.close();
  console.log(`\npronto: ${DEST}`);
})();
