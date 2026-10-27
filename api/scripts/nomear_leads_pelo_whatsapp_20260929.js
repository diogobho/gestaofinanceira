/**
 * Dá nome aos cards que estão só com o telefone ("5511999999999"), usando o nome que a
 * pessoa usa no WhatsApp (push name do contato vinculado) — a mesma regra que o webhook
 * aplica desde 29/09/2026 quando ela escreve (chamado #218). Card com qualquer letra no
 * nome não é tocado.
 *   node api/scripts/nomear_leads_pelo_whatsapp_20260929.js            (simula)
 *   node api/scripts/nomear_leads_pelo_whatsapp_20260929.js --aplicar
 */
process.chdir(require('path').join(__dirname, '..'));
const { query, pool } = require('../dist/config/database');
const { nomeDoPush } = require('../dist/modules/crm/_shared/nome');

(async () => {
  const r = await query(
    `SELECT l.id, l.empresa_id, l.nome, c.nome_push
       FROM leads l JOIN contatos_whatsapp c ON c.id = l.contato_whatsapp_id
      WHERE l.nome !~ '[[:alpha:]]' AND c.nome_push ~ '[[:alpha:]]' AND NOT l.arquivado
      ORDER BY l.empresa_id, l.id`
  );
  const alvos = r.rows.map((l) => ({ ...l, novo: nomeDoPush(l.nome_push) })).filter((l) => l.novo);
  const porEmpresa = {};
  for (const l of alvos) porEmpresa[l.empresa_id] = (porEmpresa[l.empresa_id] || 0) + 1;
  console.table(alvos.slice(0, 15).map(({ id, empresa_id, nome, novo }) => ({ id, empresa_id, nome, novo })));
  console.log('por empresa:', porEmpresa);

  if (!process.argv.includes('--aplicar')) {
    console.log(`${alvos.length} card(s) seriam renomeados. Rode com --aplicar.`);
  } else {
    let feitos = 0;
    for (const l of alvos) {
      const u = await query(
        `UPDATE leads SET nome = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND nome !~ '[[:alpha:]]'`,
        [l.novo, l.id]
      );
      feitos += u.rowCount;
    }
    console.log(`${feitos} card(s) renomeados.`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
