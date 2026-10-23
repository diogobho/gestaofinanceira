/**
 * Monitoramento de sites (migration 102, 06/10/2026). Pedido do dono: avisar no WhatsApp
 * quando abrir vaga na agenda do CadÚnico de Caucaia (agendacadcaucaiace.com.br).
 *
 * **Regra de leitura:** o site está FECHADO enquanto a página contiver algum dos
 * `textos_fechado` ("AGUARDANDO LIBERAR NOVAS VAGAS", "VAGAS INDISPONÍVEIS"); sumiram
 * todos = ABERTO. Comparação sem acento e sem caixa. Página fora do ar ou vazia é ERRO e
 * não muda o estado — senão uma queda do site viraria "abriu vaga".
 *
 * **Aviso:** só na troca de estado (fechado → aberto; aberto → fechado se
 * `avisar_fechamento`). Sai pelo WhatsApp do `remetente_id` — hoje o oficial
 * 11 94052-4435 (usuário 12). No oficial, fora da janela de 24h só modelo aprovado: o
 * texto livre vai quando a janela está aberta, senão o modelo `MODELO_AVISO`.
 *
 * Só a conta master@gestao.com vê e mexe (`EMAILS_PERMITIDOS`).
 */
import axios from 'axios';
import { query } from '../../config/database';
import { contatosService } from '../crm/contatos/contatos.service';
import { contaAtivaDoUsuario } from '../whatsapp/canal/contas';
import { estadoJanela } from '../whatsapp/canal/janela';

export const EMAILS_PERMITIDOS = ['master@gestao.com'];
/** Modelo UTILITY na WABA da DuoFuturo: "Aviso do monitoramento de sites: {{1}}. Confira o site {{2}} e garanta o seu horário." */
export const MODELO_AVISO = 'aviso_monitoramento_site';

export class ErroMonitor extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type Estado = 'aberto' | 'fechado';

/** Sem acento, maiúsculo e com espaço único — a página e os textos passam pelo mesmo crivo. */
export function normalizar(t: string): string {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Texto visível do HTML: sem script, style e comentário (o site guarda aviso antigo em `<!-- -->`). */
export function textoDoHtml(html: string): string {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Pura, para teste: qual estado a página mostra, e qual texto de "fechado" achou. */
export function avaliar(html: string, textosFechado: string[]): { estado: Estado; achado: string | null } {
  const pagina = normalizar(textoDoHtml(html));
  const achado = textosFechado.find((t) => normalizar(t) && pagina.includes(normalizar(t))) ?? null;
  return { estado: achado ? 'fechado' : 'aberto', achado };
}

export async function lerSite(url: string, textosFechado: string[]) {
  const r = await axios.get(url, {
    timeout: 25_000,
    maxRedirects: 5,
    responseType: 'text',
    headers: { 'User-Agent': 'Mozilla/5.0 (DuoFuturo monitor)', 'Cache-Control': 'no-cache' },
    validateStatus: () => true,
  });
  if (r.status >= 400) throw new Error(`O site respondeu ${r.status}`);
  const html = String(r.data || '');
  // Página quase vazia (manutenção, página de erro do provedor) não diz nada sobre vaga.
  if (normalizar(textoDoHtml(html)).length < 200) throw new Error('O site respondeu uma página vazia');
  return avaliar(html, textosFechado);
}

// ─── Envio ───────────────────────────────────────────────────────────────────

async function enviarAviso(m: any, frase: string): Promise<void> {
  const empresa = (await query(`SELECT empresa_id FROM usuarios WHERE id = $1`, [m.remetente_id])).rows[0]?.empresa_id;
  if (!empresa) throw new Error('Remetente não encontrado');
  const contato = await contatosService.findOrCreateByNumero(m.destino, m.remetente_id, empresa);
  const conta = await contaAtivaDoUsuario(m.remetente_id, empresa);
  const precisaModelo = !!conta && !(await estadoJanela(empresa, contato.whatsapp_id || contato.numero)).aberta;

  const r = precisaModelo
    ? await contatosService.enviarModeloWhatsApp(m.remetente_id, empresa, contato.id,
        { nome: MODELO_AVISO, idioma: 'pt_BR', valores: { corpo: [frase, m.url] } }, undefined, 'lembrete')
    : await contatosService.enviarMensagem(m.remetente_id, empresa, contato.id,
        `🔔 *${m.nome}*\n\n${frase}.\n\nConfira em ${m.url}`, undefined, 'lembrete');
  if (!r.success) throw new Error(r.error || 'Falha no envio');
}

// ─── Verificação ──────────────────────────────────────────────────────────────

/**
 * Lê o site e, se o estado mudou, avisa. `avisar = false` é o "Verificar agora" da tela:
 * grava o estado sem mandar mensagem.
 */
export async function verificar(m: any, avisar = true) {
  let leitura: { estado: Estado; achado: string | null };
  try {
    leitura = await lerSite(m.url, m.textos_fechado || []);
  } catch (e: any) {
    const erro = e?.code === 'ECONNABORTED' ? 'O site não respondeu a tempo' : (e?.message || 'Falha ao ler o site');
    await query(
      `UPDATE monitor_sites SET ultimo_check_at = now(), ultimo_erro = $2, erros_seguidos = erros_seguidos + 1 WHERE id = $1`,
      [m.id, erro]
    );
    return { estado: m.estado as Estado | null, erro };
  }

  const mudou = m.estado !== leitura.estado;
  await query(
    `UPDATE monitor_sites SET ultimo_check_at = now(), ultimo_erro = NULL, erros_seguidos = 0,
            estado = $2, estado_desde = CASE WHEN $3 THEN now() ELSE estado_desde END
      WHERE id = $1`,
    [m.id, leitura.estado, mudou]
  );

  // Primeira leitura "fechado" não avisa (é o normal); primeira leitura "aberto" avisa.
  const frase = leitura.estado === 'aberto'
    ? (m.estado === null ? 'o site está com vagas abertas agora' : 'abriram vagas na agenda')
    : 'as vagas fecharam de novo';
  const deveAvisar = avisar && mudou && (leitura.estado === 'aberto' || (m.estado !== null && m.avisar_fechamento));
  let avisoErro: string | null = null;
  if (deveAvisar) {
    try {
      await enviarAviso(m, frase);
    } catch (e: any) {
      avisoErro = e?.message || 'Falha no envio';
    }
    await query(`UPDATE monitor_sites SET ultimo_aviso_at = now(), ultimo_aviso_erro = $2 WHERE id = $1`, [m.id, avisoErro]);
    console.log(`[MonitorSites] #${m.id} ${m.nome}: ${m.estado ?? '—'} → ${leitura.estado}; aviso ${avisoErro ? `FALHOU: ${avisoErro}` : 'enviado'}`);
  }
  return { estado: leitura.estado, achado: leitura.achado, mudou, avisado: deveAvisar && !avisoErro, avisoErro };
}

/** Job: os ativos cujo intervalo venceu. */
export async function verificarDevidos(): Promise<void> {
  const r = await query(
    `SELECT * FROM monitor_sites
      WHERE ativo AND (ultimo_check_at IS NULL OR ultimo_check_at <= now() - make_interval(mins => intervalo_min) + interval '20 seconds')`
  );
  for (const m of r.rows) {
    await verificar(m).catch((e) => console.error(`[MonitorSites] #${m.id}:`, e?.message || e));
  }
}

// ─── CRUD (tela) ──────────────────────────────────────────────────────────────

export function exigirPermitido(email?: string) {
  if (!email || !EMAILS_PERMITIDOS.includes(email.toLowerCase())) throw new ErroMonitor('Acesso restrito', 403);
}

export async function listar() {
  return (await query(`SELECT * FROM monitor_sites ORDER BY id`)).rows;
}

async function obter(id: number) {
  const m = (await query(`SELECT * FROM monitor_sites WHERE id = $1`, [id])).rows[0];
  if (!m) throw new ErroMonitor('Monitoramento não encontrado', 404);
  return m;
}

function validar(d: any) {
  const nome = String(d.nome || '').trim().slice(0, 120);
  const url = String(d.url || '').trim();
  if (!nome) throw new ErroMonitor('Dê um nome ao monitoramento');
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new ErroMonitor('Informe o endereço completo do site, com https://');
  const textos = (Array.isArray(d.textos_fechado) ? d.textos_fechado : String(d.textos_fechado || '').split('\n'))
    .map((t: any) => String(t).trim()).filter(Boolean).slice(0, 20);
  if (!textos.length) throw new ErroMonitor('Informe ao menos um texto que aparece quando NÃO há vaga');
  const destino = String(d.destino || '').replace(/\D/g, '');
  if (destino.length < 12 || destino.length > 13) throw new ErroMonitor('Número de destino com DDI e DDD, ex.: 5524988344048');
  const intervalo = Math.round(Number(d.intervalo_min) || 3);
  if (intervalo < 1 || intervalo > 1440) throw new ErroMonitor('Intervalo entre 1 e 1440 minutos');
  return { nome, url, textos, destino, intervalo, avisar_fechamento: d.avisar_fechamento !== false, ativo: d.ativo !== false };
}

export async function criar(d: any, remetenteId: number) {
  const v = validar(d);
  const r = await query(
    `INSERT INTO monitor_sites (nome, url, textos_fechado, destino, remetente_id, intervalo_min, avisar_fechamento, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [v.nome, v.url, v.textos, v.destino, remetenteId, v.intervalo, v.avisar_fechamento, v.ativo]
  );
  return r.rows[0];
}

export async function atualizar(id: number, d: any) {
  const atual = await obter(id);
  const v = validar(d);
  // Trocou o site ou a regra: o estado antigo não vale mais (a próxima leitura é a primeira).
  const zera = atual.url !== v.url || JSON.stringify(atual.textos_fechado) !== JSON.stringify(v.textos);
  const r = await query(
    `UPDATE monitor_sites SET nome=$2, url=$3, textos_fechado=$4, destino=$5, intervalo_min=$6, avisar_fechamento=$7, ativo=$8,
            estado = CASE WHEN $9 THEN NULL ELSE estado END, estado_desde = CASE WHEN $9 THEN NULL ELSE estado_desde END
      WHERE id=$1 RETURNING *`,
    [id, v.nome, v.url, v.textos, v.destino, v.intervalo, v.avisar_fechamento, v.ativo, zera]
  );
  return r.rows[0];
}

export async function excluir(id: number) {
  await obter(id);
  await query(`DELETE FROM monitor_sites WHERE id = $1`, [id]);
  return { success: true };
}

export async function verificarAgora(id: number) {
  return verificar(await obter(id), false);
}

export async function testarAviso(id: number) {
  const m = await obter(id);
  try {
    await enviarAviso(m, 'mensagem de teste — o aviso está funcionando');
  } catch (e: any) {
    throw new ErroMonitor(e?.message || 'Falha no envio', 502);
  }
  return { success: true };
}
