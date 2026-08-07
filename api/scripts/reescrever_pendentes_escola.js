/**
 * Aplica o texto NOVO das cadências aos follow-ups já agendados do funil 24,
 * preservando o cronograma (agendado_para não é tocado).
 *
 * Motivo: followups_agendados copia mensagem/instrucao_ia no momento da criação —
 * o scheduler não relê o followup_config no envio. Sem isto, os leads em curso
 * receberiam o texto antigo.
 *
 * Casa por passo_ordem. Um cuidado: `mover_apos_envio` vale para o ÚLTIMO passo da
 * cadência, mas a Objeção passou de 5 para 6 passos e os leads em curso não têm o
 * passo novo. Se copiássemos a flag da config, o último passo QUE O LEAD TEM ficaria
 * com false e ele nunca sairia do estágio. Por isso a flag é recalculada por lead:
 * true no maior passo_ordem pendente dele.
 *
 * Rodar:  node scripts/reescrever_pendentes_escola.js [--aplicar]
 */
const { Client } = require('pg');

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (ex.: export $(grep ^DATABASE_URL ../.env))');
  await c.connect();

  // Config vigente (já gravada) de cada estágio do funil 24.
  const { rows: estagios } = await c.query(
    `SELECT id, nome, followup_config->'passos' AS passos
       FROM estagios_funil WHERE funil_id = 24 AND followup_config IS NOT NULL`);
  const porEstagio = new Map(estagios.map(e => [e.id, e]));

  // Pendentes, com o maior passo do próprio lead (para a flag de movimentação).
  const { rows: pendentes } = await c.query(
    `SELECT f.id, f.lead_id, f.passo_ordem, f.tipo, l.estagio_id,
            MAX(f.passo_ordem) OVER (PARTITION BY f.lead_id, l.estagio_id) AS ultimo_passo_do_lead
       FROM followups_agendados f
       JOIN leads l ON l.id = f.lead_id
      WHERE f.status = 'pendente' AND l.funil_id = 24 AND f.origem = 'estagio'
        AND f.passo_ordem IS NOT NULL`);

  let atualizados = 0, semCorrespondencia = 0, trocaramTipo = 0;
  const resumo = {};

  for (const p of pendentes) {
    const est = porEstagio.get(p.estagio_id);
    const novo = est?.passos?.[p.passo_ordem];
    if (!novo) {
      semCorrespondencia++;
      continue;
    }

    const ehManual = novo.tipo === 'manual';
    const moverAposEnvio = p.passo_ordem === p.ultimo_passo_do_lead;
    if (novo.tipo !== p.tipo) trocaramTipo++;

    const chave = `${est.nome} · passo ${p.passo_ordem} → ${novo.tipo}`;
    resumo[chave] = (resumo[chave] || 0) + 1;

    if (aplicar) {
      await c.query(
        `UPDATE followups_agendados
            SET tipo = $1,
                mensagem = $2,
                instrucao_ia = $3,
                media_url = NULL, media_mimetype = NULL, media_filename = NULL,
                mover_apos_envio = $4,
                updated_at = NOW()
          WHERE id = $5 AND status = 'pendente'`,
        [novo.tipo,
         ehManual ? (novo.mensagem || null) : null,
         ehManual ? null : (novo.instrucao_ia || null),
         moverAposEnvio,
         p.id]
      );
    }
    atualizados++;
  }

  console.log(`pendentes analisados: ${pendentes.length}\n`);
  for (const [k, v] of Object.entries(resumo).sort()) console.log(`  ${String(v).padStart(3)} × ${k}`);
  console.log(`\natualizados: ${atualizados} · trocaram de tipo: ${trocaramTipo} · sem passo correspondente: ${semCorrespondencia}`);
  console.log(aplicar ? '\n✓ Aplicado (datas preservadas).' : '\nPREVIEW — nada gravado. Use --aplicar.');
  await c.end();
})();
