#!/usr/bin/env node
/**
 * Confere o canal de WhatsApp de cada conta — quem está no oficial da Meta, quem
 * está no Baileys, e se o caminho que leva de um ao outro existe de verdade.
 *
 * É o complemento de `verificar_capacidades.js`: aquele prova o que o PLANO
 * permite; este prova o CANAL que a conta tem na mão. São perguntas diferentes, e
 * confundi-las é o erro clássico — um Enterprise recém-assinado tem direito ao
 * número oficial e ainda não tem número nenhum ligado.
 *
 *   node scripts/verificar_canal_oficial.js          # banco + .env, sem rede
 *   node scripts/verificar_canal_oficial.js --meta   # + consulta a Graph API
 *
 * Sai com 1 se algo reprovar. NADA aqui envia mensagem.
 */
require('dotenv').config();

const { query, pool } = require('../dist/config/database');
const { capacidadesDaEmpresa } = require('../dist/shared/capacidades');
const { configES } = require('../dist/modules/whatsapp/meta/embedded-signup.service');

const c = { ok: '\x1b[32m', no: '\x1b[31m', wa: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
let falhas = 0, avisos = 0;
const ok = (m) => console.log(`  ${c.ok}OK   ${c.off} ${m}`);
const no = (m) => { falhas++; console.log(`  ${c.no}FALHA${c.off} ${m}`); };
const wa = (m) => { avisos++; console.log(`  ${c.wa}AVISO${c.off} ${m}`); };
const nota = (m) => console.log(`  ${c.dim}·     ${m}${c.off}`);
const titulo = (m) => console.log(`\n${m}`);

const PORTA_VIRTUAL_MINIMA = 49000;

/**
 * 1 · A migration 084 está aplicada? Sem ela o resto nem roda — e o erro seria um
 * `42703` cru no meio da conferência, que esconde a causa em vez de anunciá-la.
 */
async function esquema() {
  titulo('1 · Esquema (migration 084)');
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_cloud_contas'`
  );
  const nomes = new Set(cols.rows.map((r) => r.column_name));
  for (const col of ['usuario_id', 'business_id', 'pin_enc', 'origem', 'pagamento_ok', 'conectado_em']) {
    nomes.has(col) ? ok(`coluna ${col}`) : no(`coluna ${col} ausente — a migration 084 não foi aplicada`);
  }

  const idx = await query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'whatsapp_cloud_contas'`
  );
  const indices = new Set(idx.rows.map((r) => r.indexname));
  for (const i of ['idx_wa_cloud_conta_por_usuario', 'idx_wa_cloud_conta_da_empresa']) {
    indices.has(i) ? ok(`índice ${i}`) : no(`índice ${i} ausente`);
  }

  const trava = await query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_cloud_contas_empresa_id_key'`
  );
  trava.rowCount
    ? no('a trava de "um número por empresa" ainda existe — a 084 não foi aplicada por inteiro')
    : ok('a empresa pode ter mais de um número oficial');

  return nomes.has('usuario_id');
}

/** 2 · O Embedded Signup pode sequer abrir? */
function embeddedSignup() {
  titulo('2 · Embedded Signup (janela de conexão do cliente)');
  const cfg = configES();
  if (cfg.configurado) {
    ok(`configurado — app ${cfg.appId}, configuração ${cfg.configId}, Graph ${cfg.graphVersion}`);
  } else {
    wa(`a janela NÃO abre: falta ${cfg.faltando.join(', ')} no api/.env`);
    nota('enquanto faltar, o cliente Enterprise vê o caminho por chamado, não o botão');
  }
  if (!process.env.META_APP_SECRET) {
    no('META_APP_SECRET ausente — o webhook da Meta aceita POST SEM assinatura');
    nota('o webhook grava conversa no CRM: um POST forjado vira mensagem no card de um cliente');
  } else {
    ok('META_APP_SECRET presente — a assinatura do webhook é conferida');
  }
}

/** 3 · Quem está em qual canal, empresa por empresa. */
async function canais() {
  titulo('3 · Canal de cada conta');
  // Empresa com número oficial entra SEMPRE, qualquer que seja a assinatura: a
  // conta institucional (empresa 1) é dona do número da DuoFuturo e tem assinatura
  // `cancelada` de propósito — filtrar por status deixava justamente ela de fora.
  const empresas = await query(`
    SELECT e.id, e.nome, COALESCE(p.nome, '(sem plano)') AS plano, a.status
      FROM empresas e
      LEFT JOIN assinaturas a ON a.empresa_id = e.id
      LEFT JOIN planos p ON p.id = a.plano_id
     WHERE a.status IN ('ativa', 'trial', 'aguardando_pagamento')
        OR EXISTS (SELECT 1 FROM whatsapp_cloud_contas c WHERE c.empresa_id = e.id)
     ORDER BY e.id`);

  for (const e of empresas.rows) {
    const caps = await capacidadesDaEmpresa(e.id);
    if (!caps.has('whatsapp_qr') && !caps.has('whatsapp_oficial')) continue; // Starter: sem WhatsApp

    const usuarios = await query(
      `SELECT id, nome, whatsapp_porta,
              to_char(ultimo_acesso_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS ultimo_acesso
         FROM usuarios WHERE empresa_id = $1 AND ativo = true ORDER BY id`,
      [e.id]
    );
    const contas = await query(
      `SELECT id, usuario_id, numero, ativo, origem FROM whatsapp_cloud_contas WHERE empresa_id = $1`,
      [e.id]
    );
    const noOficial = usuarios.rows.filter((u) => Number(u.whatsapp_porta) >= PORTA_VIRTUAL_MINIMA);
    const noQr = usuarios.rows.filter((u) => u.whatsapp_porta && Number(u.whatsapp_porta) < PORTA_VIRTUAL_MINIMA);
    const semCanal = usuarios.rows.filter((u) => !u.whatsapp_porta);

    const resumo = `empresa ${e.id} (${e.nome}) · ${e.plano} · oficial ${noOficial.length} · QR ${noQr.length} · sem canal ${semCanal.length}`;

    if (caps.has('whatsapp_oficial')) {
      if (contas.rowCount === 0) {
        wa(`${resumo} — tem direito ao oficial e não conectou nenhum número`);
        nota('correto para quem acabou de assinar; vira problema se ficar assim');
      } else {
        ok(resumo);
      }
      // Sem canal numa conta com direito ao oficial é ESCOLHA pendente, não falha.
      for (const u of semCanal) nota(`usuário ${u.id} (${u.nome}) ainda não escolheu o canal`);
    } else {
      if (contas.rowCount > 0) {
        no(`${resumo} — tem número oficial cadastrado SEM ter a capacidade whatsapp_oficial`);
      } else if (semCanal.length) {
        // A provisão é preguiçosa: a porta nasce na primeira visita à tela de
        // WhatsApp (autocura do getConfig). Sem canal aqui quase sempre quer dizer
        // "nunca abriu a tela" — é aviso, não falha.
        wa(`${resumo} — usuário sem canal; a porta nasce na primeira visita à tela de WhatsApp`);
        for (const u of semCanal) {
          nota(`usuário ${u.id} (${u.nome}) sem porta · último acesso ${u.ultimo_acesso || 'nunca'}`);
        }
      } else {
        ok(resumo);
      }
    }

    for (const conta of contas.rows) {
      const dono = conta.usuario_id ? `usuário #${conta.usuario_id}` : 'empresa inteira';
      const estado = conta.ativo ? 'ligado' : 'desligado';
      nota(`número ${conta.numero || '(sem número)'} · ${dono} · ${estado} · origem ${conta.origem}`);
      if (conta.usuario_id) {
        const u = usuarios.rows.find((x) => x.id === conta.usuario_id);
        if (conta.ativo && u && Number(u.whatsapp_porta) < PORTA_VIRTUAL_MINIMA) {
          no(`  o número está ligado mas o dono continua na porta Baileys ${u.whatsapp_porta}`);
        }
      }
    }
  }
}

/** 4 · Porta virtual e porta de instância não podem se misturar. */
async function portas() {
  titulo('4 · Portas');
  const virtuais = await query(
    `SELECT u.id, u.nome, u.whatsapp_porta FROM usuarios u
      WHERE u.ativo = true AND u.whatsapp_porta >= $1
        AND NOT EXISTS (SELECT 1 FROM whatsapp_cloud_contas c WHERE c.porta_virtual = u.whatsapp_porta)`,
    [PORTA_VIRTUAL_MINIMA]
  );
  virtuais.rowCount
    ? no(`${virtuais.rowCount} usuário(s) em porta virtual que não existe em whatsapp_cloud_contas`)
    : ok('toda porta virtual em uso tem conta correspondente');
  for (const u of virtuais.rows) nota(`usuário ${u.id} (${u.nome}) na porta ${u.whatsapp_porta}`);

  const desligadas = await query(
    `SELECT c.id, c.numero, c.porta_virtual, count(u.id) AS usuarios
       FROM whatsapp_cloud_contas c
       LEFT JOIN usuarios u ON u.whatsapp_porta = c.porta_virtual AND u.ativo = true
      WHERE c.ativo = false
      GROUP BY c.id HAVING count(u.id) > 0`
  );
  desligadas.rowCount
    ? no(`${desligadas.rowCount} conta(s) desligada(s) com usuário ainda na porta virtual — eles não enviam nada`)
    : ok('nenhum usuário preso numa conta desligada');
}

/** 5 · A Meta confirma o que o banco diz? (só com --meta) */
async function contraAMeta() {
  titulo('5 · Contra a Graph API');
  const { consultarNumero } = require('../dist/modules/whatsapp/meta/meta-whatsapp.service');
  const { appInscritoNaWaba } = require('../dist/modules/whatsapp/meta/embedded-signup.service');
  const { credenciaisDa } = require('../dist/modules/whatsapp/canal/contas');

  const contas = await query(`SELECT * FROM whatsapp_cloud_contas ORDER BY id`);
  for (const conta of contas.rows) {
    const cred = credenciaisDa(conta);
    try {
      const n = await consultarNumero(cred);
      ok(`conta ${conta.id} · ${n.display_phone_number} · ${n.verified_name} · qualidade ${n.quality_rating || '—'}`);
      if (n.code_verification_status && n.code_verification_status !== 'VERIFIED') {
        wa(`  verificação do número: ${n.code_verification_status}`);
      }
    } catch (err) {
      no(`conta ${conta.id} (${conta.numero}): ${err.message}`);
      continue;
    }
    // O passo que não avisa quando falta: sem o app inscrito, nada chega.
    const inscrito = await appInscritoNaWaba(conta.waba_id, cred.token || process.env.META_WA_TOKEN);
    inscrito
      ? ok(`  app inscrito na WABA ${conta.waba_id}`)
      : no(`  app NÃO inscrito na WABA ${conta.waba_id} — mensagem recebida não chega ao CRM`);
  }
}

(async () => {
  console.log('Canal de WhatsApp por conta — QR Code (Baileys) × Oficial (Cloud API da Meta)');
  try {
    const aplicada = await esquema();
    embeddedSignup();
    if (aplicada) {
      await canais();
      await portas();
      if (process.argv.includes('--meta')) await contraAMeta();
      else console.log(`\n${c.dim}(--meta para conferir cada número na Graph API)${c.off}`);
    } else {
      console.log(`\n${c.dim}O resto da conferência depende do esquema. Aplique a 084 e rode de novo.${c.off}`);
    }
  } catch (err) {
    no(`erro inesperado: ${err.message}`);
    console.error(err);
  } finally {
    await pool.end().catch(() => {});
  }
  console.log(`\n${falhas ? c.no : c.ok}${falhas} falha(s)${c.off}, ${avisos} aviso(s).`);
  process.exit(falhas ? 1 : 0);
})();
