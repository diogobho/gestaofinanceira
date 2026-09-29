#!/usr/bin/env node
/**
 * Confere, contra o banco E contra a API no ar, que cada plano faz o que promete:
 * Enterprise no canal oficial da Meta, Profissional no Baileys sem o que causa ban.
 *
 * Existe porque a regra vive em três lugares que podem divergir em silêncio — a
 * migration, o catálogo do backend e o espelho da tela. `npm test` prende os dois
 * primeiros; só uma chamada de verdade prova o terceiro e o guard de rota.
 *
 *   node scripts/verificar_capacidades.js          # só banco (não toca na rede)
 *   node scripts/verificar_capacidades.js --api    # + chamadas reais à API
 *
 * Sai com código 1 se algo reprovar — serve em CI e em conferência pós-deploy.
 * NENHUMA chamada aqui envia mensagem: só leitura e uma rota de escrita que é
 * recusada de propósito (o 403 é o que se quer medir).
 */
require('dotenv').config();

const { capacidadesDaEmpresa, CATALOGO } = require('../dist/shared/capacidades');
const { query, pool } = require('../dist/config/database');
const { signAccessToken } = require('../dist/config/jwt');

const BASE = process.env.VERIFICAR_API_URL || 'https://duofuturo.tech/api/gestao';

const c = { ok: '\x1b[32m', no: '\x1b[31m', wa: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
let falhas = 0, avisos = 0;
const ok = (m) => console.log(`  ${c.ok}OK   ${c.off} ${m}`);
const no = (m) => { falhas++; console.log(`  ${c.no}FALHA${c.off} ${m}`); };
const wa = (m) => { avisos++; console.log(`  ${c.wa}AVISO${c.off} ${m}`); };
const titulo = (m) => console.log(`\n${m}`);

/** O que cada plano TEM que ter e o que NÃO pode ter. É a promessa da landing. */
const CONTRATO = {
  Starter:      { tem: ['financeiro', 'relatorios'],
                  naoTem: ['crm', 'whatsapp_qr', 'disparo_whatsapp', 'conversa_fria', 'whatsapp_oficial'] },
  Profissional: { tem: ['crm', 'whatsapp_qr', 'agente_reativo', 'followup_morno', 'disparo_email', 'grupos_whatsapp'],
                  naoTem: ['disparo_whatsapp', 'conversa_fria', 'whatsapp_oficial', 'agente_proativo', 'modelos_meta', 'grupos_campanhas'] },
  Enterprise:   { tem: ['crm', 'whatsapp_qr', 'whatsapp_oficial', 'disparo_whatsapp', 'conversa_fria', 'modelos_meta', 'agente_proativo', 'grupos_campanhas'],
                  naoTem: [] },
};

async function porPlano() {
  titulo('1 · Cada empresa ativa recebe o que o plano dela promete');
  const r = await query(`
    SELECT e.id, e.nome, p.nome AS plano, a.status,
           (e.capacidades_extras <> '[]'::jsonb) AS tem_cortesia
      FROM empresas e
      JOIN assinaturas a ON a.empresa_id = e.id
      LEFT JOIN planos p ON p.id = a.plano_id
     WHERE a.status IN ('ativa', 'trial')
     ORDER BY p.id NULLS FIRST, e.id`);

  for (const e of r.rows) {
    const caps = await capacidadesDaEmpresa(e.id);
    const contrato = CONTRATO[e.plano];
    if (!contrato) { wa(`empresa ${e.id} (${e.nome}) sem plano reconhecido: ${e.plano}`); continue; }

    const faltando = contrato.tem.filter((k) => !caps.has(k));
    // Cortesia é liberação deliberada (migration 081) — não é violação do contrato.
    const sobrando = e.tem_cortesia ? [] : contrato.naoTem.filter((k) => caps.has(k));

    const rotulo = `#${e.id} ${e.nome.slice(0, 26).padEnd(26)} ${e.plano}${e.tem_cortesia ? ' (cortesia)' : ''}`;
    if (faltando.length) no(`${rotulo} — falta: ${faltando.join(', ')}`);
    else if (sobrando.length) no(`${rotulo} — tem o que NÃO devia: ${sobrando.join(', ')}`);
    else ok(rotulo);
  }
}

async function travasDeBan() {
  titulo('2 · As travas anti-ban estão de pé para quem está no Baileys');

  // Nenhuma empresa fora do Enterprise pode ter a capacidade de falar primeiro.
  const r = await query(`
    SELECT e.id, e.nome, p.nome AS plano FROM empresas e
      JOIN assinaturas a ON a.empresa_id = e.id
      LEFT JOIN planos p ON p.id = a.plano_id
     WHERE a.status IN ('ativa','trial')`);
  let achou = 0;
  for (const e of r.rows) {
    const caps = await capacidadesDaEmpresa(e.id);
    const fria = caps.has('conversa_fria') || caps.has('disparo_whatsapp');
    if (fria && e.plano !== 'Enterprise') { no(`#${e.id} ${e.nome} (${e.plano}) pode iniciar conversa fria`); achou++; }
  }
  if (!achou) ok('nenhuma empresa fora do Enterprise pode iniciar conversa fria');

  // Cortesia pode liberar conversa fria em UMA situação: a empresa está de fato no
  // canal oficial da Meta, onde iniciar conversa é o comportamento previsto. É o
  // caso da conta institucional (empresa 1, número oficial, funil Suporte). Fora
  // disso, cortesia que libera conversa fria põe um número comum em risco de ban —
  // que é justamente o que a separação de planos existe para evitar.
  const cort = await query(`
    SELECT e.id, e.nome, e.capacidades_extras::text AS x,
           EXISTS (SELECT 1 FROM whatsapp_cloud_contas c
                    WHERE c.empresa_id = e.id AND c.ativo) AS no_oficial
      FROM empresas e
     WHERE e.capacidades_extras::text ~ 'conversa_fria|disparo_whatsapp|whatsapp_oficial'`);
  const arriscadas = cort.rows.filter((e) => !e.no_oficial);
  cort.rows.filter((e) => e.no_oficial)
    .forEach((e) => ok(`cortesia de conversa fria em #${e.id} ${e.nome} — está no canal oficial, é o esperado`));
  if (arriscadas.length) arriscadas.forEach((e) => no(`cortesia arriscada em #${e.id} ${e.nome} (fora do canal oficial): ${e.x}`));
  else ok('nenhuma cortesia liberou conversa fria a quem está no Baileys');

  // Follow-up queimado por falta de capacidade é esperado; o que não pode é ele
  // virar adiamento eterno (seria promessa de um envio que o plano não permite).
  const fu = await query(`
    SELECT count(*)::int AS n FROM followups_agendados
     WHERE status = 'pendente' AND erro_categoria = 'conflito_config'`);
  if (fu.rows[0].n > 0) no(`${fu.rows[0].n} follow-up pendente com conflito_config — deveria estar falhado`);
  else ok('nenhum follow-up preso em conflito_config');

  // Primeiro contato AUTOMÁTICO saindo por chip QR (28/09/2026). A regra é do canal
  // de quem envia, não só do plano: no Enterprise, quem está no QR não dispara nem
  // faz cadência fria. Antes dela, os chips QR da Panteras mandavam ~700 por mês.
  const qr = await query(`
    SELECT u.id, u.nome, u.empresa_id, count(*)::int AS n
      FROM historico_mensagens h
      JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.direcao = 'saida' AND h.origem IN ('disparo', 'followup')
       AND h.grupo_whatsapp_id IS NULL
       AND h.created_at > now() - interval '24 hours'
       AND coalesce(u.whatsapp_porta, 0) < 49000
       AND NOT EXISTS (SELECT 1 FROM historico_mensagens e
                        WHERE e.contato_whatsapp_id = h.contato_whatsapp_id AND e.direcao = 'entrada'
                          AND e.grupo_whatsapp_id IS NULL AND e.created_at < h.created_at)
     GROUP BY 1, 2, 3 ORDER BY n DESC`);
  if (qr.rows.length) qr.rows.forEach((r) => no(`#${r.empresa_id} ${r.nome}: ${r.n} primeiro(s) contato(s) automático(s) pelo QR nas últimas 24h`));
  else ok('nenhum primeiro contato automático saiu por chip QR nas últimas 24h');
}

/**
 * Empresa com gente dentro e sem plano cai no padrão conservador e perde o CRM.
 * Foi assim que a conta institucional (empresa 1, dona do funil Suporte) quase
 * ficou sem a fila de atendimento — o super_admin passa pelo guard e esconde o
 * problema, então a conta olha para quem NÃO é super_admin.
 */
async function contasSemPlano() {
  titulo('1b · Ninguém com gente dentro ficou sem plano e sem cortesia');
  const r = await query(`
    SELECT e.id, e.nome,
           count(u.id) FILTER (WHERE u.ativo AND u.nivel <> 'super_admin')::int AS gente,
           (e.capacidades_extras <> '[]'::jsonb) AS tem_cortesia
      FROM empresas e
      LEFT JOIN assinaturas a ON a.empresa_id = e.id
      LEFT JOIN usuarios u ON u.empresa_id = e.id
     WHERE a.id IS NULL OR a.plano_id IS NULL
     GROUP BY e.id, e.nome, e.capacidades_extras
     HAVING count(u.id) FILTER (WHERE u.ativo AND u.nivel <> 'super_admin') > 0`);
  if (!r.rows.length) { ok('nenhuma empresa sem plano tem usuário comum ativo'); return; }
  for (const e of r.rows) {
    const caps = await capacidadesDaEmpresa(e.id);
    const linha = `#${e.id} ${e.nome} · ${e.gente} usuário(s) sem super_admin`;
    if (caps.has('crm')) ok(`${linha} — mantém CRM por cortesia`);
    else wa(`${linha} — sem plano e sem cortesia: fica só com o financeiro`);
  }
}

async function canalDeCadaEmpresa() {
  titulo('3 · Quem está no canal oficial e quem está no Baileys');
  const r = await query(`
    SELECT c.empresa_id, e.nome, c.numero, c.porta_virtual, c.ativo,
           p.nome AS plano
      FROM whatsapp_cloud_contas c
      JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN assinaturas a ON a.empresa_id = e.id
      LEFT JOIN planos p ON p.id = a.plano_id
     ORDER BY c.id`);
  if (!r.rows.length) { wa('nenhuma empresa no canal oficial ainda'); return; }
  for (const x of r.rows) {
    const caps = await capacidadesDaEmpresa(x.empresa_id);
    const linha = `#${x.empresa_id} ${x.nome} · ${x.numero || '(sem número)'} · porta ${x.porta_virtual} · ${x.ativo ? 'ligado' : 'desligado'}`;
    if (!caps.has('whatsapp_oficial')) no(`${linha} — está no oficial SEM a capacidade (plano ${x.plano})`);
    else ok(linha);
  }

  const baileys = await query(`
    SELECT count(*)::int AS n FROM usuarios
     WHERE ativo AND whatsapp_porta IS NOT NULL AND whatsapp_porta < 49000`);
  ok(`${baileys.rows[0].n} usuários no Baileys (porta < 49000)`);
}

async function viaApi() {
  titulo('4 · A API recusa de verdade (não só a tela)');

  // Um usuário por plano, e de preferência de empresa SEM cortesia: com cortesia a
  // empresa tem mais do que o plano de propósito (migration 081) e o recorte não
  // provaria nada sobre o plano. `tem_cortesia` ordena para o fim e a conta abaixo
  // ainda respeita a exceção, caso não exista outra empresa naquele plano.
  const alvos = await query(`
    SELECT DISTINCT ON (p.nome) p.nome AS plano, u.id, u.email, u.empresa_id,
           u.tipo_usuario, u.nivel, e.nome AS empresa,
           (e.capacidades_extras <> '[]'::jsonb) AS tem_cortesia
      FROM usuarios u
      JOIN empresas e ON e.id = u.empresa_id
      JOIN assinaturas a ON a.empresa_id = e.id
      JOIN planos p ON p.id = a.plano_id
     WHERE u.ativo AND a.status IN ('ativa','trial') AND u.nivel <> 'super_admin'
     ORDER BY p.nome, (e.capacidades_extras <> '[]'::jsonb), u.id`);

  for (const u of alvos.rows) {
    const token = signAccessToken({
      id: u.id, userId: u.id, email: u.email, empresa_id: u.empresa_id,
      tipo_usuario: u.tipo_usuario, nivel: u.nivel,
    });
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const caps0 = await capacidadesDaEmpresa(u.empresa_id);
    const esperado = caps0.has('disparo_whatsapp') ? 'liberar' : 'recusar';

    // Escrita de disparo — recusada em tudo que não é Enterprise.
    const r1 = await fetch(`${BASE}/crm/disparos/preview`, { method: 'POST', headers: h, body: '{}' });
    const b1 = await r1.json().catch(() => ({}));
    const recusou = r1.status === 403 && b1.code === 'PLANO_SEM_CAPACIDADE';
    const rotulo = `${u.plano.padEnd(13)} #${u.empresa_id} ${u.empresa.slice(0, 22)}${u.tem_cortesia ? ' (cortesia)' : ''}`;
    if (esperado === 'recusar' && recusou) ok(`${rotulo} · disparo recusado (403 ${b1.capacidade})`);
    else if (esperado === 'liberar' && !recusou) ok(`${rotulo} · disparo liberado (HTTP ${r1.status})`);
    else no(`${rotulo} · disparo deveria ${esperado} — veio HTTP ${r1.status} ${b1.code || ''}`);

    // Leitura do histórico nunca é bloqueada, em plano nenhum.
    const r2 = await fetch(`${BASE}/crm/disparos`, { headers: h });
    if (r2.ok) ok(`${rotulo} · histórico de disparos legível (${r2.status})`);
    else no(`${rotulo} · histórico deveria abrir — veio ${r2.status}`);

    // As capacidades chegam à tela junto da assinatura.
    const r3 = await fetch(`${BASE}/assinaturas/minha`, { headers: h });
    const b3 = await r3.json().catch(() => ({}));
    const caps = Array.isArray(b3.capacidades) ? b3.capacidades : null;
    if (!caps) no(`${rotulo} · /assinaturas/minha não devolveu capacidades`);
    else {
      // Com cortesia, o contrato do plano não vale como teto — a empresa recebeu
      // aquilo por decisão. O que nunca pode escapar é o que põe número comum em
      // risco, e isso a seção 2 já confere contra o canal real.
      const contrato = CONTRATO[u.plano];
      const ruim = u.tem_cortesia ? [] : contrato.naoTem.filter((k) => caps.includes(k));
      if (ruim.length) no(`${rotulo} · a tela receberia ${ruim.join(', ')}`);
      else ok(`${rotulo} · tela recebe ${caps.length} capacidades, nenhuma indevida`);
    }
  }
}

(async () => {
  console.log(`\nCapacidades por plano — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)`);
  console.log(`${c.dim}catálogo: ${Object.keys(CATALOGO).length} capacidades${c.off}`);

  await porPlano();
  await contasSemPlano();
  await travasDeBan();
  await canalDeCadaEmpresa();
  if (process.argv.includes('--api')) await viaApi();
  else console.log(`\n${c.dim}(--api para conferir as recusas contra a API no ar)${c.off}`);

  console.log(`\n${falhas ? c.no : c.ok}${falhas} falha(s)${c.off}, ${avisos} aviso(s).\n`);
  await pool.end();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
