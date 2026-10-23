import { query } from '../../../config/database';

/**
 * Ids que chegam no corpo da requisição precisam pertencer à empresa de quem pede.
 * As rotas filtram por `empresa_id` no que LEEM, mas um INSERT com `lead_id` de
 * outra conta passava (achado em 22/10/2026, ao construir as ações do Duo no CRM).
 *
 * O erro leva `status` para o controller devolver 404/400 em vez de 500 — e o 404
 * não diz se o lead existe noutra conta.
 */
export class ErroEscopo extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function garantirLeadDaEmpresa(leadId: unknown, empresaId: number): Promise<void> {
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) throw new ErroEscopo('Lead inválido', 400);
  const r = await query(`SELECT 1 FROM leads WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (r.rowCount === 0) throw new ErroEscopo('Lead não encontrado', 404);
}

export async function garantirUsuarioDaEmpresa(usuarioId: unknown, empresaId: number): Promise<void> {
  const id = Number(usuarioId);
  if (!Number.isInteger(id) || id <= 0) throw new ErroEscopo('Responsável inválido', 400);
  const r = await query(`SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (r.rowCount === 0) throw new ErroEscopo('Responsável não encontrado nesta conta', 400);
}
