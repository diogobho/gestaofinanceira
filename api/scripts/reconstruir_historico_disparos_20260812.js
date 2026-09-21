/**
 * Reconstrói o histórico de mensagens perdido pelos disparos em massa.
 *
 * Contexto: até a correção de 12/08/2026, disparos.service.ts só gravava em
 * historico_mensagens quando o lead JÁ tinha contato_whatsapp_id. Lead importado
 * (que nunca conversou) recebia a mensagem e nada era registrado.
 *
 * Fonte da verdade da reconstrução:
 *   - texto      → disparos_crm.template + aplicarVariaveisLead (mesmo helper do envio)
 *   - data/hora  → disparo_leads.enviado_at
 *   - remetente  → disparos_crm.usuario_id
 * Os campos do lead passados ao substituidor são EXATAMENTE os que _carregarLeads
 * selecionava no envio original (sem email/cargo/titulo/etc.), para o texto sair igual.
 *
 * Uso: node reconstruir-historico.js [--dry-run] [--leads 330,331]
 */
const path = require('path');
const API = '/var/www/apps/gestao_financeira/api';
require('dotenv').config({ path: path.join(API, '.env') });

const { query } = require(path.join(API, 'dist/config/database'));
const { aplicarVariaveisLead } = require(path.join(API, 'dist/modules/crm/_shared/agendamento'));
const { contatosService } = require(path.join(API, 'dist/modules/crm/contatos/contatos.service'));

const DRY = process.argv.includes('--dry-run');
const idxLeads = process.argv.indexOf('--leads');
const soLeads = idxLeads > -1 ? process.argv[idxLeads + 1].split(',').map(Number) : null;

async function main() {
  const antes = (await query(`SELECT COALESCE(MAX(id), 0) AS m FROM historico_mensagens`)).rows[0].m;
  console.log(`[Reconstrução] MAX(historico_mensagens.id) antes = ${antes}`);

  const pendentes = await query(
    `SELECT dl.lead_id, dl.enviado_at,
            d.id AS disparo_id, d.usuario_id, d.empresa_id, d.template,
            l.nome, l.telefone, l.empresa, l.origem, l.contato_whatsapp_id,
            l.estagio_id, u.nome AS responsavel_nome
       FROM disparo_leads dl
       JOIN disparos_crm d ON d.id = dl.disparo_id
       JOIN leads l        ON l.id = dl.lead_id
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
      WHERE dl.status = 'enviado'
        AND l.arquivado = false
        ${soLeads ? 'AND dl.lead_id = ANY($1::int[])' : ''}
        AND NOT EXISTS (
          SELECT 1 FROM historico_mensagens h
           WHERE h.lead_id = dl.lead_id AND h.direcao = 'saida'
             AND h.enviado_at BETWEEN dl.enviado_at - INTERVAL '2 min'
                                  AND dl.enviado_at + INTERVAL '2 min')
      ORDER BY dl.enviado_at`,
    soLeads ? [soLeads] : []
  );
  console.log(`[Reconstrução] ${pendentes.rows.length} envios sem histórico`);

  // Resolve/cria o contato uma vez por (lead, usuário remetente).
  const cacheContato = new Map();
  let inseridos = 0, semContato = 0, vinculados = 0;

  for (const r of pendentes.rows) {
    const chave = `${r.lead_id}:${r.usuario_id}`;
    let contatoId = cacheContato.get(chave);

    if (contatoId === undefined) {
      contatoId = r.contato_whatsapp_id || null;
      if (!contatoId && !DRY) {
        const jaTinha = (await query(`SELECT contato_whatsapp_id FROM leads WHERE id = $1`, [r.lead_id]))
          .rows[0]?.contato_whatsapp_id;
        contatoId = jaTinha
          || (await contatosService.resolverContatoParaLead(r.lead_id, r.usuario_id, r.empresa_id));
        if (contatoId && !jaTinha) vinculados++;
      }
      cacheContato.set(chave, contatoId);
    }
    if (!contatoId) { semContato++; if (DRY) continue; }

    const texto = aplicarVariaveisLead(r.template, {
      nome: r.nome, telefone: r.telefone, empresa: r.empresa,
      origem: r.origem, responsavel_nome: r.responsavel_nome,
    });

    if (DRY) {
      if (inseridos < 3) console.log(`  [amostra] lead #${r.lead_id} ${r.enviado_at.toISOString()} → ${JSON.stringify(texto.slice(0, 70))}`);
      inseridos++;
      continue;
    }

    // enviado_at E created_at recebem a data real do disparo: consultas que
    // ordenam/filtram por created_at (ex.: guard anti-spam) veem a linha na época certa.
    await query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          direcao, tipo, conteudo, enviado_at, created_at)
       VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, $6, $6)`,
      [r.lead_id, contatoId, r.usuario_id, r.empresa_id, texto, r.enviado_at]
    );
    inseridos++;
    if (inseridos % 2000 === 0) console.log(`  ...${inseridos}`);
  }

  const depois = (await query(`SELECT COALESCE(MAX(id), 0) AS m FROM historico_mensagens`)).rows[0].m;
  console.log(`\n[Reconstrução] ${DRY ? 'DRY-RUN — nada gravado' : 'concluída'}`);
  console.log(`  mensagens inseridas : ${inseridos}`);
  console.log(`  leads vinculados    : ${vinculados}`);
  console.log(`  sem contato resolvível: ${semContato}`);
  if (!DRY) {
    console.log(`\n  REVERTER: DELETE FROM historico_mensagens WHERE id > ${antes} AND id <= ${depois};`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
