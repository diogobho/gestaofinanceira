/**
 * Marcos de lembrete/no-show do estágio 211 (Reunião agendada, funil 24).
 *
 * O fluxo de resgate do lead que não respondeu já vivia aqui — não em followup_config.
 * Criar uma cadência paralela faria o lead receber duas mensagens em cada marco.
 *
 * Os offsets são relativos ao HORÁRIO DA REUNIÃO (tarefa tipo 'reuniao'), não à
 * entrada no estágio. O grupo 'noshow' para de disparar quando o lead é movido
 * para "Reunião Realizada".
 *
 * Rodar:  node scripts/noshow_escola_20260805.js [--aplicar]
 * Rollback: backups/rollback_fluxo_escola_20260805.sql
 */
const { Client } = require('pg');

const CFG = {
  ativo: true,
  marcos: [
    // ── Antes da reunião (inalterados) ──
    {
      grupo: 'lembrete', marco: 'lembrete_24h', offset_min: -1440, tolerancia_min: 180,
      mensagem: 'Oi [PrimeiroNome]! Passando para lembrar que a nossa conversa é amanhã às [Horario] 😊 ' +
        'Confirma que está tudo certo? Se precisar ajustar algo, é só me falar!',
    },
    {
      grupo: 'lembrete', marco: 'lembrete_1h', offset_min: -60, tolerancia_min: 55,
      mensagem: 'Oi [PrimeiroNome]! Faltando 1 hora para a nossa conversa 🙌 Estou por aqui, até já!',
    },

    // ── Resgate quando não apareceu / não respondeu ──
    {
      grupo: 'noshow', marco: 'noshow_d0', offset_min: 120, tolerancia_min: 240,
      mensagem: 'Oi [PrimeiroNome]! Tudo bem? Aguardei você hoje, mas sei que imprevistos acontecem 😊 ' +
        'Podemos remarcar? Me fala um horário que funcione melhor pra você.',
    },
    {
      grupo: 'noshow', marco: 'noshow_d1', offset_min: 1440, tolerancia_min: 240,
      mensagem: 'Oi [PrimeiroNome], tudo bem? Viu a minha msg? Podemos reagendar — me diz dois horários ' +
        'que funcionem melhor pra você que eu já reservo 🙂',
    },
    {
      grupo: 'noshow', marco: 'noshow_d3', offset_min: 4320, tolerancia_min: 240,
      mensagem: 'Oi [PrimeiroNome], como vai? Faz sentido aprofundarmos sobre o que você me trouxe ' +
        'na nossa conversa. Adoraria um retorno seu.',
    },
    {
      // Tolerância de 1 dia (os outros usam 4h): é o último toque e o job não roda
      // em sábado/domingo — com 240min, um D+6 que caísse no fim de semana sumiria.
      grupo: 'noshow', marco: 'noshow_d6', offset_min: 8640, tolerancia_min: 1440,
      mensagem: 'Oi [PrimeiroNome], tudo bom?\n\nEntendi que agora talvez não seja o melhor momento para ' +
        'conversarmos. Vou seguir mandando conteúdos e novidades úteis de vez em quando. ' +
        'Quando fizer sentido conversar é só me chamar 😃',
    },
  ],
};

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (ex.: export $(grep ^DATABASE_URL ../.env))');
  await c.connect();

  for (const m of CFG.marcos) {
    const h = m.offset_min / 60;
    const quando = m.offset_min < 0 ? `${-h}h ANTES` : (h < 24 ? `${h}h depois` : `D+${h / 24}`);
    console.log(`${m.marco.padEnd(14)} ${quando.padEnd(10)} tol ${String(m.tolerancia_min).padStart(4)}min  ${m.mensagem.replace(/\n+/g, ' ⏎ ').slice(0, 90)}...`);
  }

  if (aplicar) {
    const r = await c.query(
      `UPDATE estagios_funil SET reuniao_lembretes = $1::jsonb WHERE id = 211 AND funil_id = 24`,
      [JSON.stringify(CFG)]
    );
    console.log(`\n✓ Aplicado (${r.rowCount} estágio).`);
  } else {
    console.log('\nPREVIEW — nada gravado. Use --aplicar.');
  }
  await c.end();
})();
