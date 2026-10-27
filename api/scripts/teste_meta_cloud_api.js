#!/usr/bin/env node
/**
 * Teste ponta a ponta da WhatsApp Cloud API (API oficial da Meta).
 *
 * Faz o diagnóstico ANTES de enviar (token, número, assinatura da WABA e
 * handshake do webhook) e depois acompanha o ciclo de vida da mensagem
 * — accepted → sent → delivered → read — lendo o log do pm2.
 *
 * O ciclo completo só aparece se o webhook estiver configurado no painel e a
 * app assinada na WABA; as fases 3 e 4 checam exatamente isso, então quando
 * nenhum status chegar você já sabe por quê.
 *
 * Uso:
 *   node scripts/teste_meta_cloud_api.js --checar
 *   node scripts/teste_meta_cloud_api.js --to 5511999999999
 *   node scripts/teste_meta_cloud_api.js --to 5511999999999 --texto "Oi"
 *   node scripts/teste_meta_cloud_api.js --to 5511999999999 --template hello_world --lang en_US
 *   node scripts/teste_meta_cloud_api.js --registrar --pin 123456
 *
 * Sobrescritas (úteis enquanto o .env ainda aponta para o número de sandbox):
 *   --phone-id 1253283981208800   --waba 2051846135544667
 *   --token EAAG...               --api-version v25.0
 *   --webhook-url https://...     --timeout 120
 *
 * O token nunca é impresso: só os 6 primeiros caracteres e o tamanho.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------- utilidades

const cor = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
const verde = (s) => cor('32', s);
const vermelho = (s) => cor('31', s);
const amarelo = (s) => cor('33', s);
const cinza = (s) => cor('90', s);
const negrito = (s) => cor('1', s);

const ok = (s) => console.log(`  ${verde('✓')} ${s}`);
const falha = (s) => console.log(`  ${vermelho('✗')} ${s}`);
const aviso = (s) => console.log(`  ${amarelo('!')} ${s}`);
const info = (s) => console.log(`    ${cinza(s)}`);

function titulo(n, t) {
  console.log(`\n${negrito(`${n}. ${t}`)}`);
}

function mascarar(token) {
  if (!token) return '(vazio)';
  return `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} caracteres)`;
}

function argumentos(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const chave = a.slice(2);
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith('--')) out[chave] = true;
    else { out[chave] = proximo; i++; }
  }
  return out;
}

function carregarEnv(arquivo) {
  const env = {};
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const t = linha.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

// ------------------------------------------------------------------- config

const args = argumentos(process.argv.slice(2));

if (args.ajuda || args.help || args.h) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?|^ \* ?/gm, ''));
  process.exit(0);
}

const env = { ...carregarEnv(path.resolve(__dirname, '..', '.env')), ...process.env };

const VERSAO = args['api-version'] || 'v25.0';
const TOKEN = args.token || env.META_WA_TOKEN || '';
const PHONE_ID = args['phone-id'] || env.META_WA_PHONE_NUMBER_ID || '';
const WABA_ID = args.waba || env.META_WA_BUSINESS_ACCOUNT_ID || '';
const VERIFY_TOKEN = args['verify-token'] || env.META_WA_VERIFY_TOKEN || '';
const WEBHOOK_URL = args['webhook-url'] || 'https://duofuturo.tech/api/gestao/whatsapp/meta/webhook';
const LOG = args.log || '/var/www/apps/gestao_financeira/logs/out.log';
const TIMEOUT_S = Number(args.timeout || 120);
const BASE = `https://graph.facebook.com/${VERSAO}`;

const SOMENTE_CHECAR = Boolean(args.checar);
const REGISTRAR = Boolean(args.registrar);

// ------------------------------------------------------------- graph helper

async function graph(caminho, opcoes = {}) {
  const url = caminho.startsWith('http') ? caminho : `${BASE}/${caminho}`;
  try {
    const r = await fetch(url, {
      method: opcoes.method || 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    let corpo;
    try { corpo = JSON.parse(texto); } catch { corpo = { _bruto: texto }; }
    return { ok: r.ok, status: r.status, corpo };
  } catch (e) {
    return { ok: false, status: 0, corpo: { error: { message: `falha de rede: ${e.message}` } } };
  }
}

function erroDe(res) {
  const e = res.corpo?.error;
  if (!e) return `HTTP ${res.status}`;
  const partes = [e.message];
  if (e.code !== undefined) partes.push(`code ${e.code}`);
  if (e.error_subcode) partes.push(`subcode ${e.error_subcode}`);
  if (e.error_data?.details) partes.push(e.error_data.details);
  return partes.filter(Boolean).join(' · ');
}

// Causas prováveis por código, para não ter que caçar na documentação
const DICAS = {
  190: 'token expirado ou inválido. O token do painel dura ~24h — gere um permanente com System User.',
  200: 'faltam permissões no token (whatsapp_business_messaging / whatsapp_business_management).',
  100: 'parâmetro inválido. Quase sempre o "to" com +, espaço ou traço, ou o phone_number_id errado.',
  131047: 'fora da janela de 24h. Mande uma mensagem do seu celular para o número primeiro, ou use --template.',
  131026: 'destino não recebe: número sem WhatsApp, número errado, ou destinatário não é experimentador da app em modo dev.',
  131030: 'em modo de desenvolvimento só dá para enviar a números na lista de destinatários permitidos da app.',
  133010: 'número não registrado. Rode com --registrar --pin XXXXXX.',
  133016: 'limite de 10 registros por número em 72h estourado.',
  132001: 'template não existe nesse idioma. hello_world só existe em en_US.',
  132000: 'número de parâmetros do template não bate com o corpo aprovado.',
  368:    'número temporariamente bloqueado por violação de política.',
  80007:  'limite de taxa da WABA atingido.',
};

function dica(res) {
  const c = res.corpo?.error?.code;
  if (DICAS[c]) info(`↳ ${DICAS[c]}`);
}

// ------------------------------------------------------------------- fases

async function fase1Config() {
  titulo(1, 'Configuração');
  let bom = true;

  const linhas = [
    ['Versão da API', VERSAO, true],
    ['Token', mascarar(TOKEN), Boolean(TOKEN)],
    ['Phone Number ID', PHONE_ID || '(vazio)', Boolean(PHONE_ID)],
    ['WABA ID', WABA_ID || '(vazio)', Boolean(WABA_ID)],
    ['Verify token', VERIFY_TOKEN ? `${VERIFY_TOKEN.slice(0, 4)}… (${VERIFY_TOKEN.length} caracteres)` : '(vazio)', Boolean(VERIFY_TOKEN)],
    ['URL do webhook', WEBHOOK_URL, true],
  ];
  for (const [rotulo, valor, presente] of linhas) {
    (presente ? ok : falha)(`${rotulo.padEnd(17)} ${valor}`);
    if (!presente) bom = false;
  }

  const doEnv = env.META_WA_PHONE_NUMBER_ID;
  if (doEnv && PHONE_ID && doEnv !== PHONE_ID) {
    aviso(`o .env tem META_WA_PHONE_NUMBER_ID=${doEnv}, diferente do que está em uso agora`);
    info('token de uma app com phone_number_id de outra devolve erro 100/190 difícil de ler');
  }
  return bom;
}

async function fase2Token() {
  titulo(2, 'Token — validade e permissões');
  const res = await graph(`debug_token?input_token=${encodeURIComponent(TOKEN)}&access_token=${encodeURIComponent(TOKEN)}`);
  if (!res.ok) {
    falha(`não foi possível inspecionar o token: ${erroDe(res)}`);
    dica(res);
    return false;
  }
  const d = res.corpo.data || {};
  if (!d.is_valid) { falha('token inválido'); return false; }
  ok(`válido · app ${d.app_id ?? '?'} (${d.application ?? '?'}) · tipo ${d.type ?? '?'}`);

  if (!d.expires_at) {
    ok('não expira — é um token permanente (System User). É o que se quer em produção.');
  } else {
    const quando = new Date(d.expires_at * 1000);
    const horas = Math.round((quando - Date.now()) / 3600000);
    aviso(`expira em ${quando.toLocaleString('pt-BR')} (~${horas}h) — token temporário do painel`);
    info('para produção: Business Settings → System users → Add → atribua a app (Manage app) e a WABA');
    info('(Manage WhatsApp Business accounts) → Generate token com business_management,');
    info('whatsapp_business_messaging e whatsapp_business_management');
  }

  const escopos = d.scopes || [];
  const exigidos = ['whatsapp_business_messaging', 'whatsapp_business_management'];
  for (const e of exigidos) {
    (escopos.includes(e) ? ok : falha)(`permissão ${e}`);
  }
  if (!escopos.includes('business_management')) {
    aviso('permissão business_management ausente — a documentação pede as três para o System User');
  }
  return exigidos.every((e) => escopos.includes(e));
}

async function fase3Numero() {
  titulo(3, 'Número registrado');
  const campos = 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,throughput,status';
  const res = await graph(`${PHONE_ID}?fields=${campos}`);
  if (!res.ok) {
    falha(`não foi possível ler o número ${PHONE_ID}: ${erroDe(res)}`);
    dica(res);
    return false;
  }
  const n = res.corpo;
  ok(`${n.display_phone_number ?? '?'} · "${n.verified_name ?? '?'}"`);
  info(`qualidade: ${n.quality_rating ?? '?'} · plataforma: ${n.platform_type ?? '?'} · verificação: ${n.code_verification_status ?? '?'}`);
  if (n.throughput?.level) info(`throughput: ${n.throughput.level}`);

  if (n.status && n.status !== 'CONNECTED') {
    aviso(`status = ${n.status} (esperado CONNECTED). Se for por falta de registro, rode com --registrar --pin XXXXXX`);
    return false;
  }
  if (n.status) ok('status CONNECTED');
  return true;
}

async function fase4Assinatura() {
  titulo(4, 'Webhook — app assinada na WABA');
  if (!WABA_ID) { aviso('sem WABA ID, pulando'); return true; }

  const res = await graph(`${WABA_ID}/subscribed_apps`);
  if (!res.ok) {
    falha(`não foi possível listar as apps assinadas: ${erroDe(res)}`);
    // Aqui o code 100 nunca é sobre o "to": é o WABA ID ou a atribuição do ativo
    if (res.corpo?.error?.code === 100) {
      info('↓ o WABA ID está errado, ou a WABA não está atribuída a este System User.');
      info('  Painel → WhatsApp → Configuração da API: "Identificação da conta do WhatsApp Business".');
      info('  Atribuição: Business Settings → System users → Add assets → WhatsApp accounts');
      info('  com "Manage WhatsApp Business accounts" em Full control.');
    } else {
      dica(res);
    }
    return false;
  }
  const apps = res.corpo.data || [];
  if (apps.length === 0) {
    falha('nenhuma app assinada nesta WABA — nenhum webhook vai chegar');
    info(`assine com: curl -X POST "${BASE}/${WABA_ID}/subscribed_apps" -H "Authorization: Bearer <TOKEN>"`);
    return false;
  }
  for (const a of apps) {
    const d = a.whatsapp_business_api_data || {};
    ok(`assinada: ${d.name ?? '?'} (id ${d.id ?? '?'})`);
    if (a.override_callback_uri) info(`callback próprio desta WABA: ${a.override_callback_uri}`);
  }
  return true;
}

async function fase5Handshake() {
  titulo(5, 'Webhook — handshake do endpoint público');
  if (!VERIFY_TOKEN) { aviso('sem META_WA_VERIFY_TOKEN, pulando'); return true; }

  const desafio = String(crypto.randomInt(100000, 999999));
  const url = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=${desafio}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const corpo = (await r.text()).trim();
    if (r.status === 200 && corpo === desafio) {
      ok('endpoint devolve o hub.challenge — a Meta consegue verificar esta URL');
    } else {
      falha(`esperado 200 com "${desafio}", veio ${r.status} com "${corpo.slice(0, 60)}"`);
      if (r.status === 403) info('verify token do .env diferente do que a API em execução tem em memória — pm2 restart?');
      return false;
    }
  } catch (e) {
    falha(`endpoint inacessível: ${e.message}`);
    return false;
  }

  // Um token errado TEM que ser recusado — senão qualquer um verifica a URL
  try {
    const r = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`, { signal: AbortSignal.timeout(15000) });
    (r.status === 403 ? ok : falha)(`token errado devolve ${r.status} (esperado 403)`);
  } catch { aviso('não foi possível testar o token errado'); }

  console.log(`\n    ${cinza('No painel → Webhooks, use:')}`);
  console.log(`      URL de callback: ${WEBHOOK_URL}`);
  console.log(`      Token de verificação: o valor de META_WA_VERIFY_TOKEN do api/.env`);
  console.log(`      Campo a assinar: ${negrito('messages')}`);
  return true;
}

// ------------------------------------------------------------------- envio

function normalizarTelefone(bruto) {
  const digitos = String(bruto).replace(/\D/g, '');
  const problemas = [];
  if (!digitos.startsWith('55')) problemas.push('não começa com 55 (DDI do Brasil)');
  else if (digitos.length !== 12 && digitos.length !== 13) problemas.push(`tem ${digitos.length} dígitos (esperado 12 ou 13 com DDI 55)`);
  return { digitos, problemas };
}

async function registrar(pin) {
  titulo('R', 'Registrar o número');
  if (!/^\d{6}$/.test(String(pin || ''))) {
    falha('informe --pin com exatamente 6 dígitos (o PIN da verificação em duas etapas)');
    return false;
  }
  const res = await graph(`${PHONE_ID}/register`, { method: 'POST', body: { messaging_product: 'whatsapp', pin: String(pin) } });
  if (!res.ok) { falha(`registro recusado: ${erroDe(res)}`); dica(res); return false; }
  ok('número registrado');
  aviso('guarde esse PIN no CREDENCIAIS.md — ele é exigido para re-registrar ou migrar o número, e não dá para recuperar');
  info('o endpoint aceita só 10 chamadas por número em 72h (erro 133016)');
  return true;
}

async function enviar(para, corpo) {
  titulo(6, 'Envio');
  const { digitos, problemas } = normalizarTelefone(para);
  for (const p of problemas) aviso(`destinatário: ${p}`);
  info(`enviando para ${digitos}`);

  let payload;
  if (args.template) {
    payload = {
      messaging_product: 'whatsapp',
      to: digitos,
      type: 'template',
      template: { name: String(args.template), language: { code: args.lang || 'en_US' } },
    };
    info(`template "${payload.template.name}" (${payload.template.language.code}) — mensagem iniciada pela empresa, exige forma de pagamento`);
  } else {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digitos,
      type: 'text',
      text: { preview_url: false, body: corpo },
    };
    info('texto livre — só funciona dentro da janela de 24h aberta por uma mensagem DO cliente');
  }

  const res = await graph(`${PHONE_ID}/messages`, { method: 'POST', body: payload });
  if (!res.ok) {
    falha(`envio recusado: ${erroDe(res)}`);
    dica(res);
    return null;
  }

  const wamid = res.corpo.messages?.[0]?.id;
  const contato = res.corpo.contacts?.[0];
  ok(`aceito pela Meta · ${wamid}`);

  if (contato && contato.input !== contato.wa_id) {
    aviso(`a Meta normalizou o número: enviado ${contato.input} → wa_id ${contato.wa_id}`);
    info('é o 9º dígito do Brasil. Ao gravar no CRM, guarde o wa_id, não o que foi enviado.');
  } else if (contato) {
    ok(`wa_id ${contato.wa_id} (igual ao enviado)`);
  }

  aviso('"accepted" é aceitação, não entrega — a entrega vem pelos status abaixo');
  return wamid;
}

// ----------------------------------------------------------- acompanhamento

async function acompanhar(wamid) {
  titulo(7, `Ciclo de vida da mensagem (até ${TIMEOUT_S}s)`);

  if (!fs.existsSync(LOG)) {
    falha(`log não encontrado: ${LOG}`);
    info('passe o caminho com --log, ou acompanhe com: pm2 logs gestao-financeira-api');
    return;
  }

  // Começa do fim do arquivo: só interessa o que vier depois do envio
  let posicao = fs.statSync(LOG).size;
  const vistos = new Set();
  const inicio = Date.now();
  const ESPERADOS = ['sent', 'delivered', 'read'];

  info(`lendo ${LOG} a partir do byte ${posicao}`);
  console.log('');

  while (Date.now() - inicio < TIMEOUT_S * 1000) {
    await new Promise((r) => setTimeout(r, 1000));

    let tamanho;
    try { tamanho = fs.statSync(LOG).size; } catch { continue; }
    if (tamanho < posicao) posicao = 0;          // log rotacionado
    if (tamanho === posicao) continue;

    const fd = fs.openSync(LOG, 'r');
    const buf = Buffer.alloc(tamanho - posicao);
    fs.readSync(fd, buf, 0, buf.length, posicao);
    fs.closeSync(fd);
    posicao = tamanho;

    for (const linha of buf.toString('utf8').split('\n')) {
      if (!linha.includes(wamid)) continue;
      const m = linha.match(/Status da mensagem \S+: (\w+)/);
      const status = m ? m[1] : null;
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

      if (status === 'failed') {
        console.log(`  ${vermelho('✗')} ${String(segundos).padStart(5)}s  failed`);
        info(linha.trim());
        console.log(`\n${vermelho('A mensagem foi aceita mas não foi entregue.')} O motivo está na linha acima.`);
        return;
      }
      if (status && !vistos.has(status)) {
        vistos.add(status);
        console.log(`  ${verde('✓')} ${String(segundos).padStart(5)}s  ${status}`);
      }
    }

    if (vistos.has('read')) {
      console.log(`\n${verde('Ciclo completo:')} accepted → sent → delivered → read.`);
      console.log('A API oficial confirma entrega de verdade — ao contrário do success:true da instância Baileys.');
      return;
    }
  }

  console.log('');
  const faltando = ESPERADOS.filter((e) => !vistos.has(e));
  if (vistos.size === 0) {
    falha('nenhum status chegou');
    info('a mensagem pode ter sido entregue mesmo assim — o que faltou foi o webhook. Verifique:');
    info('1. painel → Webhooks: URL de callback preenchida e verificada');
    info('2. campo "messages" assinado (o mais esquecido)');
    info('3. app assinada na WABA (fase 4 acima)');
  } else {
    aviso(`chegou ${[...vistos].join(', ')}; faltou ${faltando.join(', ')}`);
    if (faltando.includes('read')) info('"read" só chega quando a pessoa abre a conversa — e nunca, se ela desligou a confirmação de leitura');
  }
}

// -------------------------------------------------------------------- main

(async () => {
  console.log(negrito('\nTeste da WhatsApp Cloud API — API oficial da Meta'));
  console.log(cinza('='.repeat(60)));

  if (!(await fase1Config())) {
    console.log(`\n${vermelho('Configuração incompleta.')} Preencha o api/.env ou passe --token / --phone-id.`);
    process.exit(1);
  }
  if (!TOKEN || !PHONE_ID) process.exit(1);

  const t = await fase2Token();
  const n = await fase3Numero();
  await fase4Assinatura();
  await fase5Handshake();

  if (REGISTRAR) {
    const feito = await registrar(args.pin);
    process.exit(feito ? 0 : 1);
  }

  if (SOMENTE_CHECAR) {
    console.log(`\n${cinza('Só checagem (--checar). Para enviar: --to 55DDNUMERO')}`);
    process.exit(t && n ? 0 : 1);
  }

  if (!args.to) {
    console.log(`\n${amarelo('Sem --to, nada foi enviado.')}`);
    console.log('  Primeiro mande uma mensagem do SEU celular para o número registrado (abre a janela de 24h),');
    console.log('  depois rode:  node scripts/teste_meta_cloud_api.js --to 55DDNUMERO');
    process.exit(0);
  }

  const texto = args.texto || `Teste Cloud API DuoFuturo — ${new Date().toLocaleString('pt-BR')}`;
  const wamid = await enviar(args.to, texto);
  if (!wamid) process.exit(1);

  await acompanhar(wamid);
  console.log('');
})();
