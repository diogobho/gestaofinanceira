/**
 * Marca como `copia_indevida` a mensagem gravada numa empresa cujo chip não a
 * carregou (migration 075). Não apaga nada.
 *
 *   node api/scripts/marcar_copias_indevidas_20260915.js             # simulação
 *   node api/scripts/marcar_copias_indevidas_20260915.js --aplicar
 *   node api/scripts/marcar_copias_indevidas_20260915.js --desfazer  # volta tudo a visível
 *
 * Por que: até 19/08/2026 o webhook gravava a mesma mensagem em toda empresa que
 * tivesse o número salvo. O card da Alcione na suporte@ (empresa 32) mostrava a
 * conversa da equipe da Panteras de 19/08; conversa pessoal do Diogo aparecia nos
 * contatos da Panteras e da master@.
 *
 * A lista (`dados/copias_indevidas_20260915.txt`) foi montada em 14/09/2026 a partir
 * dos logs das instâncias (`whatsapp-integration/logs/porta-30xx-out.log`), que
 * registram cada mensagem 1:1 recebida ("Mensagem recebida de") e enviada ("Mensagem
 * enviada pelo app capturada") com o segundo exato. Para cada mensagem 1:1 gravada
 * em mais de uma empresa com a suporte@ entre elas:
 *   - a 3019 (suporte@) registrou a mensagem → as linhas das OUTRAS empresas são cópia;
 *   - outro chip registrou, ou a 3019 estava no ar e calada → a linha da suporte@ é cópia;
 *   - as duas pontas são chips nossos (Diogo ↔ Débora) → as duas linhas são legítimas,
 *     salvo a da suporte@ quando a 3019 não participou;
 *   - sem prova (33 mensagens) → ficam como estão.
 * Resultado: 1.065 linhas na empresa 32, 487 na 5 e 502 na 1.
 *
 * Fora desta lista, e sem correção por falta de evidência: ~8 mil mensagens de
 * fev–ago/2026 duplicadas entre a Panteras (5) e a master@ (1). São da época em que
 * a 3010 e a 3011 dividiam contatos pessoais, e não há log das duas nesse período.
 *
 * Segunda lista (`dados/copias_indevidas_3012_20260915.txt`, 85 linhas: 4 na 32, 81 na 1):
 * a primeira leu só `porta-30xx-out.log` e deixou de fora a 3012 (Panteras), cujo PM2
 * grava em `gestao-douglas-out.log` — o "Olá Eli" de 19/08 no card da Elisangela era
 * dela. Refeita com todos os logs, casando também pela 1ª linha do texto (o log quebra
 * texto longo) e pelo nome do remetente (mídia de @lid). Nunca marca linha cujo contato
 * é número de chip nosso: a 3010 não registra mensagem, e a conversa dela com outro
 * chip pareceria cópia. Nenhuma linha da primeira lista foi contestada.
 *
 * Depois de marcar, a "última mensagem" dos contatos afetados é recalculada só com
 * o que é deles. É idempotente: rodar de novo não muda nada.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APLICAR = process.argv.includes('--aplicar');
const DESFAZER = process.argv.includes('--desfazer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ids = ['copias_indevidas_20260915.txt', 'copias_indevidas_3012_20260915.txt']
  .flatMap((arq) => fs.readFileSync(path.join(__dirname, 'dados', arq), 'utf8').split(/\s+/))
  .filter(Boolean).map(Number);

async function main() {
  const cliente = await pool.connect();
  try {
    const resumo = await cliente.query(
      `SELECT empresa_id, count(*)::int AS linhas,
              count(DISTINCT contato_whatsapp_id)::int AS contatos,
              count(*) FILTER (WHERE copia_indevida)::int AS ja_marcadas
         FROM historico_mensagens WHERE id = ANY($1::int[])
        GROUP BY 1 ORDER BY 1`,
      [ids]
    );
    console.log(`${ids.length} linhas na lista`);
    console.table(resumo.rows);

    if (!APLICAR && !DESFAZER) {
      console.log('Simulação. Use --aplicar para marcar ou --desfazer para voltar.');
      return;
    }

    await cliente.query('BEGIN');
    const marcadas = await cliente.query(
      `UPDATE historico_mensagens SET copia_indevida = $2
        WHERE id = ANY($1::int[]) AND copia_indevida <> $2`,
      [ids, !DESFAZER]
    );
    // A "última mensagem" do contato (lista de contatos, card) volta a ser a última
    // que é DELE. Contato que só tinha cópia fica sem prévia.
    const contatos = await cliente.query(
      `WITH afetados AS (
         SELECT DISTINCT contato_whatsapp_id AS id FROM historico_mensagens
          WHERE id = ANY($1::int[]) AND contato_whatsapp_id IS NOT NULL
       ), ultima AS (
         SELECT a.id,
                (SELECT hm.conteudo FROM historico_mensagens hm
                  WHERE hm.contato_whatsapp_id = a.id AND hm.grupo_whatsapp_id IS NULL
                    AND NOT hm.copia_indevida
                  ORDER BY hm.enviado_at DESC LIMIT 1) AS conteudo,
                (SELECT max(hm.enviado_at) FROM historico_mensagens hm
                  WHERE hm.contato_whatsapp_id = a.id AND hm.grupo_whatsapp_id IS NULL
                    AND NOT hm.copia_indevida) AS quando
           FROM afetados a
       )
       UPDATE contatos_whatsapp c
          SET ultima_mensagem = u.conteudo, ultima_mensagem_at = u.quando
         FROM ultima u
        WHERE c.id = u.id`,
      [ids]
    );
    await cliente.query('COMMIT');
    console.log(`${DESFAZER ? 'Desmarcadas' : 'Marcadas'}: ${marcadas.rowCount} linhas · ` +
      `prévia recalculada em ${contatos.rowCount} contatos`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
