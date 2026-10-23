/**
 * Tarefas automáticas ao entrar no estágio (108, 13/10/2026). Pedido do dono da Panteras para o
 * funil 74: cada etapa do fluxo põe na mão do vendedor o que ele tem de fazer ali.
 *
 * - Ao entrar no estágio, cria cada tarefa de `estagios_funil.tarefas_entrada` para o dono do card,
 *   vencendo em `prazo` horas ou dias (dia: no horário `hora`); fim de semana rola para segunda.
 * - Antes, cancela as pendentes que outro estágio criou: a tarefa da etapa anterior deixou de valer
 *   (ex.: "convidar para a reunião" quando o card já está em Reunião agendada). Tarefa criada à mão
 *   não tem `estagio_origem_id` e nunca é tocada.
 * - A mesma tarefa pendente no mesmo estágio não é criada duas vezes.
 * Tipo 'reuniao' fica de fora de propósito: ele liga os lembretes e o no-show da reunião.
 */
import { query } from '../../../config/database';
import { calcularAgendadoPara } from '../_shared/agendamento';

export interface TarefaDoEstagio {
  titulo: string;
  descricao?: string | null;
  tipo?: 'ligacao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente';
  prazo?: number;
  unidade?: 'hora' | 'dia';
  hora?: string | null;
}

const TIPOS = new Set(['ligacao', 'email', 'follow_up', 'proposta', 'visita', 'outros']);
const PRIORIDADES = new Set(['baixa', 'normal', 'alta', 'urgente']);
const DIAS_UTEIS = [1, 2, 3, 4, 5];

/** Limpa a lista que chega da tela: sem título não vale; tipo e prioridade só dos permitidos. */
export function normalizarTarefasEntrada(lista: any): TarefaDoEstagio[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((t: any) => ({
      titulo: String(t?.titulo ?? '').trim().slice(0, 255),
      descricao: String(t?.descricao ?? '').trim() || null,
      tipo: TIPOS.has(t?.tipo) ? t.tipo : 'follow_up',
      prioridade: PRIORIDADES.has(t?.prioridade) ? t.prioridade : 'normal',
      prazo: Math.max(0, Math.min(365, Math.round(Number(t?.prazo) || 0))),
      unidade: t?.unidade === 'hora' ? 'hora' : 'dia',
      hora: /^\d{2}:\d{2}$/.test(String(t?.hora ?? '')) ? t.hora : '09:00',
    } as TarefaDoEstagio))
    .filter((t) => t.titulo);
}

/** Vencimento como o resto das tarefas grava: naive em UTC (o pg descarta o "Z"). */
export function vencimentoDaTarefa(t: TarefaDoEstagio, entrada: Date = new Date()): string {
  return calcularAgendadoPara({
    modo: 'dias', atrasoDias: t.prazo ?? 0, atrasoUnidade: t.unidade === 'hora' ? 'hora' : 'dia',
    horaEnvio: t.hora || '09:00', diasSemana: DIAS_UTEIS,
  }, entrada);
}

export async function aplicarTarefasDoEstagio(leadId: number, estagioId: number, empresaId: number, criadoPor?: number | null) {
  try {
    await query(
      `UPDATE tarefas_lead SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP
        WHERE lead_id = $1 AND empresa_id = $2 AND status = 'pendente'
          AND estagio_origem_id IS NOT NULL AND estagio_origem_id <> $3`,
      [leadId, empresaId, estagioId]
    );
    const r = await query(
      `SELECT ef.tarefas_entrada, COALESCE(l.responsavel_id, l.usuario_id) AS dono, l.arquivado
         FROM leads l JOIN estagios_funil ef ON ef.id = $2
        WHERE l.id = $1 AND l.empresa_id = $3`,
      [leadId, estagioId, empresaId]
    );
    const row = r.rows[0];
    const tarefas = normalizarTarefasEntrada(row?.tarefas_entrada);
    if (!row || row.arquivado || !row.dono || tarefas.length === 0) return;
    const entrada = new Date();
    for (const t of tarefas) {
      const ins = await query(
        `INSERT INTO tarefas_lead (lead_id, empresa_id, responsavel_id, criado_por_id, tipo, titulo, descricao,
                                   data_vencimento, prioridade, estagio_origem_id)
         SELECT $1::int, $2::int, $3::int, $4::int, $5::varchar, $6::varchar, $7::text, $8::timestamp, $9::varchar, $10::int
          WHERE NOT EXISTS (SELECT 1 FROM tarefas_lead WHERE lead_id = $1::int AND status = 'pendente'
                               AND estagio_origem_id = $10::int AND titulo = $6::varchar)
         RETURNING id`,
        [leadId, empresaId, row.dono, criadoPor || row.dono, t.tipo, t.titulo, t.descricao,
         vencimentoDaTarefa(t, entrada), t.prioridade, estagioId]
      );
      if (ins.rows[0]) {
        await query(
          `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
           VALUES ($1, $2, $3, 'tarefa', $4, $5)`,
          [leadId, criadoPor || row.dono, empresaId, `Tarefa "${t.titulo}" criada pela etapa`,
           JSON.stringify({ tarefa_id: ins.rows[0].id, tipo: t.tipo, automatica: true, estagio_id: estagioId })]
        );
      }
    }
  } catch (e: any) {
    console.warn(`[TarefasEstagio] lead #${leadId} estágio ${estagioId}: ${e.message}`);
  }
}
