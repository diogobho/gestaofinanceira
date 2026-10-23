/**
 * Abrir e fechar grupo por horário (migration 109, chamado #420 da Panteras).
 *
 * A equipe fazia no SendFlow: sábado às 18h os grupos fecham ("só admins enviam") e na
 * segunda às 9h abrem. Uma regra é um conjunto de grupos com um horário de fechar e um de
 * abrir, cada um em dias da semana + hora de Brasília — a mesma conta das mensagens
 * recorrentes (`proximaRecorrencia`). Sai pelo chip de quem criou a regra, que precisa
 * ser admin do grupo. Quem roda é o job de Grupos, a cada minuto.
 */

import { query } from '../../config/database';
import { instancia } from '../whatsapp/canal/instancia';
import { isAdminEmpresa } from '../../shared/roles';
import { diasValidos, horaValida, proximaRecorrencia } from './agenda';
import { ErroGrupos, MAX_GRUPOS_POR_MENSAGEM, erroDaInstancia, portaQrDo } from './grupos.service';

type Usuario = { userId: number; empresa_id: number; tipo_usuario?: string; nivel?: string };
export type Acao = 'fechar' | 'abrir';

export interface EntradaHorario {
  titulo?: string;
  grupos?: { id: string; nome?: string }[];
  fechar?: { dias?: number[]; hora?: string };
  abrir?: { dias?: number[]; hora?: string };
  ativa?: boolean;
}

/** Pausa entre um grupo e outro: mudar 30 grupos no mesmo segundo é o que chama atenção. */
const PAUSA_ENTRE_GRUPOS_MS = 3000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validar(e: EntradaHorario) {
  const titulo = String(e.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroGrupos('Dê um nome para esta regra.');
  const grupos = (e.grupos || [])
    .filter((g) => typeof g?.id === 'string' && g.id.endsWith('@g.us'))
    .map((g) => ({ id: g.id, nome: String(g.nome || '').slice(0, 255) }));
  if (!grupos.length) throw new ErroGrupos('Escolha pelo menos um grupo.');
  if (grupos.length > MAX_GRUPOS_POR_MENSAGEM) throw new ErroGrupos(`No máximo ${MAX_GRUPOS_POR_MENSAGEM} grupos por regra.`);
  const horario = (h: EntradaHorario['fechar'], nome: string) => {
    if (!diasValidos(h?.dias)) throw new ErroGrupos(`Escolha pelo menos um dia para ${nome}.`);
    if (!horaValida(h?.hora)) throw new ErroGrupos(`Escolha o horário de ${nome} (HH:MM).`);
    return { dias: [...new Set(h!.dias!)].sort(), hora: h!.hora! };
  };
  return { titulo, grupos, fechar: horario(e.fechar, 'fechar'), abrir: horario(e.abrir, 'abrir'), ativa: e.ativa !== false };
}

/** Próximos instantes de fechar e abrir, estritamente depois de `agora`. */
export function proximosHorarios(
  r: { fechar_dias: number[]; fechar_hora: string; abrir_dias: number[]; abrir_hora: string },
  agora = new Date()
) {
  return {
    fechar: proximaRecorrencia(r.fechar_dias, r.fechar_hora, agora),
    abrir: proximaRecorrencia(r.abrir_dias, r.abrir_hora, agora),
  };
}

const SELECT_REGRA = `
  SELECT h.*, u.nome AS usuario_nome,
         -- A última rodada: todos os grupos dela gravam o mesmo executado_em.
         (SELECT row_to_json(x) FROM (
            SELECT e.acao, e.executado_em,
                   count(*) FILTER (WHERE e.status = 'feito')::int AS feitos,
                   count(*) FILTER (WHERE e.status = 'falhou')::int AS falhas,
                   string_agg(DISTINCT e.erro, ' · ') AS erro
              FROM grupos_horario_execucoes e
             WHERE e.regra_id = h.id
               AND e.executado_em = (SELECT max(executado_em) FROM grupos_horario_execucoes WHERE regra_id = h.id)
             GROUP BY e.acao, e.executado_em) x) AS ultima
    FROM grupos_horario h JOIN usuarios u ON u.id = h.usuario_id`;

export async function listarHorarios(u: Usuario) {
  const r = await query(`${SELECT_REGRA} WHERE h.empresa_id = $1 ORDER BY h.ativa DESC, h.created_at DESC`, [u.empresa_id]);
  return r.rows;
}

async function minha(u: Usuario, id: number) {
  const r = await query(`SELECT * FROM grupos_horario WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
  const h = r.rows[0];
  if (!h) throw new ErroGrupos('Regra não encontrada.', 404);
  if (h.usuario_id !== u.userId && !isAdminEmpresa(u as any)) {
    throw new ErroGrupos('Só quem criou esta regra, ou um administrador, pode mexer nela.', 403);
  }
  return h;
}

export async function salvarHorario(u: Usuario, e: EntradaHorario, editarId?: number) {
  const v = validar(e);
  const prox = proximosHorarios({ fechar_dias: v.fechar.dias, fechar_hora: v.fechar.hora, abrir_dias: v.abrir.dias, abrir_hora: v.abrir.hora });
  const params = [JSON.stringify(v.grupos), v.titulo, v.fechar.dias, v.fechar.hora, v.abrir.dias, v.abrir.hora, v.ativa,
    v.ativa ? prox.fechar : null, v.ativa ? prox.abrir : null];
  if (editarId) {
    const atual = await minha(u, editarId);
    await query(
      `UPDATE grupos_horario SET grupos=$1, titulo=$2, fechar_dias=$3, fechar_hora=$4, abrir_dias=$5, abrir_hora=$6,
              ativa=$7, proximo_fechar=$8, proximo_abrir=$9, updated_at=now()
        WHERE id=$10`,
      [...params, atual.id]
    );
    return { id: atual.id };
  }
  // A regra sai pelo chip de quem cria: sem QR conectado não há quem feche o grupo.
  await portaQrDo(u.userId);
  const r = await query(
    `INSERT INTO grupos_horario (grupos, titulo, fechar_dias, fechar_hora, abrir_dias, abrir_hora, ativa,
                                 proximo_fechar, proximo_abrir, empresa_id, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [...params, u.empresa_id, u.userId]
  );
  return { id: r.rows[0].id };
}

/** Ligar/desligar. Religar recalcula os próximos horários a partir de agora. */
export async function alternarHorario(u: Usuario, id: number, ativa: boolean) {
  const h = await minha(u, id);
  const prox = ativa ? proximosHorarios(h) : null;
  await query(`UPDATE grupos_horario SET ativa=$2, proximo_fechar=$3, proximo_abrir=$4, updated_at=now() WHERE id=$1`,
    [h.id, ativa, prox?.fechar ?? null, prox?.abrir ?? null]);
}

export async function excluirHorario(u: Usuario, id: number) {
  const h = await minha(u, id);
  await query(`DELETE FROM grupos_horario WHERE id = $1`, [h.id]);
}

export async function execucoesDo(u: Usuario, id: number) {
  const h = await minha(u, id);
  const r = await query(
    `SELECT grupo_id, grupo_nome, acao, status, erro, executado_em FROM grupos_horario_execucoes
      WHERE regra_id = $1 ORDER BY executado_em DESC, id LIMIT 200`, [h.id]);
  return r.rows;
}

/**
 * Fecha ou abre todos os grupos da regra, um de cada vez. Chip fora do ar vira falha para o
 * resto da rodada com o motivo, como nas mensagens.
 */
export async function executarHorario(h: any, acao: Acao): Promise<{ feitos: number; falhas: number }> {
  const executadoEm = new Date();
  let porta: number | null = null;
  let erroChip: string | null = null;
  try { porta = await portaQrDo(h.usuario_id); } catch (e: any) { erroChip = e.message; }
  let feitos = 0;
  let falhas = 0;
  const grupos: { id: string; nome?: string }[] = h.grupos || [];
  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    let erro: string | null = erroChip;
    if (!erro && porta) {
      try {
        await instancia(porta).post(`/groups/${encodeURIComponent(g.id)}/settings`, { fechado: acao === 'fechar' }, { timeout: 30000 });
      } catch (e: any) {
        erro = erroDaInstancia(e);
        if (e?.response?.status === 503 || e?.code === 'ECONNREFUSED') erroChip = erro;
      }
    }
    await query(
      `INSERT INTO grupos_horario_execucoes (regra_id, empresa_id, grupo_id, grupo_nome, acao, status, erro, executado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [h.id, h.empresa_id, g.id, g.nome || null, acao, erro ? 'falhou' : 'feito', erro, executadoEm]
    );
    if (erro) falhas++; else feitos++;
    if (!erro && i < grupos.length - 1) await espera(PAUSA_ENTRE_GRUPOS_MS);
  }
  return { feitos, falhas };
}

/** "Fechar agora" / "Abrir agora": na hora, sem mexer nos próximos horários marcados. */
export async function executarAgora(u: Usuario, id: number, acao: Acao) {
  if (acao !== 'fechar' && acao !== 'abrir') throw new ErroGrupos('Ação inválida.');
  const h = await minha(u, id);
  await query(`UPDATE grupos_horario SET ultima_execucao = now() WHERE id = $1`, [h.id]);
  return executarHorario(h, acao);
}

/**
 * Pega uma regra vencida e, no mesmo UPDATE, marca o próximo horário DAQUELA ação. Se fechar
 * e abrir venceram juntos (servidor parado), vale o mais recente: é o estado que o grupo
 * deveria ter agora; o outro só é remarcado.
 */
export async function proximoHorarioVencido(): Promise<{ regra: any; acao: Acao } | null> {
  const r = await query(
    `SELECT * FROM grupos_horario
      WHERE ativa AND (proximo_fechar <= now() OR proximo_abrir <= now())
      ORDER BY LEAST(proximo_fechar, proximo_abrir) LIMIT 1`
  );
  const h = r.rows[0];
  if (!h) return null;
  const agora = new Date();
  const venceuFechar = h.proximo_fechar && new Date(h.proximo_fechar) <= agora;
  const venceuAbrir = h.proximo_abrir && new Date(h.proximo_abrir) <= agora;
  const acao: Acao = venceuFechar && venceuAbrir
    ? (new Date(h.proximo_fechar) > new Date(h.proximo_abrir) ? 'fechar' : 'abrir')
    : venceuFechar ? 'fechar' : 'abrir';
  const prox = proximosHorarios(h, agora);
  const c = await query(
    `UPDATE grupos_horario
        SET proximo_fechar = CASE WHEN proximo_fechar <= now() THEN $2::timestamptz ELSE proximo_fechar END,
            proximo_abrir  = CASE WHEN proximo_abrir  <= now() THEN $3::timestamptz ELSE proximo_abrir END,
            ultima_execucao = now(), updated_at = now()
      WHERE id = $1 AND ativa AND (proximo_fechar <= now() OR proximo_abrir <= now()) RETURNING *`,
    [h.id, prox.fechar, prox.abrir]
  );
  return c.rows[0] ? { regra: c.rows[0], acao } : null;
}
