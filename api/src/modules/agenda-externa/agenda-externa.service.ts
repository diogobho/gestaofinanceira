/**
 * Agenda externa (migration 103, 06/10/2026): a reunião do CRM (tarefa tipo 'reuniao') vira
 * evento na agenda do RESPONSÁVEL — Google Agenda com Meet ou Microsoft 365 com Teams.
 *
 * Só ida. `sincronizarTarefa` é idempotente e decide pelo estado atual da tarefa:
 *  - reunião pendente/em andamento + responsável com agenda conectada → evento existe e
 *    está igual (cria, ou atualiza se a `assinatura` mudou);
 *  - concluída → o evento fica (a reunião aconteceu);
 *  - cancelada, excluída, virou outro tipo, ou responsável sem agenda → evento sai;
 *  - trocou o responsável → sai da agenda do antigo e entra na do novo.
 * O `tarefasService` chama depois de cada escrita (sem esperar), e o job concilia o que
 * ficou para trás (erro de rede, token renovado, tarefa apagada junto com o lead).
 *
 * O lead com e-mail entra como convidado: o Google/Outlook manda o convite a ele.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database';
import { env } from '../../config/env';
import { decrypt, encrypt } from '../../utils/crypto';
import {
  Provedor, PROVEDORES, configurado, urlAutorizacao, trocarCodigo, renovar,
  criarEvento, atualizarEvento, excluirEvento, lerEvento, erroDaApi, DadosEvento, URL_PUBLICA,
} from './provedores';

const PREFIXO = '[AgendaExterna]';
/** Reunião sem duração escolhida (`tarefas_reuniao`, 104) vai com 1h. */
export const DURACAO_MIN = 60;
const ATIVOS = ['pendente', 'em_andamento'];

export class ErroAgenda extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// ─── Conexão ──────────────────────────────────────────────────────────────────

export async function status(usuarioId: number) {
  const c = (await query(
    `SELECT provedor, email, erro, conectado_em FROM agenda_contas WHERE usuario_id = $1`, [usuarioId]
  )).rows[0] || null;
  return {
    provedores: PROVEDORES.map((p) => ({ provedor: p, configurado: configurado(p) })),
    conta: c,
  };
}

/** URL do login do provedor. O `state` é assinado: o retorno não tem token de sessão. */
export function iniciarConexao(usuarioId: number, empresaId: number, p: Provedor): string {
  if (!PROVEDORES.includes(p)) throw new ErroAgenda('Provedor inválido');
  if (!configurado(p)) throw new ErroAgenda(`A conexão com ${p === 'google' ? 'o Google' : 'a Microsoft'} ainda não foi configurada no servidor.`, 409);
  const state = jwt.sign({ u: usuarioId, e: empresaId, p, n: crypto.randomBytes(8).toString('hex') }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  return urlAutorizacao(p, state);
}

/** Retorno do OAuth. Devolve para onde mandar o navegador. */
export async function concluirConexao(p: Provedor, code: string | undefined, state: string | undefined, erro?: string): Promise<string> {
  const volta = (r: string) => `${URL_PUBLICA}/gestao/configuracoes/email?agenda=${r}`;
  if (erro || !code || !state) return volta('cancelada');
  let s: any;
  try { s = jwt.verify(state, env.JWT_ACCESS_SECRET); } catch { return volta('expirada'); }
  if (s.p !== p) return volta('erro');
  try {
    const t = await trocarCodigo(p, code);
    const anterior = (await query(`SELECT provedor FROM agenda_contas WHERE usuario_id = $1`, [s.u])).rows[0];
    await query(
      `INSERT INTO agenda_contas (usuario_id, empresa_id, provedor, email, access_token_enc, refresh_token_enc, expira_em, erro, conectado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,now())
       ON CONFLICT (usuario_id) DO UPDATE SET empresa_id=$2, provedor=$3, email=$4, access_token_enc=$5,
         refresh_token_enc=COALESCE($6, agenda_contas.refresh_token_enc), expira_em=$7, erro=NULL, conectado_em=now()`,
      [s.u, s.e, p, t.email, encrypt(t.access), t.refresh ? encrypt(t.refresh) : null, t.expiraEm]
    );
    // Trocou de Google para Microsoft (ou vice-versa): os eventos antigos ficam na agenda
    // antiga, órfãos — esquecê-los faz a conciliação recriar tudo na nova.
    if (anterior && anterior.provedor !== p) await query(`DELETE FROM agenda_eventos WHERE usuario_id = $1`, [s.u]);
    console.log(`${PREFIXO} usuário ${s.u} conectou ${p} (${t.email || 'sem e-mail'})`);
    sincronizarDoUsuario(s.u).catch(() => {});
    return volta('ok');
  } catch (e: any) {
    console.error(`${PREFIXO} conexão ${p} do usuário ${s.u} falhou:`, erroDaApi(e));
    return volta('erro');
  }
}

/** Desconecta: apaga as reuniões futuras que o Duo pôs lá (as passadas ficam) e esquece a conta. */
export async function desconectar(usuarioId: number) {
  const conta = (await query(`SELECT * FROM agenda_contas WHERE usuario_id = $1`, [usuarioId])).rows[0];
  if (!conta) return { success: true };
  const futuros = (await query(
    `SELECT ae.tarefa_id, ae.evento_id FROM agenda_eventos ae JOIN tarefas_lead t ON t.id = ae.tarefa_id
      WHERE ae.usuario_id = $1 AND t.data_vencimento > (now() AT TIME ZONE 'UTC')`, [usuarioId]
  )).rows;
  try {
    const token = await tokenDe(conta);
    for (const f of futuros) await excluirEvento(conta.provedor, token, f.evento_id).catch(() => {});
  } catch { /* acesso já revogado: não há o que apagar */ }
  await query(`DELETE FROM agenda_eventos WHERE usuario_id = $1`, [usuarioId]);
  await query(`DELETE FROM agenda_contas WHERE usuario_id = $1`, [usuarioId]);
  return { success: true };
}

async function tokenDe(conta: any): Promise<string> {
  if (new Date(conta.expira_em).getTime() - Date.now() > 120_000) return decrypt(conta.access_token_enc);
  if (!conta.refresh_token_enc) throw new Error('A conexão expirou. Conecte a agenda de novo.');
  try {
    const t = await renovar(conta.provedor, decrypt(conta.refresh_token_enc));
    await query(
      `UPDATE agenda_contas SET access_token_enc=$2, refresh_token_enc=$3, expira_em=$4, erro=NULL WHERE usuario_id=$1`,
      [conta.usuario_id, encrypt(t.access), t.refresh ? encrypt(t.refresh) : conta.refresh_token_enc, t.expiraEm]
    );
    return t.access;
  } catch (e: any) {
    const msg = e?.response?.status === 400 || e?.response?.status === 401
      ? 'O acesso à agenda foi revogado ou expirou. Conecte de novo em Configurações de E-mail.'
      : erroDaApi(e);
    await query(`UPDATE agenda_contas SET erro = $2 WHERE usuario_id = $1`, [conta.usuario_id, msg]);
    throw new Error(msg);
  }
}

// ─── Sincronização ────────────────────────────────────────────────────────────

function montarEvento(t: any): DadosEvento {
  const inicio = new Date(`${String(t.inicio_utc).replace(' ', 'T')}Z`);
  const quem = [t.lead_nome, t.lead_telefone ? `WhatsApp ${t.lead_telefone}` : null, t.lead_email].filter(Boolean).join(' · ');
  return {
    titulo: t.lead_nome && !String(t.titulo).includes(t.lead_nome) ? `${t.titulo} — ${t.lead_nome}` : t.titulo,
    descricao: [t.descricao, quem ? `Lead: ${quem}` : null, 'Marcada no Duo — CRM e Financeiro com IA.'].filter(Boolean).join('\n\n'),
    inicio,
    fim: new Date(inicio.getTime() + (Number(t.duracao_min) || DURACAO_MIN) * 60_000),
    convidado: t.lead_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.lead_email) ? { email: t.lead_email, nome: t.lead_nome || t.lead_email } : null,
    chave: `${t.id}-${t.responsavel_id}`,
  };
}

const assinar = (e: DadosEvento) =>
  crypto.createHash('sha1').update(JSON.stringify({ ...e, inicio: e.inicio.toISOString(), fim: e.fim.toISOString(), chave: undefined })).digest('hex');

export async function sincronizarTarefa(tarefaId: number): Promise<void> {
  const t = (await query(
    `SELECT t.id, t.empresa_id, t.tipo, t.status, t.titulo, t.descricao, t.responsavel_id,
            to_char(t.data_vencimento, 'YYYY-MM-DD HH24:MI:SS') AS inicio_utc,
            l.nome AS lead_nome, l.telefone AS lead_telefone, l.email AS lead_email, tr.duracao_min
       FROM tarefas_lead t LEFT JOIN leads l ON l.id = t.lead_id
       LEFT JOIN tarefas_reuniao tr ON tr.tarefa_id = t.id WHERE t.id = $1`, [tarefaId]
  )).rows[0];
  const atual = (await query(`SELECT * FROM agenda_eventos WHERE tarefa_id = $1`, [tarefaId])).rows[0];
  const conta = t?.responsavel_id
    ? (await query(`SELECT * FROM agenda_contas WHERE usuario_id = $1`, [t.responsavel_id])).rows[0]
    : null;

  const querEvento = !!t && t.tipo === 'reuniao' && !!conta && (ATIVOS.includes(t.status) || (t.status === 'concluida' && !!atual));
  const mesmaAgenda = atual && conta && atual.usuario_id === conta.usuario_id && atual.provedor === conta.provedor;

  // Sai da agenda onde está, se não deve mais estar lá.
  if (atual && (!querEvento || !mesmaAgenda)) {
    const dono = (await query(`SELECT * FROM agenda_contas WHERE usuario_id = $1`, [atual.usuario_id])).rows[0];
    if (dono && dono.provedor === atual.provedor) {
      try {
        await excluirEvento(dono.provedor, await tokenDe(dono), atual.evento_id);
      } catch (e: any) {
        await query(`UPDATE agenda_eventos SET erro = $2 WHERE tarefa_id = $1`, [tarefaId, erroDaApi(e)]);
        throw e;
      }
    }
    await query(`DELETE FROM agenda_eventos WHERE tarefa_id = $1`, [tarefaId]);
    if (!querEvento) return;
  }
  if (!querEvento) return;
  // Concluída: não mexe mais (nem recria se alguém apagou lá).
  if (t.status === 'concluida') return;

  const ev = montarEvento(t);
  const assinatura = assinar(ev);
  const existente = mesmaAgenda ? atual : null;
  if (existente && existente.assinatura === assinatura && !existente.erro) {
    // Igual, mas a sala do Meet ainda não tinha saído quando o evento foi criado: busca o link.
    if (!existente.link_reuniao && conta.provedor === 'google') await completarLink(tarefaId, conta, existente.evento_id).catch(() => {});
    return;
  }

  try {
    const token = await tokenDe(conta);
    let r;
    try {
      r = existente ? await atualizarEvento(conta.provedor, token, existente.evento_id, ev) : await criarEvento(conta.provedor, token, ev);
    } catch (e: any) {
      // Apagado direto na agenda: recria.
      if (existente && [404, 410].includes(e?.response?.status)) r = await criarEvento(conta.provedor, token, ev);
      else throw e;
    }
    await query(
      `INSERT INTO agenda_eventos (tarefa_id, empresa_id, usuario_id, provedor, evento_id, link_reuniao, link_evento, assinatura, sincronizado_em, erro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),NULL)
       ON CONFLICT (tarefa_id) DO UPDATE SET usuario_id=$3, provedor=$4, evento_id=$5,
         link_reuniao=COALESCE($6, agenda_eventos.link_reuniao), link_evento=COALESCE($7, agenda_eventos.link_evento),
         assinatura=$8, sincronizado_em=now(), erro=NULL`,
      [tarefaId, t.empresa_id, conta.usuario_id, conta.provedor, r.id, r.linkReuniao, r.linkEvento, assinatura]
    );
    if (!r.linkReuniao && conta.provedor === 'google') {
      await new Promise((ok) => setTimeout(ok, 2500));
      await completarLink(tarefaId, conta, r.id).catch(() => {});
    }
  } catch (e: any) {
    const msg = erroDaApi(e);
    if (existente) await query(`UPDATE agenda_eventos SET erro = $2 WHERE tarefa_id = $1`, [tarefaId, msg]);
    console.warn(`${PREFIXO} tarefa ${tarefaId} (${conta.provedor}, usuário ${conta.usuario_id}): ${msg}`);
    throw e;
  }
}

/** Relê o evento para gravar o link da sala (Meet sai pendente na criação; o job tenta de novo). */
async function completarLink(tarefaId: number, conta: any, eventoId: string): Promise<void> {
  const r = await lerEvento(conta.provedor, await tokenDe(conta), eventoId);
  if (r.linkReuniao) {
    await query(`UPDATE agenda_eventos SET link_reuniao = $2, link_evento = COALESCE($3, link_evento) WHERE tarefa_id = $1`,
      [tarefaId, r.linkReuniao, r.linkEvento]);
  }
}

/** Chamado pelo tarefasService depois de cada escrita — nunca atrasa nem derruba a tela. */
export function aoMudarTarefa(tarefaId: number | undefined | null): void {
  if (!tarefaId) return;
  setImmediate(() => { sincronizarTarefa(tarefaId).catch(() => {}); });
}

/** Ao conectar: as reuniões futuras do usuário vão para a agenda nova. */
async function sincronizarDoUsuario(usuarioId: number) {
  const r = await query(
    `SELECT id FROM tarefas_lead WHERE responsavel_id = $1 AND tipo = 'reuniao' AND status = ANY($2::text[])
        AND data_vencimento > (now() AT TIME ZONE 'UTC') - interval '1 day'`,
    [usuarioId, ATIVOS]
  );
  for (const { id } of r.rows) await sincronizarTarefa(id).catch(() => {});
}

/**
 * Job: o que ficou para trás. Reuniões ativas (de quem tem agenda) sem evento, com erro ou
 * mexidas depois da última sincronização; e eventos cuja tarefa sumiu ou mudou de estado.
 */
export async function conciliar(): Promise<void> {
  const r = await query(
    `SELECT t.id FROM tarefas_lead t
       JOIN agenda_contas c ON c.usuario_id = t.responsavel_id AND c.erro IS NULL
       LEFT JOIN agenda_eventos ae ON ae.tarefa_id = t.id
      WHERE t.tipo = 'reuniao' AND t.status = ANY($1::text[])
        AND t.data_vencimento > (now() AT TIME ZONE 'UTC') - interval '1 day'
        AND (ae.tarefa_id IS NULL OR ae.erro IS NOT NULL OR (ae.link_reuniao IS NULL AND ae.provedor = 'google')
             OR t.updated_at > (ae.sincronizado_em AT TIME ZONE 'UTC'))
     UNION
     SELECT ae.tarefa_id FROM agenda_eventos ae LEFT JOIN tarefas_lead t ON t.id = ae.tarefa_id
      WHERE t.id IS NULL OR t.tipo <> 'reuniao' OR t.status = 'cancelada' OR t.responsavel_id <> ae.usuario_id
     LIMIT 200`,
    [ATIVOS]
  );
  for (const { id } of r.rows) await sincronizarTarefa(id).catch(() => {});
}

/** Links da reunião por tarefa, para o card. */
export async function linksDasTarefas(ids: number[]): Promise<Map<number, any>> {
  if (!ids.length) return new Map();
  const r = await query(`SELECT tarefa_id, provedor, link_reuniao, link_evento, erro FROM agenda_eventos WHERE tarefa_id = ANY($1::int[])`, [ids]);
  return new Map(r.rows.map((x: any) => [x.tarefa_id, x]));
}

/**
 * O evento como está AGORA na agenda do responsável, lido direto da API do provedor — usado
 * pelo vídeo de verificação do Google para provar criação, remarcação e exclusão reais.
 */
export async function eventoAoVivo(tarefaId: number, eventoId?: string, usuarioId?: number): Promise<any> {
  const ae = (await query(`SELECT evento_id, usuario_id FROM agenda_eventos WHERE tarefa_id = $1`, [tarefaId])).rows[0];
  const id = eventoId || ae?.evento_id;
  const conta = (await query(`SELECT * FROM agenda_contas WHERE usuario_id = $1`, [usuarioId || ae?.usuario_id])).rows[0];
  if (!id || !conta) return null;
  const axios = (await import('axios')).default;
  const base = conta.provedor === 'google'
    ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    : 'https://graph.microsoft.com/v1.0/me/events';
  try {
    const { data } = await axios.get(`${base}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await tokenDe(conta)}` }, timeout: 15_000 });
    return { id, ...data };
  } catch (e: any) {
    return { id, status: e?.response?.status === 404 || e?.response?.status === 410 ? 'deleted' : 'error', erro: erroDaApi(e) };
  }
}
