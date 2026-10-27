/**
 * Suspende agora todo trial vencido — o mesmo que o job faz de hora em hora.
 *   node api/scripts/suspender_trials_vencidos.js            (simula: lista quem seria suspenso)
 *   node api/scripts/suspender_trials_vencidos.js --aplicar
 */
process.chdir(require('path').join(__dirname, '..'));
const { suspenderTrialsVencidos, SQL_TRIAL_ENCERRADO } = require('../dist/modules/assinaturas/assinaturas.service');
const { query, pool } = require('../dist/config/database');

(async () => {
  if (!process.argv.includes('--aplicar')) {
    const r = await query(
      `SELECT a.empresa_id, e.nome, a.trial_expira_em FROM assinaturas a JOIN empresas e ON e.id = a.empresa_id
        WHERE a.empresa_id IN (SELECT empresa_id FROM assinaturas WHERE ${SQL_TRIAL_ENCERRADO}) ORDER BY a.empresa_id`
    );
    console.table(r.rows);
    console.log(`${r.rows.length} trial(s) vencido(s). Rode com --aplicar para suspender.`);
  } else {
    const r = await suspenderTrialsVencidos();
    console.table(r);
    console.log(`${r.length} empresa(s) suspensa(s).`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
