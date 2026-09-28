/**
 * Página de Grupos (migration 088, 28/09/2026): mensagem para grupo e boas-vindas.
 *
 * **Só pelo QR Code.** A Groups API da Meta exige Conta Comercial Oficial (selo
 * verde) e para em 8 participantes; nenhum número nosso tem o selo. Quem está no
 * oficial recebe `ERRO_OFICIAL` e a tela explica.
 *
 * **Quem envia é o chip de quem criou.** A mensagem guarda `usuario_id` e sai pela
 * porta dele; o grupo tem que ser um grupo em que aquele chip está.
 *
 * **Toda execução mora no job** (`jobs/grupos-scheduler.ts`, instância 0): "enviar
 * agora" só põe `proxima_execucao = now()`. Assim uma rodada nunca corre duas vezes
 * em paralelo, e o intervalo entre grupos vale para tudo o que sai do chip.
 *
 * **Boas-vindas só dentro do grupo.** Mandar no privado de quem acabou de entrar é
 * primeiro contato por QR — o que a regra de 28/09 tirou do disparo e da cadência.
 */

import fs from 'fs';
import path from 'path';
import { query } from '../../config/database';
import { instancia } from '../whatsapp/canal/instancia';
import { ehPortaVirtual } from '../whatsapp/canal/contas';
import { isAdminEmpresa } from '../../shared/roles';
import { diasValidos, horaValida, montarBoasVindas, proximaRecorrencia, Entrante } from './agenda';

export const ERRO_OFICIAL =
  'Grupos pela API oficial da Meta exigem Conta Comercial Oficial (o selo verde) e aceitam até 8 participantes. '
  + 'O seu WhatsApp está no número oficial, que ainda não tem o selo — por isso os grupos ficam no QR Code.';
export const MAX_GRUPOS_POR_MENSAGEM = 50;
export const LIMITE_BOAS_VINDAS_POR_GRUPO = 1;

type Usuario = { userId: number; empresa_id: number; tipo_usuario?: string; nivel?: string };

export class ErroGrupos extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function portaDo(usuarioId: number): Promise<number | null> {
  const r = await query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [usuarioId]);
  const p = r.rows[0]?.whatsapp_porta;
  return p ? Number(p) : null;
}

/** Porta QR do usuário, ou erro que a tela mostra como está. */
async function portaQrDo(usuarioId: number): Promise<number> {
  const porta = await portaDo(usuarioId);
  if (!porta) throw new ErroGrupos('Conecte o seu WhatsApp por QR Code em WhatsApp para usar os grupos.', 409);
  if (ehPortaVirtual(porta)) throw new ErroGrupos(ERRO_OFICIAL, 409);
  return porta;
}

function erroDaInstancia(e: any): string {
  const s = e?.response?.status;
  if (s === 503 || e?.code === 'ECONNREFUSED') return 'O WhatsApp deste chip está desconectado. Reconecte em WhatsApp.';
  return e?.response?.data?.details || e?.response?.data?.error || e?.message || 'Falha ao falar com o WhatsApp';
}

// ─── Canal e grupos ───────────────────────────────────────────────────────────

export async function canal(usuarioId: number) {
  const porta = await portaDo(usuarioId);
  if (!porta) return { provedor: null as null, conectado: false };
  if (ehPortaVirtual(porta)) return { provedor: 'cloud_api' as const, conectado: true, aviso: ERRO_OFICIAL };
  try {
    const s = await instancia(porta).get('/status', { timeout: 5000 });
    return { provedor: 'baileys' as const, conectado: s.data?.status === 'connected', numero: s.data?.numero || null };
  } catch {
    return { provedor: 'baileys' as const, conectado: false };
  }
}

export interface GrupoWhatsApp {
  id: string;
  nome: string;
  participantes: number;
  soAdminsEnviam: boolean;
  souAdmin: boolean;
  descricao: string | null;
}

export async function listarGrupos(usuarioId: number): Promise<GrupoWhatsApp[]> {
  const porta = await portaQrDo(usuarioId);
  try {
    const r = await instancia(porta).get('/groups', { timeout: 30000 });
    return (r.data?.groups || [])
      .map((g: any) => ({
        id: g.id,
        nome: g.subject || '(sem nome)',
        participantes: g.participantCount || 0,
        soAdminsEnviam: !!g.announce,
        souAdmin: !!g.souAdmin,
        descricao: g.desc || null,
      }))
      .sort((a: GrupoWhatsApp, b: GrupoWhatsApp) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch (e) {
    throw new ErroGrupos(erroDaInstancia(e), 502);
  }
}

// ─── Mensagens para grupos ────────────────────────────────────────────────────

export interface EntradaMensagem {
  titulo?: string;
  texto?: string;
  media_url?: string | null;
  media_mimetype?: string | null;
  media_filename?: string | null;
  mencionar_todos?: boolean;
  grupos?: { id: string; nome?: string }[];
  modo?: 'agora' | 'agendada' | 'recorrente';
  agendado_para?: string | null;
  recorrencia?: { dias: number[]; hora: string } | null;
  intervalo_segundos?: number;
  ativa?: boolean;
}

function validar(e: EntradaMensagem, agora = new Date()) {
  const titulo = String(e.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroGrupos('Dê um nome para esta mensagem.');
  const texto = String(e.texto || '');
  if (!texto.trim() && !e.media_url) throw new ErroGrupos('Escreva a mensagem ou anexe um arquivo.');
  if (e.media_url && !/^\/uploads\/[\w./-]+$/.test(e.media_url)) throw new ErroGrupos('Arquivo inválido.');
  const grupos = (e.grupos || [])
    .filter((g) => typeof g?.id === 'string' && g.id.endsWith('@g.us'))
    .map((g) => ({ id: g.id, nome: String(g.nome || '').slice(0, 255) }));
  if (!grupos.length) throw new ErroGrupos('Escolha pelo menos um grupo.');
  if (grupos.length > MAX_GRUPOS_POR_MENSAGEM) throw new ErroGrupos(`No máximo ${MAX_GRUPOS_POR_MENSAGEM} grupos por mensagem.`);
  const intervalo = Math.min(600, Math.max(5, Math.round(Number(e.intervalo_segundos ?? 20))));

  const modo = e.modo;
  let proxima: Date | null = null;
  let agendado: Date | null = null;
  let recorrencia: { dias: number[]; hora: string } | null = null;
  if (modo === 'agora') {
    proxima = agora;
  } else if (modo === 'agendada') {
    agendado = e.agendado_para ? new Date(e.agendado_para) : null;
    if (!agendado || isNaN(agendado.getTime())) throw new ErroGrupos('Escolha a data e a hora do envio.');
    if (agendado.getTime() < agora.getTime() - 60_000) throw new ErroGrupos('A data do envio já passou.');
    proxima = agendado;
  } else if (modo === 'recorrente') {
    const dias = e.recorrencia?.dias;
    const hora = e.recorrencia?.hora;
    if (!diasValidos(dias)) throw new ErroGrupos('Escolha pelo menos um dia da semana.');
    if (!horaValida(hora)) throw new ErroGrupos('Escolha o horário (HH:MM).');
    recorrencia = { dias: [...new Set(dias)].sort(), hora };
    proxima = proximaRecorrencia(recorrencia.dias, hora, agora);
  } else {
    throw new ErroGrupos('Escolha quando enviar: agora, agendada ou recorrente.');
  }

  return {
    titulo, texto, grupos, intervalo, modo, agendado, recorrencia, proxima,
    media_url: e.media_url || null,
    media_mimetype: e.media_url ? String(e.media_mimetype || 'application/octet-stream').slice(0, 120) : null,
    media_filename: e.media_url ? String(e.media_filename || 'arquivo').slice(0, 255) : null,
    mencionar_todos: !!e.mencionar_todos,
  };
}

const SELECT_MENSAGEM = `
  SELECT m.*, u.nome AS usuario_nome,
         (SELECT count(*)::int FROM grupos_mensagens_envios x WHERE x.mensagem_id = m.id AND x.status = 'enviado') AS total_enviados,
         (SELECT count(*)::int FROM grupos_mensagens_envios x WHERE x.mensagem_id = m.id AND x.status = 'falhou') AS total_falhas
    FROM grupos_mensagens m JOIN usuarios u ON u.id = m.usuario_id`;

export async function listarMensagens(u: Usuario) {
  const r = await query(`${SELECT_MENSAGEM} WHERE m.empresa_id = $1 ORDER BY m.ativa DESC, m.proxima_execucao ASC NULLS LAST, m.created_at DESC`, [u.empresa_id]);
  return r.rows;
}

async function minha(u: Usuario, id: number) {
  const r = await query(`SELECT * FROM grupos_mensagens WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
  const m = r.rows[0];
  if (!m) throw new ErroGrupos('Mensagem não encontrada.', 404);
  if (m.usuario_id !== u.userId && !isAdminEmpresa(u as any)) {
    throw new ErroGrupos('Só quem criou esta mensagem, ou um administrador, pode mexer nela.', 403);
  }
  return m;
}

export async function criarMensagem(u: Usuario, e: EntradaMensagem) {
  await portaQrDo(u.userId);
  const v = validar(e);
  const r = await query(
    `INSERT INTO grupos_mensagens
       (empresa_id, usuario_id, titulo, texto, media_url, media_mimetype, media_filename, mencionar_todos,
        grupos, modo, agendado_para, recorrencia, proxima_execucao, intervalo_segundos, ativa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true) RETURNING id`,
    [u.empresa_id, u.userId, v.titulo, v.texto, v.media_url, v.media_mimetype, v.media_filename, v.mencionar_todos,
     JSON.stringify(v.grupos), v.modo, v.agendado, v.recorrencia ? JSON.stringify(v.recorrencia) : null, v.proxima, v.intervalo]
  );
  return r.rows[0];
}

export async function atualizarMensagem(u: Usuario, id: number, e: EntradaMensagem) {
  const atual = await minha(u, id);
  const v = validar({ ...e, modo: e.modo === 'agora' ? 'agora' : e.modo });
  await query(
    `UPDATE grupos_mensagens SET titulo=$3, texto=$4, media_url=$5, media_mimetype=$6, media_filename=$7,
            mencionar_todos=$8, grupos=$9, modo=$10, agendado_para=$11, recorrencia=$12,
            proxima_execucao = CASE WHEN ativa THEN $13::timestamptz ELSE NULL END,
            intervalo_segundos=$14, updated_at=now()
      WHERE id=$1 AND empresa_id=$2`,
    [atual.id, u.empresa_id, v.titulo, v.texto, v.media_url, v.media_mimetype, v.media_filename, v.mencionar_todos,
     JSON.stringify(v.grupos), v.modo, v.agendado, v.recorrencia ? JSON.stringify(v.recorrencia) : null, v.proxima, v.intervalo]
  );
}

/** Pausar/retomar. Retomar uma recorrente recalcula a próxima a partir de agora. */
export async function alternarMensagem(u: Usuario, id: number, ativa: boolean) {
  const m = await minha(u, id);
  let proxima: Date | null = null;
  if (ativa) {
    if (m.modo === 'recorrente' && m.recorrencia) proxima = proximaRecorrencia(m.recorrencia.dias, m.recorrencia.hora, new Date());
    else if (m.modo === 'agendada' && m.agendado_para && new Date(m.agendado_para) > new Date() && !m.ultima_execucao) proxima = new Date(m.agendado_para);
  }
  await query(`UPDATE grupos_mensagens SET ativa=$2, proxima_execucao=$3, updated_at=now() WHERE id=$1`, [m.id, ativa, proxima]);
}

/** "Enviar agora" de uma mensagem já salva — o job pega em até 1 minuto. */
export async function enviarAgora(u: Usuario, id: number) {
  const m = await minha(u, id);
  await portaQrDo(m.usuario_id);
  await query(`UPDATE grupos_mensagens SET proxima_execucao = now(), ativa = true, updated_at = now() WHERE id = $1`, [m.id]);
}

export async function excluirMensagem(u: Usuario, id: number) {
  const m = await minha(u, id);
  await query(`DELETE FROM grupos_mensagens WHERE id = $1`, [m.id]);
}

export async function enviosDa(u: Usuario, id: number) {
  await minha(u, id);
  const r = await query(
    `SELECT grupo_id, grupo_nome, execucao_em, status, erro, enviado_at
       FROM grupos_mensagens_envios WHERE mensagem_id = $1 ORDER BY enviado_at DESC LIMIT 300`,
    [id]
  );
  return r.rows;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enviarParaGrupo(porta: number, m: any, grupoId: string): Promise<string | null> {
  const api = instancia(porta);
  if (m.media_url) {
    const abs = path.join('/var/www/apps/gestao_financeira', String(m.media_url).replace(/^\//, ''));
    const base64 = (await fs.promises.readFile(abs)).toString('base64');
    const r = await api.post('/send-media', {
      number: grupoId, media: base64, mimetype: m.media_mimetype, filename: m.media_filename,
      caption: m.texto || undefined, mencionarTodos: m.mencionar_todos,
    }, { timeout: 120000 });
    // Áudio e documento não têm legenda: o texto vai logo depois, separado.
    if (m.texto?.trim() && !/^(image|video)\//.test(m.media_mimetype || '')) {
      await api.post('/send', { number: grupoId, message: m.texto, mencionarTodos: m.mencionar_todos }, { timeout: 30000 });
    }
    return r.data?.messageId || null;
  }
  const r = await api.post('/send', { number: grupoId, message: m.texto, mencionarTodos: m.mencionar_todos }, { timeout: 30000 });
  return r.data?.messageId || null;
}

/**
 * Uma rodada: todos os grupos da mensagem, um de cada vez, com o intervalo entre
 * eles. Chip fora do ar para a rodada inteira — cada grupo restante vira falha com
 * o motivo, em vez de 50 tentativas no mesmo problema.
 */
export async function executarRodada(m: any): Promise<{ enviados: number; falhas: number }> {
  const execucao = new Date();
  const grupos: { id: string; nome?: string }[] = m.grupos || [];
  let enviados = 0;
  let falhas = 0;
  let porta: number | null = null;
  let erroGeral: string | null = null;
  try {
    porta = await portaQrDo(m.usuario_id);
  } catch (e: any) {
    erroGeral = e.message;
  }

  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    let status: 'enviado' | 'falhou' = 'falhou';
    let erro: string | null = erroGeral;
    let messageId: string | null = null;
    if (!erroGeral && porta) {
      try {
        messageId = await enviarParaGrupo(porta, m, g.id);
        status = 'enviado';
        erro = null;
      } catch (e: any) {
        erro = erroDaInstancia(e);
        if (e?.response?.status === 503 || e?.code === 'ECONNREFUSED') erroGeral = erro;
      }
    }
    await query(
      `INSERT INTO grupos_mensagens_envios (mensagem_id, empresa_id, grupo_id, grupo_nome, execucao_em, status, erro, whatsapp_message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, m.empresa_id, g.id, g.nome || null, execucao, status, erro, messageId]
    );
    if (status === 'enviado') enviados++; else falhas++;
    if (status === 'enviado' && i < grupos.length - 1) await espera((m.intervalo_segundos || 20) * 1000);
  }
  return { enviados, falhas };
}

/**
 * Pega uma mensagem vencida por vez e já troca a `proxima_execucao` no mesmo
 * UPDATE: a recorrente sai com a próxima data marcada, a de uma vez com NULL. Um chip por vez — `ocupados` é do processo, e o job só roda na
 * instância 0.
 */
export async function proximaVencida(ocupados: Set<number>): Promise<any | null> {
  const r = await query(
    `SELECT * FROM grupos_mensagens
      WHERE ativa AND proxima_execucao IS NOT NULL AND proxima_execucao <= now()
        AND NOT (usuario_id = ANY($1::int[]))
      ORDER BY proxima_execucao LIMIT 1`,
    [[...ocupados]]
  );
  const m = r.rows[0];
  if (!m) return null;
  const seguinte = m.modo === 'recorrente' && m.recorrencia
    ? proximaRecorrencia(m.recorrencia.dias, m.recorrencia.hora, new Date())
    : null;
  // A guarda é "ainda vencida", não igualdade com o valor lido: o Postgres guarda
  // microssegundos e o Date do JS só milissegundos — `proxima_execucao = $2` nunca
  // casava com um "enviar agora" (now()) e a mensagem ficava na fila para sempre.
  const c = await query(
    `UPDATE grupos_mensagens SET proxima_execucao = $2, ultima_execucao = now(), updated_at = now()
      WHERE id = $1 AND ativa AND proxima_execucao IS NOT NULL AND proxima_execucao <= now() RETURNING *`,
    [m.id, seguinte]
  );
  return c.rows[0] || null;
}

// ─── Boas-vindas ──────────────────────────────────────────────────────────────

export async function listarBoasVindas(u: Usuario) {
  const r = await query(
    `SELECT ag.id, ag.usuario_id, u.nome AS usuario_nome, ag.grupo_whatsapp_id, ag.grupo_nome, ag.mensagem,
            ag.ativa, ag.delay_segundos, ag.mencionar, ag.total_disparos, ag.ultimo_disparo_at
       FROM automacoes_grupo ag JOIN usuarios u ON u.id = ag.usuario_id
      WHERE ag.empresa_id = $1 AND ag.enviar_para = 'grupo'
      ORDER BY ag.ativa DESC, ag.grupo_nome`,
    [u.empresa_id]
  );
  return r.rows;
}

export interface EntradaBoasVindas {
  grupo_id?: string;
  grupo_nome?: string;
  mensagem?: string;
  delay_segundos?: number;
  mencionar?: boolean;
  ativa?: boolean;
}

function validarBoasVindas(e: EntradaBoasVindas) {
  const mensagem = String(e.mensagem || '').trim();
  if (!mensagem) throw new ErroGrupos('Escreva a mensagem de boas-vindas.');
  if (mensagem.length > 4000) throw new ErroGrupos('A mensagem pode ter no máximo 4.000 caracteres.');
  const delay = Math.min(3600, Math.max(0, Math.round(Number(e.delay_segundos ?? 60))));
  return { mensagem, delay, mencionar: e.mencionar !== false, ativa: e.ativa !== false };
}

export async function salvarBoasVindas(u: Usuario, e: EntradaBoasVindas, id?: number) {
  const v = validarBoasVindas(e);
  if (id) {
    const r = await query(`SELECT * FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
    const a = r.rows[0];
    if (!a) throw new ErroGrupos('Boas-vindas não encontrada.', 404);
    if (a.usuario_id !== u.userId && !isAdminEmpresa(u as any)) throw new ErroGrupos('Só quem criou, ou um administrador, pode mexer nela.', 403);
    await query(
      `UPDATE automacoes_grupo SET mensagem=$2, delay_segundos=$3, mencionar=$4, ativa=$5, updated_at=now() WHERE id=$1`,
      [id, v.mensagem, v.delay, v.mencionar, v.ativa]
    );
    return { id };
  }
  await portaQrDo(u.userId);
  const grupoId = String(e.grupo_id || '');
  if (!grupoId.endsWith('@g.us')) throw new ErroGrupos('Escolha o grupo.');
  const existe = await query(
    `SELECT 1 FROM automacoes_grupo WHERE empresa_id = $1 AND usuario_id = $2 AND grupo_whatsapp_id = $3 AND enviar_para = 'grupo'`,
    [u.empresa_id, u.userId, grupoId]
  );
  if (existe.rows.length >= LIMITE_BOAS_VINDAS_POR_GRUPO) throw new ErroGrupos('Este grupo já tem boas-vindas. Edite a que existe.');
  const nome = String(e.grupo_nome || '').slice(0, 255) || null;
  const r = await query(
    `INSERT INTO automacoes_grupo (empresa_id, usuario_id, nome, grupo_whatsapp_id, grupo_nome, mensagem, ativa,
                                   trigger_tipo, delay_segundos, enviar_para, mencionar)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'novo_participante',$8,'grupo',$9) RETURNING id`,
    [u.empresa_id, u.userId, `Boas-vindas · ${nome || grupoId}`.slice(0, 200), grupoId, nome, v.mensagem, v.ativa, v.delay, v.mencionar]
  );
  return r.rows[0];
}

export async function excluirBoasVindas(u: Usuario, id: number) {
  const r = await query(`SELECT usuario_id FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
  if (!r.rows[0]) throw new ErroGrupos('Boas-vindas não encontrada.', 404);
  if (r.rows[0].usuario_id !== u.userId && !isAdminEmpresa(u as any)) throw new ErroGrupos('Só quem criou, ou um administrador, pode excluir.', 403);
  await query(`DELETE FROM automacoes_grupo WHERE id = $1`, [id]);
}

/**
 * Evento da instância: gente entrou num grupo. Vale só a boas-vindas do DONO da
 * porta que viu a entrada — dois chips nossos no mesmo grupo não dão duas
 * boas-vindas. Entra na fila com o atraso configurado; repetir o evento não
 * duplica (índice único do pendente).
 */
export async function registrarEntradas(donoId: number, empresaId: number, grupoId: string, participantes: any[]) {
  const auto = await query(
    `SELECT id, delay_segundos FROM automacoes_grupo
      WHERE empresa_id = $1 AND usuario_id = $2 AND grupo_whatsapp_id = $3 AND ativa AND enviar_para = 'grupo'`,
    [empresaId, donoId, grupoId]
  );
  let n = 0;
  for (const a of auto.rows) {
    for (const p of participantes || []) {
      const jid = String(p?.jid || '');
      if (!/@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) continue;
      const r = await query(
        `INSERT INTO grupos_boas_vindas_fila (automacao_id, empresa_id, grupo_id, participante_jid, participante_nome, enviar_em)
         VALUES ($1,$2,$3,$4,$5, now() + make_interval(secs => $6))
         ON CONFLICT DO NOTHING`,
        [a.id, empresaId, grupoId, jid.replace(/@c\.us$/, '@s.whatsapp.net'), p?.nome ? String(p.nome).slice(0, 255) : null, a.delay_segundos || 0]
      );
      n += r.rowCount ?? 0;
    }
  }
  return n;
}

/**
 * Processa a fila: por automação, TODOS os pendentes vencidos viram uma mensagem
 * só. O nome que a instância não sabia vem do contato da empresa, se houver.
 */
export async function processarBoasVindas(): Promise<number> {
  const venc = await query(
    `SELECT DISTINCT automacao_id FROM grupos_boas_vindas_fila WHERE status = 'pendente' AND enviar_em <= now()`
  );
  let mensagens = 0;
  for (const { automacao_id } of venc.rows) {
    const itens = await query(
      `UPDATE grupos_boas_vindas_fila SET status = 'enviado', processado_em = now()
        WHERE automacao_id = $1 AND status = 'pendente' AND enviar_em <= now()
        RETURNING id, participante_jid, participante_nome, empresa_id`,
      [automacao_id]
    );
    if (!itens.rows.length) continue;
    const a = (await query(
      `SELECT ag.*, u.whatsapp_porta FROM automacoes_grupo ag JOIN usuarios u ON u.id = ag.usuario_id WHERE ag.id = $1`,
      [automacao_id]
    )).rows[0];
    const ids = itens.rows.map((r: any) => r.id);
    const falhar = (erro: string) =>
      query(`UPDATE grupos_boas_vindas_fila SET status = 'falhou', erro = $2 WHERE id = ANY($1::int[])`, [ids, erro]);
    if (!a || !a.ativa) { await falhar('Boas-vindas desligada antes do envio'); continue; }
    if (!a.whatsapp_porta || ehPortaVirtual(a.whatsapp_porta)) { await falhar('O chip de quem criou não está no QR Code'); continue; }

    const entrantes: Entrante[] = [];
    for (const r of itens.rows) {
      let nome = r.participante_nome;
      if (!nome) {
        const numero = String(r.participante_jid).replace(/@.*$/, '');
        const c = await query(
          `SELECT nome FROM contatos_whatsapp WHERE empresa_id = $1 AND numero = $2 AND NOT coalesce(is_grupo, false)
            AND nome ~ '[A-Za-zÀ-ÿ]' LIMIT 1`,
          [a.empresa_id, numero]
        ).catch(() => ({ rows: [] as any[] }));
        nome = c.rows[0]?.nome || null;
      }
      entrantes.push({ jid: r.participante_jid, nome });
    }
    const { texto, mencoes } = montarBoasVindas(a.mensagem, entrantes, a.grupo_nome, a.mencionar);
    try {
      await instancia(a.whatsapp_porta).post('/send', { number: a.grupo_whatsapp_id, message: texto, mentions: mencoes }, { timeout: 30000 });
      await query(
        `UPDATE automacoes_grupo SET total_disparos = total_disparos + $2, ultimo_disparo_at = now() WHERE id = $1`,
        [a.id, entrantes.length]
      );
      mensagens++;
    } catch (e: any) {
      await falhar(erroDaInstancia(e));
    }
  }
  return mensagens;
}
