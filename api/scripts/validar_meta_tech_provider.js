#!/usr/bin/env node
/**
 * Confere a configuração do app Meta contra a checklist de Provedor de Tecnologia.
 *
 * Roda contra a Graph API, não contra o painel: o painel esconde campo vazio e
 * usa a mesma frase de erro para "ID inexistente" e "ativo não atribuído".
 *
 *   node scripts/validar_meta_tech_provider.js
 */
require('dotenv').config();

const G = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_WA_TOKEN;
const VERIFY = process.env.META_WA_VERIFY_TOKEN;
const APP = process.env.META_WA_APP_ID || '1927360974611513';
const BIZ = process.env.META_WA_BUSINESS_ID || '2552041805258637';
const WABA = process.env.META_WA_BUSINESS_ACCOUNT_ID;
const PHONE = process.env.META_WA_PHONE_NUMBER_ID;
const CALLBACK = 'https://duofuturo.tech/api/gestao/whatsapp/meta/webhook';

const c = { ok: '\x1b[32m', no: '\x1b[31m', wa: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
let falhas = 0, avisos = 0;
const ok = (m) => console.log(`  ${c.ok}OK   ${c.off} ${m}`);
const no = (m) => { falhas++; console.log(`  ${c.no}FALHA${c.off} ${m}`); };
const wa = (m) => { avisos++; console.log(`  ${c.wa}AVISO${c.off} ${m}`); };
const titulo = (m) => console.log(`\n${m}`);

const graph = async (path, fields) => {
  const url = `${G}/${path}?${fields ? `fields=${fields}&` : ''}access_token=${TOKEN}`;
  const r = await fetch(url);
  return r.json();
};

// A página legal é o que o revisor abre. Gabarito não preenchido reprova em silêncio.
const GABARITO = /\[RAZÃO SOCIAL\]|\[CNPJ\]|\[ENDEREÇO\]|\[COMARCA|ENCARREGADO\]/;

async function pagina(url, rotulo) {
  if (!url) return no(`${rotulo}: URL não configurada no app`);
  let r;
  try { r = await fetch(url); } catch (e) { return no(`${rotulo}: ${url} inacessível (${e.message})`); }
  if (r.status !== 200) return no(`${rotulo}: ${url} responde ${r.status}`);
  const html = await r.text();
  ok(`${rotulo}: ${url} responde 200`);
  if (GABARITO.test(html)) no(`${rotulo}: ainda tem campo de gabarito não preenchido`);
  if (/whatsapp/i.test(html)) ok(`${rotulo}: cita WhatsApp`);
  else no(`${rotulo}: NÃO cita WhatsApp — o revisor procura por isso`);
}

(async () => {
  if (!TOKEN) { console.error('META_WA_TOKEN ausente no .env'); process.exit(1); }

  titulo('1 · Configurações do app');
  const app = await graph(APP, 'name,category,privacy_policy_url,terms_of_service_url');
  if (app.error) no(app.error.message);
  else {
    app.category ? ok(`categoria: ${app.category}`) : no('categoria VAZIA — a Meta cita isso na checklist');
    await pagina(app.privacy_policy_url, 'Privacidade');
    await pagina(app.terms_of_service_url, 'Termos');
  }

  titulo('2 · Verificação da empresa');
  const biz = await graph(BIZ, 'name,verification_status');
  biz.verification_status === 'verified'
    ? ok(`portfólio "${biz.name}" verificado`)
    : no(`portfólio: ${biz.verification_status || biz.error?.message}`);

  titulo('3 · WhatsApp Business Account');
  const waba = await graph(WABA, 'name,account_review_status,business_verification_status,health_status');
  if (waba.error) no(`WABA ${WABA}: ${waba.error.message}`);
  else {
    waba.account_review_status === 'APPROVED' ? ok(`WABA "${waba.name}" APPROVED`) : no(`WABA: ${waba.account_review_status}`);
    const h = waba.health_status?.can_send_message;
    h === 'AVAILABLE' ? ok('can_send_message: AVAILABLE') : no(`can_send_message: ${h}`);
    for (const e of waba.health_status?.entities || []) {
      if (e.can_send_message !== 'AVAILABLE') no(`${e.entity_type} ${e.id}: ${e.can_send_message}`);
    }
  }

  titulo('4 · Número');
  const p = await graph(PHONE, 'display_phone_number,verified_name,quality_rating,code_verification_status,name_status,new_display_name,new_name_status,status,platform_type');
  if (p.error) no(p.error.message);
  else {
    ok(`${p.display_phone_number} · ${p.platform_type} · qualidade ${p.quality_rating} · ${p.status}`);
    p.code_verification_status === 'VERIFIED' ? ok('número verificado') : no(`verificação: ${p.code_verification_status}`);

    // `verified_name` é o nome APROVADO — ele não muda enquanto a troca está em
    // análise. Ler só `name_status` faz um pedido já enviado parecer esquecido.
    if (p.name_status === 'APPROVED') {
      ok(`nome de exibição aprovado: "${p.verified_name}"`);
    } else if (p.new_name_status === 'PENDING_REVIEW') {
      wa(`troca para "${p.new_display_name}" em análise na Meta — até aprovar, quem recebe continua vendo "${p.verified_name}", e é esse nome que aparece no vídeo`);
    } else if (p.new_name_status === 'APPROVED') {
      // Aprovado e ainda assim fora do ar: é o caso de 19/09/2026. Quem só lê
      // `name_status` vê "DECLINED" e dá o pedido por perdido.
      wa(`troca para "${p.new_display_name}" APROVADA, mas ainda não em vigor — quem recebe vê "${p.verified_name}". ` +
         (p.code_verification_status === 'VERIFIED'
           ? 'o número está verificado; confira em Gerenciador do WhatsApp → Números de telefone'
           : `o número está ${p.code_verification_status}: reverifique (request_code + verify_code) para o nome entrar`));
    } else {
      wa(`name_status ${p.name_status} para "${p.verified_name}" — quem recebe não vê nome verificado, e é isso que aparece no vídeo`);
    }
  }

  titulo('5 · Webhooks');
  const subs = await graph(`${WABA}/subscribed_apps`);
  const inscrito = (subs.data || []).some((s) => s.whatsapp_business_api_data?.id === APP);
  inscrito ? ok('app inscrito nos webhooks da WABA') : no('app NÃO inscrito — POST /{waba}/subscribed_apps');
  const desafio = `ping${Date.now()}`;
  try {
    const r = await fetch(`${CALLBACK}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=${desafio}`);
    (await r.text()) === desafio ? ok('callback público devolve o challenge') : no('callback não devolveu o challenge');
  } catch (e) { no(`callback inacessível: ${e.message}`); }

  titulo('6 · Permissões do token');
  const dbg = await (await fetch(`${G}/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`)).json();
  const d = dbg.data || {};
  for (const perm of ['whatsapp_business_messaging', 'whatsapp_business_management', 'business_management']) {
    (d.scopes || []).includes(perm) ? ok(perm) : no(`${perm} ausente no token`);
  }
  d.is_valid ? ok(`token ${d.type} válido`) : no('token inválido');
  d.expires_at === 0 ? ok('token permanente (não expira)') : wa(`token expira em ${new Date(d.expires_at * 1000).toISOString()}`);

  titulo('7 · whatsapp_business_management responde');
  const t = await graph(`${WABA}/message_templates`, 'name,status,category');
  t.error ? no(t.error.message) : ok(`${t.data.length} modelo(s) na WABA: ${t.data.map((x) => x.name).join(', ')}`);

  console.log(`\n${falhas ? c.no : c.ok}${falhas} falha(s)${c.off}, ${avisos} aviso(s).`);
  console.log(`${c.dim}Acesso avançado às duas permissões não é consultável por API — confira em Análise do App.${c.off}`);
  process.exit(falhas ? 1 : 0);
})();
