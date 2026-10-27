/**
 * Recompõe a assinatura achatada em disparos de e-mail agendados.
 *
 * Contexto (ticket #57, 07/09/2026): `EditarAgendamentoModal` mandava o template
 * INTEIRO — corpo + <hr> + assinatura — para o `EmailEditor` (TipTap sem extensão
 * de tabela). O ProseMirror descarta `<table>/<tr>/<td>` e promove cada filho a
 * bloco: os 6 ícones sociais viraram 6 linhas empilhadas e os `<a href>` em volta
 * deles sumiram. `onUpdate` devolvia o HTML já achatado e o save gravava o estrago.
 *
 * A impressão digital do achatamento é a classe que o próprio editor carimba nas
 * imagens que serializa (`max-w-full rounded`, de `Image.configure` em
 * EmailEditor.tsx): num disparo íntegro ela aparece só no CORPO; num achatado ela
 * está nos ícones da ASSINATURA. É esse o teste usado aqui — não o simples
 * "não tem <table>", que também seria verdade para quem nunca teve assinatura.
 *
 * O corte é o único `<hr>` do template (o separador que `buildEmailHtml` insere
 * entre corpo e assinatura). Mais de um `<hr>` = ponto de corte ambíguo: pula.
 *
 * Idempotente: um disparo já recomposto não tem mais a marca e é ignorado.
 * Simula por padrão; grava só com --aplicar. Backup do original vai para
 * backups/ antes de qualquer escrita.
 *
 *   node api/scripts/reparar_assinatura_disparos_20260909.js            # simula
 *   node api/scripts/reparar_assinatura_disparos_20260909.js --aplicar
 *   node ... --disparo=446,447,448   # restringe (padrão: todo agendado achatado)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APLICAR = process.argv.includes('--aplicar');
const argIds = process.argv.find(a => a.startsWith('--disparo='));
const IDS = argIds ? argIds.split('=')[1].split(',').map(n => parseInt(n, 10)) : null;

// Mesmo separador que o compositor insere entre corpo e assinatura
// (DisparoEmailModal.buildEmailHtml). Ao recompor, ele volta na forma canônica —
// o TipTap havia normalizado para `<hr>` cru.
const SEPARADOR = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />';
const MARCA_EDITOR = 'max-w-full rounded';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Corta o template no único <hr>. Devolve null quando o corte é ambíguo. */
function separar(template) {
  const achados = [...template.matchAll(/<hr[^>]*>/gi)];
  if (achados.length !== 1) return null;
  const m = achados[0];
  return { corpo: template.slice(0, m.index), assinatura: template.slice(m.index + m[0].length) };
}

async function main() {
  const filtro = IDS ? 'AND d.id = ANY($1::int[])' : '';
  const { rows } = await pool.query(
    `SELECT d.id, d.empresa_id, d.usuario_id, d.assunto, d.agendado_para, d.template
       FROM disparos_crm d
      WHERE d.tipo = 'email' AND d.status = 'agendado' ${filtro}
      ORDER BY d.agendado_para`,
    IDS ? [IDS] : []
  );

  // A assinatura de referência é a do disparo íntegro mais recente do MESMO
  // usuário: é a versão que ele de fato usa hoje (a da Panteras, por exemplo, é a
  // do perfil menos a célula do logo, retirada de propósito). Puxar de
  // `usuarios.assinatura_email` devolveria o logo que ele já tinha tirado.
  const referencia = new Map();
  async function assinaturaDeReferencia(usuarioId, empresaId) {
    const chave = `${empresaId}:${usuarioId}`;
    if (referencia.has(chave)) return referencia.get(chave);
    const r = await pool.query(
      `SELECT template FROM disparos_crm
        WHERE tipo='email' AND empresa_id=$1 AND usuario_id=$2 AND template LIKE '%<table%'
        ORDER BY id DESC LIMIT 1`,
      [empresaId, usuarioId]
    );
    let sig = null;
    if (r.rows[0]) {
      const i = r.rows[0].template.indexOf(SEPARADOR);
      if (i !== -1) sig = r.rows[0].template.slice(i + SEPARADOR.length);
    }
    referencia.set(chave, sig);
    return sig;
  }

  const backup = [];
  let recompostos = 0, pulados = 0;

  for (const d of rows) {
    const marcado = d.template.includes(MARCA_EDITOR);
    const partes = separar(d.template);
    const assinaturaAchatada = partes && partes.assinatura.includes(MARCA_EDITOR);

    if (!marcado || !partes || !assinaturaAchatada) {
      const motivo = !partes ? 'ponto de corte ambíguo (0 ou >1 <hr>)'
                   : !assinaturaAchatada ? 'assinatura íntegra'
                   : 'sem marca do editor';
      console.log(`#${d.id}  PULADO — ${motivo}`);
      pulados++;
      continue;
    }

    const nova = await assinaturaDeReferencia(d.usuario_id, d.empresa_id);
    if (!nova) {
      console.log(`#${d.id}  PULADO — nenhum disparo íntegro do mesmo usuário para servir de referência`);
      pulados++;
      continue;
    }

    const novoTemplate = partes.corpo + SEPARADOR + nova;
    const quando = new Date(d.agendado_para).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(
      `#${d.id}  ${APLICAR ? 'RECOMPOSTO' : 'recomporia'} — envio ${quando} — ` +
      `${d.template.length} → ${novoTemplate.length} chars — "${(d.assunto || '').slice(0, 40)}"`
    );

    backup.push({ id: d.id, empresa_id: d.empresa_id, agendado_para: d.agendado_para, template: d.template });

    if (APLICAR) {
      await pool.query('UPDATE disparos_crm SET template = $2 WHERE id = $1', [d.id, novoTemplate]);
    }
    recompostos++;
  }

  if (APLICAR && backup.length) {
    const dir = path.join(__dirname, '..', '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `disparos_template_pre_reparo_${Date.now()}.json`);
    fs.writeFileSync(arq, JSON.stringify(backup, null, 2));
    console.log(`\nBackup dos originais: ${arq}`);
  }

  console.log(`\n${APLICAR ? 'Aplicado' : 'Simulação'}: ${recompostos} recomposto(s), ${pulados} pulado(s).`);
  if (!APLICAR && recompostos) console.log('Rode de novo com --aplicar para gravar.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
