import { query } from '../../../config/database';

/**
 * "Parar de receber" (06/10/2026, funil oficial da Escola na Panteras).
 *
 * Todo modelo de Marketing do oficial leva o botão "Parar de receber", e a Meta exige que
 * o pedido seja respeitado — ignorá-lo é o caminho mais curto para derrubar a qualidade do
 * número. Quando o lead toca no botão (ou escreve só "parar", "sair", "cancelar"…):
 * - a saída fica registrada pelo NÚMERO, na empresa (vale para todos os cards dele);
 * - os follow-ups pendentes são cancelados e o card vai para a etapa de perda do funil;
 * - nenhum envio automático sai mais: follow-up, cadência e disparo.
 * A conversa manual do vendedor continua livre — é gente falando com gente.
 *
 * Tabela do gestao_user, criada aqui (como `respostas_botao`): não depende de rodar
 * migration como postgres para começar a valer.
 */

let tabelaPronta: Promise<unknown> | null = null;
function garantirTabela() {
  tabelaPronta ??= query(
    `CREATE TABLE IF NOT EXISTS whatsapp_optout (
       empresa_id INTEGER NOT NULL, chave VARCHAR(12) NOT NULL, numero VARCHAR(20),
       lead_id INTEGER, origem VARCHAR(20) NOT NULL, texto VARCHAR(120),
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (empresa_id, chave))`
  ).catch((e) => { tabelaPronta = null; throw e; });
  return tabelaPronta;
}

/**
 * DDD + últimos 8 dígitos: o mesmo número com ou sem DDI 55 e com ou sem o 9º dígito
 * dá a mesma chave. Número curto demais (ou JID de grupo) não tem chave.
 */
export function chaveDoNumero(numero: unknown): string | null {
  let d = String(numero ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return d.slice(0, 2) + d.slice(-8);
}

const PALAVRAS_SAIDA = new Set([
  'parar', 'pare', 'sair', 'cancelar', 'stop', 'parar de receber', 'nao quero receber',
  'nao quero mais receber', 'quero sair', 'nao me mande mais mensagem', 'nao me mande mais mensagens',
]);

function normalizar(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** O clique no botão "Parar de receber", ou a mensagem INTEIRA sendo um pedido de saída. */
export function ehPedidoDeSaida(texto: unknown, botao: boolean): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  if (botao) return t === 'parar de receber';
  return PALAVRAS_SAIDA.has(t);
}

export async function numeroSaiu(empresaId: number, numero: unknown): Promise<boolean> {
  const chave = chaveDoNumero(numero);
  if (!chave) return false;
  await garantirTabela();
  const r = await query(`SELECT 1 FROM whatsapp_optout WHERE empresa_id = $1 AND chave = $2`, [empresaId, chave]);
  return r.rows.length > 0;
}

/** O lead pediu para sair? Olha o número do contato vinculado e o telefone do card. */
export async function leadSaiu(leadId: number): Promise<boolean> {
  const r = await query(
    `SELECT l.empresa_id, l.telefone, c.whatsapp_id, c.numero
       FROM leads l LEFT JOIN contatos_whatsapp c ON c.id = l.contato_whatsapp_id
      WHERE l.id = $1`,
    [leadId]
  );
  const l = r.rows[0];
  if (!l) return false;
  for (const n of [l.numero, l.whatsapp_id, l.telefone]) {
    if (await numeroSaiu(l.empresa_id, n)) return true;
  }
  return false;
}

/**
 * Registra a saída e encerra a automação dos cards deste contato: perda com o motivo,
 * follow-ups cancelados. `moverParaPerda` é injetado para não criar ciclo de import com
 * o leads.service. Nunca lança — o webhook segue.
 */
export async function registrarSaida(
  empresaId: number,
  numero: unknown,
  leadIds: number[],
  origem: 'botao' | 'texto',
  texto: string,
  moverParaPerda: (leadId: number, estagioId: number) => Promise<unknown>
): Promise<void> {
  try {
    const chave = chaveDoNumero(numero);
    if (!chave) return;
    await garantirTabela();
    await query(
      `INSERT INTO whatsapp_optout (empresa_id, chave, numero, lead_id, origem, texto)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (empresa_id, chave) DO NOTHING`,
      [empresaId, chave, String(numero ?? '').replace(/@.*$/, '').slice(0, 20), leadIds[0] ?? null, origem, String(texto).slice(0, 120)]
    );
    for (const leadId of leadIds) {
      const perda = await query(
        `SELECT ep.id FROM leads l
           JOIN estagios_funil ep ON ep.funil_id = l.funil_id AND ep.is_perdido
          WHERE l.id = $1 AND l.empresa_id = $2 ORDER BY ep.ordem LIMIT 1`,
        [leadId, empresaId]
      );
      if (perda.rows[0]) await moverParaPerda(leadId, perda.rows[0].id).catch(() => {});
      await query(`UPDATE leads SET motivo_perda = 'Pediu para parar de receber' WHERE id = $1 AND empresa_id = $2`, [leadId, empresaId]);
      // Depois de mover: a mudança de etapa semeia a cadência da Perda, que também sai.
      // Só 'pendente': o que já está 'processando' é barrado no despacho (`leadSaiu`).
      await query(
        `UPDATE followups_agendados SET status = 'cancelado', erro_categoria = 'cancelado_usuario',
                erro = 'O lead pediu para parar de receber mensagens', updated_at = NOW()
          WHERE lead_id = $1 AND status = 'pendente'`,
        [leadId]
      );
    }
  } catch (e: any) {
    console.error(`[Opt-out] empresa ${empresaId}: ${e.message}`);
  }
}
