/**
 * Página de Grupos (migration 088, 28/09/2026): mensagem para grupo e boas-vindas.
 *
 * **Só pelo QR Code.** A Groups API da Meta exige Conta Comercial Oficial (selo
 * verde) e para em 8 participantes; nenhum número nosso tem o selo. Quem está no
 * oficial (Enterprise) conecta aqui um segundo WhatsApp por QR, o **chip de Grupos**
 * (101, `whatsapp_chip_grupos`), que serve só a esta página — `portaDo` devolve a
 * porta dele, e o webhook dessa porta só processa entrada e saída de grupo.
 *
 * **Quem envia é o chip de quem criou.** A mensagem guarda `usuario_id` e sai pela
 * porta dele; o grupo tem que ser um grupo em que aquele chip está.
 *
 * **Toda execução mora no job** (`jobs/grupos-scheduler.ts`, instância 0): "enviar
 * agora" só põe `proxima_execucao = now()`. Assim uma rodada nunca corre duas vezes
 * em paralelo, e o intervalo entre grupos vale para tudo o que sai do chip.
 *
 * **Boas-vindas no grupo ou no privado** (30/09/2026). Até aqui era só no grupo: o
 * privado de quem acabou de entrar é primeiro contato por QR, o que a regra de 28/09
 * tirou do disparo e da cadência. O dono pediu o privado sabendo do risco, e ele vem
 * com travas (`processarBoasVindasPrivado`): espera aleatória de 1–5 min além da
 * configurada, no máximo 1 mensagem por chip por minuto, só das 08h às 21h de
 * Brasília e teto de `TETO_PRIVADO_POR_CHIP_DIA` por chip — o que passa do teto, o
 * participante sem número (`@lid`) e quem não tem WhatsApp recebem no GRUPO.
 */

import fs from 'fs';
import path from 'path';
import { query } from '../../config/database';
import { instancia } from '../whatsapp/canal/instancia';
import { ehPortaVirtual, PORTA_VIRTUAL_MINIMA } from '../whatsapp/canal/contas';
import { isAdminEmpresa } from '../../shared/roles';
import { diasValidos, horaValida, montarBoasVindas, proximaRecorrencia, Entrante } from './agenda';
import { aplicarVariacoes } from './campanhas-regras';
import { aplicarMencoes, normalizarMencoes, Mencao, Participante } from './mencoes';
import { contatosService } from '../crm/contatos/contatos.service';
import { chaveTelefone, variantesTelefone } from '../crm/_shared/telefone';
import { leadsService } from '../crm/leads/leads.service';

export const ERRO_OFICIAL =
  'Grupos pela API oficial da Meta exigem Conta Comercial Oficial (o selo verde) e aceitam até 8 participantes. '
  + 'O seu WhatsApp está no número oficial, que ainda não tem o selo — por isso os grupos ficam no QR Code.';
export const MAX_GRUPOS_POR_MENSAGEM = 50;
export const LIMITE_BOAS_VINDAS_POR_GRUPO = 1;
/** Boas-vindas no privado por chip por dia (Brasília). O que passar vai no grupo. */
export const TETO_PRIVADO_POR_CHIP_DIA = 40;
/** Janela das boas-vindas no privado, horas de Brasília [início, fim). */
export const JANELA_PRIVADO = [8, 21] as const;
/** Marca, em `grupos_boas_vindas_fila.erro`, o item de boas-vindas no privado que saiu no grupo. */
export const PREFIXO_NO_GRUPO = 'no grupo: ';

type Destino = 'grupo' | 'privado';
const destinoDoBanco = (v: string): Destino => (v === 'dm_participante' ? 'privado' : 'grupo');

type Usuario = { userId: number; empresa_id: number; tipo_usuario?: string; nivel?: string };

export class ErroGrupos extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/**
 * Porta que os grupos usam, em SQL: a do próprio usuário se ele está no QR; se está
 * no oficial, a do chip de Grupos (101), ou NULL. Exige `LEFT JOIN whatsapp_chip_grupos cg
 * ON cg.usuario_id = u.id`.
 */
export const SQL_PORTA_GRUPOS =
  `CASE WHEN u.whatsapp_porta < ${PORTA_VIRTUAL_MINIMA} THEN u.whatsapp_porta ELSE cg.porta END`;

/**
 * Porta do usuário para os grupos. Quem está no oficial e tem chip de Grupos recebe a
 * porta do chip; quem está no oficial sem chip recebe a porta virtual (a tela oferece
 * conectar um) — é o que `portaQrDo` transforma em erro.
 */
export async function portaDo(usuarioId: number): Promise<number | null> {
  const r = await query(
    `SELECT u.whatsapp_porta, cg.porta AS chip FROM usuarios u
       LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id WHERE u.id = $1`,
    [usuarioId]
  );
  const p = r.rows[0]?.whatsapp_porta;
  if (p && ehPortaVirtual(p) && r.rows[0].chip) return Number(r.rows[0].chip);
  return p ? Number(p) : null;
}

/** Porta QR do usuário, ou erro que a tela mostra como está. */
export async function portaQrDo(usuarioId: number): Promise<number> {
  const porta = await portaDo(usuarioId);
  if (!porta) throw new ErroGrupos('Conecte o seu WhatsApp por QR Code em WhatsApp para usar os grupos.', 409);
  if (ehPortaVirtual(porta)) throw new ErroGrupos('Conecte um WhatsApp por QR Code nesta página para usar os grupos.', 409);
  return porta;
}

export function erroDaInstancia(e: any): string {
  const s = e?.response?.status;
  if (s === 503 || e?.code === 'ECONNREFUSED') return 'O WhatsApp deste chip está desconectado. Reconecte em WhatsApp.';
  // Rota que a instância não conhece = chip rodando uma versão anterior do
  // api-multi-baileys.js (falta `pm2 restart whatsapp-<porta>`). Sem isto a tela dizia só "404".
  if (s === 404 && /Cannot (GET|POST)/i.test(String(e?.response?.data || ''))) {
    return 'Este WhatsApp está com uma versão antiga da conexão e ainda não tem esta função. Peça à equipe DuoFuturo para atualizá-lo.';
  }
  return e?.response?.data?.details || e?.response?.data?.error || e?.message || 'Falha ao falar com o WhatsApp';
}

// ─── Canal e grupos ───────────────────────────────────────────────────────────

export async function canal(usuarioId: number) {
  const porta = await portaDo(usuarioId);
  if (!porta) return { provedor: null as null, conectado: false };
  // No oficial e sem chip de Grupos: a tela oferece conectar um por QR.
  if (ehPortaVirtual(porta)) return { provedor: 'cloud_api' as const, conectado: false, aviso: ERRO_OFICIAL };
  const chipDeGrupos = (await query(`SELECT 1 FROM whatsapp_chip_grupos WHERE usuario_id = $1 AND porta = $2`, [usuarioId, porta])).rowCount! > 0;
  try {
    const s = await instancia(porta).get('/status', { timeout: 5000 });
    return {
      provedor: 'baileys' as const, chipDeGrupos, conectado: s.data?.status === 'connected', numero: s.data?.numero || null,
      temQr: !!s.data?.hasQrCode,
    };
  } catch {
    return { provedor: 'baileys' as const, chipDeGrupos, conectado: false, temQr: false };
  }
}

// ─── Chip de Grupos (101) ─────────────────────────────────────────────────────

/** Porta do chip de Grupos de quem está no oficial; null para quem não tem um. */
async function portaDoChipDeGrupos(usuarioId: number): Promise<number | null> {
  const r = await query(`SELECT porta FROM whatsapp_chip_grupos WHERE usuario_id = $1`, [usuarioId]);
  return r.rows[0] ? Number(r.rows[0].porta) : null;
}

/** Sobe (ou religa) a instância do chip de Grupos. A tela mostra o QR em seguida. */
export async function ativarChipDeGrupos(usuarioId: number) {
  const atual = await portaDo(usuarioId);
  if (atual && !ehPortaVirtual(atual) && !(await portaDoChipDeGrupos(usuarioId))) {
    throw new ErroGrupos('O seu WhatsApp já está no QR Code — os grupos usam ele.', 409);
  }
  const { whatsappProvisionService } = await import('../../services/whatsapp-provision.service');
  try {
    return { success: true, porta: await whatsappProvisionService.garantirChipDeGrupos(usuarioId) };
  } catch (e: any) {
    throw new ErroGrupos(e?.message || 'Não foi possível preparar o QR Code agora.', 503);
  }
}

export async function qrDoChipDeGrupos(usuarioId: number): Promise<Buffer | null> {
  const porta = await portaDoChipDeGrupos(usuarioId);
  if (!porta) return null;
  const r = await instancia(porta).get('/qr-image', { timeout: 5000, responseType: 'arraybuffer' });
  return Buffer.from(r.data);
}

/** Desconecta o número do chip (logout). A porta continua reservada para conectar outro. */
export async function desconectarChipDeGrupos(usuarioId: number) {
  const porta = await portaDoChipDeGrupos(usuarioId);
  if (!porta) throw new ErroGrupos('Não há WhatsApp de grupos conectado.', 404);
  try {
    await instancia(porta).post('/logout', {}, { timeout: 10000 });
  } catch (e) {
    throw new ErroGrupos(erroDaInstancia(e), 502);
  }
  return { success: true };
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
  /** Mensagem de campanha (089): vai para os grupos ativos da campanha na hora do envio. */
  campanha_id?: number | null;
  /** Botão de link (091). Nulo ou texto vazio = sem botão. */
  botao?: { texto?: string; url?: string } | null;
  /** Pessoas marcadas com @ (092) — ver `mencoes.ts`. */
  mencoes?: Mencao[] | null;
  /** Enquete (#265, #295): sai depois do texto/anexo, se houver. Nula = sem enquete. */
  enquete?: { pergunta?: string; opcoes?: string[] } | null;
}

/** Limites do WhatsApp para enquete: 2 a 12 opções; textos curtos. */
export const MAX_OPCOES_ENQUETE = 12;

/** Enquete da mensagem, ou null. Opção repetida conta uma vez só (o WhatsApp recusa iguais). */
export function normalizarEnquete(e: EntradaMensagem['enquete']): { pergunta: string; opcoes: string[] } | null {
  if (!e) return null;
  const pergunta = String(e.pergunta || '').trim();
  const opcoes = [...new Set((Array.isArray(e.opcoes) ? e.opcoes : []).map((o) => String(o || '').trim()).filter(Boolean))];
  if (!pergunta && !opcoes.length) return null;
  if (!pergunta) throw new ErroGrupos('Escreva a pergunta da enquete.');
  if (pergunta.length > 255) throw new ErroGrupos('A pergunta da enquete tem no máximo 255 caracteres.');
  if (opcoes.length < 2) throw new ErroGrupos('A enquete precisa de pelo menos duas opções diferentes.');
  if (opcoes.length > MAX_OPCOES_ENQUETE) throw new ErroGrupos(`A enquete tem no máximo ${MAX_OPCOES_ENQUETE} opções.`);
  if (opcoes.some((o) => o.length > 100)) throw new ErroGrupos('Cada opção da enquete tem no máximo 100 caracteres.');
  return { pergunta, opcoes };
}

/** Limite do texto do botão — o da Meta para `cta_url`; mais que isso o WhatsApp corta. */
export const MAX_TEXTO_BOTAO = 20;

/** Botão da mensagem, ou null. Link sem http(s) seria um botão que não abre nada. */
export function normalizarBotao(b: EntradaMensagem['botao'], texto: string): { texto: string; url: string } | null {
  const rotulo = String(b?.texto || '').trim();
  const url = String(b?.url || '').trim();
  if (!rotulo && !url) return null;
  if (!rotulo) throw new ErroGrupos('Escreva o texto do botão.');
  if (rotulo.length > MAX_TEXTO_BOTAO) throw new ErroGrupos(`O texto do botão tem no máximo ${MAX_TEXTO_BOTAO} caracteres.`);
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url) || url.length > 500) throw new ErroGrupos('O link do botão precisa começar com https:// e não pode ter espaços.');
  if (!texto.trim()) throw new ErroGrupos('Mensagem com botão precisa de texto.');
  return { texto: rotulo, url };
}

/**
 * Texto que acompanha o botão: o link vai também no corpo, porque o botão por QR não
 * é recurso oficial e o WhatsApp pode deixar de desenhá-lo — o link no texto é o que
 * garante que a pessoa chega lá de qualquer jeito.
 */
export function textoComLink(texto: string, url: string): string {
  return texto.includes(url) ? texto : `${texto.trimEnd()}\n\n👉 ${url}`;
}

let tabelaBotaoPronta: Promise<unknown> | null = null;
/**
 * As tabelas do botão (091), das menções (092) e do "levar para o CRM" (093) são do gestao_user — a API cria na
 * primeira vez que precisa. `grupos_mensagens` é do postgres e não ganha coluna.
 */
export function garantirTabelaBotao() {
  tabelaBotaoPronta ??= query(
    `CREATE TABLE IF NOT EXISTS grupos_mensagens_botao (
       mensagem_id INTEGER PRIMARY KEY, texto VARCHAR(25) NOT NULL, url VARCHAR(500) NOT NULL);
     CREATE TABLE IF NOT EXISTS grupos_mensagens_mencoes (
       mensagem_id INTEGER PRIMARY KEY, mencoes JSONB NOT NULL);
     CREATE TABLE IF NOT EXISTS grupos_mensagens_enquete (
       mensagem_id INTEGER PRIMARY KEY, pergunta VARCHAR(255) NOT NULL, opcoes JSONB NOT NULL);
     CREATE TABLE IF NOT EXISTS grupos_boas_vindas_mencoes (
       automacao_id INTEGER PRIMARY KEY, mencoes JSONB NOT NULL);
     CREATE TABLE IF NOT EXISTS grupos_crm_lead (
       usuario_id INTEGER NOT NULL, grupo_id VARCHAR(100) NOT NULL, empresa_id INTEGER NOT NULL,
       grupo_nome VARCHAR(255), funil_id INTEGER NOT NULL, estagio_id INTEGER, responsavel_id INTEGER,
       origem VARCHAR(50), ativa BOOLEAN NOT NULL DEFAULT true,
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (usuario_id, grupo_id));
     ALTER TABLE grupos_crm_lead ADD COLUMN IF NOT EXISTS distribuir_entre INTEGER[];
     ALTER TABLE grupos_crm_lead ADD COLUMN IF NOT EXISTS rodizio_pos INTEGER NOT NULL DEFAULT 0;
     CREATE TABLE IF NOT EXISTS grupos_boas_vindas_distribuir (
       automacao_id INTEGER PRIMARY KEY, usuarios INTEGER[] NOT NULL, pos INTEGER NOT NULL DEFAULT 0);
     CREATE TABLE IF NOT EXISTS grupos_boas_vindas_remetente (
       fila_id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL);
     CREATE INDEX IF NOT EXISTS idx_gbv_remetente_usuario ON grupos_boas_vindas_remetente (usuario_id)`
  ).catch((e) => { tabelaBotaoPronta = null; throw e; });
  return tabelaBotaoPronta;
}

async function salvarMencoes(mensagemId: number, mencoes: Mencao[]) {
  await garantirTabelaBotao();
  await query(`DELETE FROM grupos_mensagens_mencoes WHERE mensagem_id = $1`, [mensagemId]);
  if (mencoes.length) {
    await query(`INSERT INTO grupos_mensagens_mencoes (mensagem_id, mencoes) VALUES ($1,$2)`, [mensagemId, JSON.stringify(mencoes)]);
  }
}

async function mencoesDa(mensagemId: number): Promise<Mencao[]> {
  await garantirTabelaBotao();
  const r = await query(`SELECT mencoes FROM grupos_mensagens_mencoes WHERE mensagem_id = $1`, [mensagemId]);
  return r.rows[0]?.mencoes || [];
}

/** Pessoas marcadas na boas-vindas (092) — `automacoes_grupo` é do postgres. */
async function salvarMencoesBoasVindas(automacaoId: number, mencoes: Mencao[]) {
  await garantirTabelaBotao();
  await query(`DELETE FROM grupos_boas_vindas_mencoes WHERE automacao_id = $1`, [automacaoId]);
  if (mencoes.length) {
    await query(`INSERT INTO grupos_boas_vindas_mencoes (automacao_id, mencoes) VALUES ($1,$2)`, [automacaoId, JSON.stringify(mencoes)]);
  }
}

async function mencoesDaBoasVindas(automacaoId: number): Promise<Mencao[]> {
  await garantirTabelaBotao();
  const r = await query(`SELECT mencoes FROM grupos_boas_vindas_mencoes WHERE automacao_id = $1`, [automacaoId]);
  return r.rows[0]?.mencoes || [];
}

/** Grupos por consulta de participantes — cada um é uma ida ao WhatsApp. */
export const MAX_GRUPOS_PARTICIPANTES = 20;

/**
 * Quem está nos grupos escolhidos, para o seletor de @. Mensagem comum: pelo chip de
 * quem cria. Mensagem de campanha: cada grupo pelo chip que o administra. Mesma pessoa
 * em vários grupos vem uma vez, com os grupos em que está.
 */
export async function participantesDosGrupos(u: Usuario, gruposIds: string[], campanhaId?: number | null) {
  let alvos: { id: string; nome: string; usuarioId: number }[];
  if (campanhaId) {
    const r = await query(
      `SELECT g.grupo_id AS id, g.nome, g.usuario_id FROM grupos_campanhas_grupos g
         JOIN grupos_campanhas c ON c.id = g.campanha_id
        WHERE g.campanha_id = $1 AND c.empresa_id = $2 AND g.ativo ORDER BY g.ordem, g.id`,
      [campanhaId, u.empresa_id]
    );
    alvos = r.rows.map((x: any) => ({ id: x.id, nome: x.nome || '', usuarioId: x.usuario_id }));
  } else {
    alvos = [...new Set(gruposIds)].filter((g) => g.endsWith('@g.us')).map((id) => ({ id, nome: '', usuarioId: u.userId }));
  }
  const omitidos = Math.max(0, alvos.length - MAX_GRUPOS_PARTICIPANTES);
  alvos = alvos.slice(0, MAX_GRUPOS_PARTICIPANTES);

  const pessoas = new Map<string, { id: string; numero: string; nome: string | null; grupos: string[] }>();
  const falhas: string[] = [];
  const portaPorUsuario = new Map<number, number>();
  await Promise.all(alvos.map(async (g) => {
    try {
      if (!portaPorUsuario.has(g.usuarioId)) portaPorUsuario.set(g.usuarioId, await portaQrDo(g.usuarioId));
      const porta = portaPorUsuario.get(g.usuarioId)!;
      const r = await instancia(porta).get(`/groups/${encodeURIComponent(g.id)}/participants`, { timeout: 15000 });
      const nomeGrupo = g.nome || r.data?.subject || 'Grupo';
      for (const p of r.data?.participants || []) {
        const numero = String(p.number || '').replace(/\D/g, '');
        const chave = numero || p.id;
        const atual = pessoas.get(chave);
        if (atual) { if (!atual.grupos.includes(nomeGrupo)) atual.grupos.push(nomeGrupo); continue; }
        pessoas.set(chave, { id: p.id, numero, nome: null, grupos: [nomeGrupo] });
      }
    } catch (e) {
      falhas.push(`${g.nome || g.id}: ${erroDaInstancia(e)}`);
    }
  }));

  const lista = [...pessoas.values()];
  // O nome vem de quem a conta já conhece (agenda, contato, lead); sem nome, o número.
  const nomes = await contatosService.nomesConhecidos(lista.map((p) => p.numero).filter(Boolean), u.empresa_id, portaPorUsuario.get(u.userId) ?? null)
    .catch(() => new Map<string, string>());
  for (const p of lista) p.nome = nomes.get(chaveTelefone(p.numero) || '') || null;
  lista.sort((a, b) => (a.nome ? 0 : 1) - (b.nome ? 0 : 1) || (a.nome || a.numero).localeCompare(b.nome || b.numero, 'pt-BR'));
  return { participantes: lista, falhas, omitidos };
}

async function salvarBotao(mensagemId: number, botao: { texto: string; url: string } | null) {
  await garantirTabelaBotao();
  await query(`DELETE FROM grupos_mensagens_botao WHERE mensagem_id = $1`, [mensagemId]);
  if (botao) {
    await query(`INSERT INTO grupos_mensagens_botao (mensagem_id, texto, url) VALUES ($1,$2,$3)`, [mensagemId, botao.texto, botao.url]);
  }
}

async function salvarEnquete(mensagemId: number, enquete: { pergunta: string; opcoes: string[] } | null) {
  await garantirTabelaBotao();
  await query(`DELETE FROM grupos_mensagens_enquete WHERE mensagem_id = $1`, [mensagemId]);
  if (enquete) {
    await query(`INSERT INTO grupos_mensagens_enquete (mensagem_id, pergunta, opcoes) VALUES ($1,$2,$3)`,
      [mensagemId, enquete.pergunta, JSON.stringify(enquete.opcoes)]);
  }
}

async function enqueteDa(mensagemId: number): Promise<{ pergunta: string; opcoes: string[] } | null> {
  await garantirTabelaBotao();
  const r = await query(`SELECT pergunta, opcoes FROM grupos_mensagens_enquete WHERE mensagem_id = $1`, [mensagemId]);
  return r.rows[0] || null;
}

async function botaoDa(mensagemId: number): Promise<{ texto: string; url: string } | null> {
  await garantirTabelaBotao();
  const r = await query(`SELECT texto, url FROM grupos_mensagens_botao WHERE mensagem_id = $1`, [mensagemId]);
  return r.rows[0] || null;
}

function validar(e: EntradaMensagem, agora = new Date()) {
  const titulo = String(e.titulo || '').trim().slice(0, 200);
  if (!titulo) throw new ErroGrupos('Dê um nome para esta mensagem.');
  const texto = String(e.texto || '');
  const enquete = normalizarEnquete(e.enquete);
  if (!texto.trim() && !e.media_url && !enquete) throw new ErroGrupos('Escreva a mensagem, anexe um arquivo ou monte uma enquete.');
  if (e.media_url && !/^\/uploads\/[\w./-]+$/.test(e.media_url)) throw new ErroGrupos('Arquivo inválido.');
  const campanhaId = Number(e.campanha_id) || null;
  const grupos = campanhaId ? [] : (e.grupos || [])
    .filter((g) => typeof g?.id === 'string' && g.id.endsWith('@g.us'))
    .map((g) => ({ id: g.id, nome: String(g.nome || '').slice(0, 255) }));
  if (!campanhaId && !grupos.length) throw new ErroGrupos('Escolha pelo menos um grupo.');
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
    titulo, texto, grupos, intervalo, modo, agendado, recorrencia, proxima, campanhaId,
    media_url: e.media_url || null,
    media_mimetype: e.media_url ? String(e.media_mimetype || 'application/octet-stream').slice(0, 120) : null,
    media_filename: e.media_url ? String(e.media_filename || 'arquivo').slice(0, 255) : null,
    mencionar_todos: !!e.mencionar_todos,
    botao: normalizarBotao(e.botao, texto),
    mencoes: normalizarMencoes(e.mencoes, texto),
    enquete,
  };
}

const SELECT_MENSAGEM = `
  SELECT m.*, u.nome AS usuario_nome, gc.nome AS campanha_nome,
         b.texto AS botao_texto, b.url AS botao_url, COALESCE(mm.mencoes, '[]'::jsonb) AS mencoes,
         en.pergunta AS enquete_pergunta, en.opcoes AS enquete_opcoes,
         (SELECT count(*)::int FROM grupos_mensagens_envios x WHERE x.mensagem_id = m.id AND x.status = 'enviado') AS total_enviados,
         (SELECT count(*)::int FROM grupos_mensagens_envios x WHERE x.mensagem_id = m.id AND x.status = 'falhou') AS total_falhas
    FROM grupos_mensagens m JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN grupos_campanhas gc ON gc.id = m.campanha_id
    LEFT JOIN grupos_mensagens_botao b ON b.mensagem_id = m.id
    LEFT JOIN grupos_mensagens_mencoes mm ON mm.mensagem_id = m.id
    LEFT JOIN grupos_mensagens_enquete en ON en.mensagem_id = m.id`;

export async function listarMensagens(u: Usuario) {
  await garantirTabelaBotao();
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

/** Campanha da mesma empresa, ou erro. A mensagem de campanha sai pelos chips da campanha. */
async function campanhaDaEmpresa(u: Usuario, campanhaId: number) {
  const r = await query(`SELECT id FROM grupos_campanhas WHERE id = $1 AND empresa_id = $2`, [campanhaId, u.empresa_id]);
  if (!r.rows[0]) throw new ErroGrupos('Campanha não encontrada.', 404);
}

export async function criarMensagem(u: Usuario, e: EntradaMensagem) {
  const v = validar(e);
  // Mensagem de campanha sai pelo chip que administra cada grupo, não pelo de quem criou.
  if (v.campanhaId) await campanhaDaEmpresa(u, v.campanhaId);
  else await portaQrDo(u.userId);
  const r = await query(
    `INSERT INTO grupos_mensagens
       (empresa_id, usuario_id, titulo, texto, media_url, media_mimetype, media_filename, mencionar_todos,
        grupos, modo, agendado_para, recorrencia, proxima_execucao, intervalo_segundos, ativa, campanha_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15) RETURNING id`,
    [u.empresa_id, u.userId, v.titulo, v.texto, v.media_url, v.media_mimetype, v.media_filename, v.mencionar_todos,
     JSON.stringify(v.grupos), v.modo, v.agendado, v.recorrencia ? JSON.stringify(v.recorrencia) : null, v.proxima, v.intervalo,
     v.campanhaId]
  );
  if (v.botao) await salvarBotao(r.rows[0].id, v.botao);
  if (v.mencoes.length) await salvarMencoes(r.rows[0].id, v.mencoes);
  if (v.enquete) await salvarEnquete(r.rows[0].id, v.enquete);
  return r.rows[0];
}

export async function atualizarMensagem(u: Usuario, id: number, e: EntradaMensagem) {
  const atual = await minha(u, id);
  // A campanha de uma mensagem não muda na edição.
  const v = validar({ ...e, campanha_id: atual.campanha_id, modo: e.modo === 'agora' ? 'agora' : e.modo });
  await query(
    `UPDATE grupos_mensagens SET titulo=$3, texto=$4, media_url=$5, media_mimetype=$6, media_filename=$7,
            mencionar_todos=$8, grupos=$9, modo=$10, agendado_para=$11, recorrencia=$12,
            proxima_execucao = CASE WHEN ativa THEN $13::timestamptz ELSE NULL END,
            intervalo_segundos=$14, updated_at=now()
      WHERE id=$1 AND empresa_id=$2`,
    [atual.id, u.empresa_id, v.titulo, v.texto, v.media_url, v.media_mimetype, v.media_filename, v.mencionar_todos,
     JSON.stringify(v.grupos), v.modo, v.agendado, v.recorrencia ? JSON.stringify(v.recorrencia) : null, v.proxima, v.intervalo]
  );
  await salvarBotao(atual.id, v.botao);
  await salvarMencoes(atual.id, v.mencoes);
  await salvarEnquete(atual.id, v.enquete);
}

/** Pausar/retomar. Retomar uma recorrente recalcula a próxima a partir de agora. */
export async function alternarMensagem(u: Usuario, id: number, ativa: boolean) {
  const m = await minha(u, id);
  let proxima: Date | null = null;
  if (ativa) {
    if (m.modo === 'recorrente' && m.recorrencia) proxima = proximaRecorrencia(m.recorrencia.dias, m.recorrencia.hora, new Date());
    // Data futura volta à fila mesmo que a mensagem já tenha saído antes: pausar,
    // trocar a data e religar é o jeito de repetir uma agendada (#401). Exigir
    // `!ultima_execucao` deixava a tela "Ativa, agendada" sem nada na fila.
    else if (m.modo === 'agendada' && m.agendado_para && new Date(m.agendado_para) > new Date()) proxima = new Date(m.agendado_para);
  }
  await query(`UPDATE grupos_mensagens SET ativa=$2, proxima_execucao=$3, updated_at=now() WHERE id=$1`, [m.id, ativa, proxima]);
}

/** "Enviar agora" de uma mensagem já salva — o job pega em até 1 minuto. */
export async function enviarAgora(u: Usuario, id: number) {
  const m = await minha(u, id);
  if (!m.campanha_id) await portaQrDo(m.usuario_id);
  await query(`UPDATE grupos_mensagens SET proxima_execucao = now(), ativa = true, updated_at = now() WHERE id = $1`, [m.id]);
}

export async function excluirMensagem(u: Usuario, id: number) {
  const m = await minha(u, id);
  await query(`DELETE FROM grupos_mensagens WHERE id = $1`, [m.id]);
  await salvarBotao(m.id, null);
  await salvarMencoes(m.id, []);
  await salvarEnquete(m.id, null);
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

/**
 * Enquete vai em mensagem própria, DEPOIS do texto/anexo (o WhatsApp não junta
 * enquete com legenda). A pergunta passa pelas variações como o texto.
 */
async function enviarParaGrupo(porta: number, m0: any, grupoId: string): Promise<string | null> {
  const enquete: { pergunta: string; opcoes: string[] } | null = m0.enquete || null;
  if (!enquete) return enviarConteudo(porta, m0, grupoId);
  let id: string | null = null;
  if (String(m0.texto || '').trim() || m0.media_url) {
    id = await enviarConteudo(porta, m0, grupoId);
    await espera(1500);
  }
  const r = await instancia(porta).post('/send-enquete', {
    number: grupoId, pergunta: aplicarVariacoes(enquete.pergunta), opcoes: enquete.opcoes,
  }, { timeout: 30000 });
  return id || r.data?.messageId || null;
}

async function enviarConteudo(porta: number, m0: any, grupoId: string): Promise<string | null> {
  const api = instancia(porta);
  // `{Oi|Olá}` sorteia por grupo: a mesma mensagem idêntica em 20 grupos é o padrão de disparo.
  const m = { ...m0, texto: aplicarVariacoes(m0.texto || '') };
  // "@Ana Souza" vira o "@<número>" com que ESTE grupo lista a pessoa; quem não está
  // no grupo fica só com o nome. Lista ilegível = todo mundo só com o nome.
  let mentions: string[] | undefined;
  const mencoes: Mencao[] = m0.mencoes || [];
  if (mencoes.length) {
    let participantes: Participante[] | null = null;
    try {
      const r = await api.get(`/groups/${encodeURIComponent(grupoId)}/participants`, { timeout: 15000 });
      participantes = r.data?.participants || null;
    } catch { participantes = null; }
    const aplicado = aplicarMencoes(m.texto, mencoes, participantes);
    m.texto = aplicado.texto;
    if (aplicado.jids.length) mentions = aplicado.jids;
  }
  const botao: { texto: string; url: string } | null = m0.botao || null;
  // Com botão, o texto vai na mensagem do botão (com o link também no corpo) — o
  // anexo, se houver, sai antes e sem legenda.
  const enviarBotao = async () => {
    const r = await api.post('/send-botao', {
      number: grupoId, message: textoComLink(m.texto, botao!.url), botao, mencionarTodos: m.mencionar_todos, mentions,
    }, { timeout: 30000 });
    return r.data?.messageId || null;
  };
  if (m.media_url) {
    const abs = path.join('/var/www/apps/gestao_financeira', String(m.media_url).replace(/^\//, ''));
    const base64 = (await fs.promises.readFile(abs)).toString('base64');
    const r = await api.post('/send-media', {
      number: grupoId, media: base64, mimetype: m.media_mimetype, filename: m.media_filename,
      caption: botao ? undefined : m.texto || undefined, mencionarTodos: botao ? false : m.mencionar_todos, mentions: botao ? undefined : mentions,
    }, { timeout: 120000 });
    if (botao) return (await enviarBotao()) || r.data?.messageId || null;
    // Áudio e documento não têm legenda: o texto vai logo depois, separado.
    if (m.texto?.trim() && !/^(image|video)\//.test(m.media_mimetype || '')) {
      await api.post('/send', { number: grupoId, message: m.texto, mencionarTodos: m.mencionar_todos, mentions }, { timeout: 30000 });
    }
    return r.data?.messageId || null;
  }
  if (botao) return enviarBotao();
  const r = await api.post('/send', { number: grupoId, message: m.texto, mencionarTodos: m.mencionar_todos, mentions }, { timeout: 30000 });
  return r.data?.messageId || null;
}

/**
 * Uma rodada: todos os grupos da mensagem, um de cada vez, com o intervalo entre
 * eles. Chip fora do ar para a rodada inteira — cada grupo restante vira falha com
 * o motivo, em vez de 50 tentativas no mesmo problema.
 */
export async function executarRodada(m0: any): Promise<{ enviados: number; falhas: number }> {
  const execucao = new Date();
  const m = { ...m0, botao: await botaoDa(m0.id), mencoes: await mencoesDa(m0.id), enquete: await enqueteDa(m0.id) };
  // Mensagem de campanha: os grupos ativos da campanha AGORA (inclusive os que abriram
  // depois de a mensagem ser criada), cada um com o chip que o administra.
  const grupos: { id: string; nome?: string; usuario_id?: number }[] = m.campanha_id
    ? (await query(
        `SELECT grupo_id AS id, nome, usuario_id FROM grupos_campanhas_grupos
          WHERE campanha_id = $1 AND ativo ORDER BY ordem, id`,
        [m.campanha_id]
      )).rows
    : m.grupos || [];
  let enviados = 0;
  let falhas = 0;
  // Porta (ou o erro dela) por chip, resolvida uma vez. Chip fora do ar derruba só os
  // grupos DAQUELE chip — numa campanha com dois chips, o outro segue.
  const portas = new Map<number, { porta: number | null; erro: string | null }>();
  const portaDa = async (usuarioId: number) => {
    if (!portas.has(usuarioId)) {
      try { portas.set(usuarioId, { porta: await portaQrDo(usuarioId), erro: null }); }
      catch (e: any) { portas.set(usuarioId, { porta: null, erro: e.message }); }
    }
    return portas.get(usuarioId)!;
  };

  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    const chip = await portaDa(g.usuario_id || m.usuario_id);
    let status: 'enviado' | 'falhou' = 'falhou';
    let erro: string | null = chip.erro;
    let messageId: string | null = null;
    if (!chip.erro && chip.porta) {
      try {
        messageId = await enviarParaGrupo(chip.porta, m, g.id);
        status = 'enviado';
        erro = null;
      } catch (e: any) {
        erro = erroDaInstancia(e);
        if (e?.response?.status === 503 || e?.code === 'ECONNREFUSED') chip.erro = erro;
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
  await garantirTabelaBotao();
  const r = await query(
    `SELECT ag.id, ag.usuario_id, u.nome AS usuario_nome, ag.grupo_whatsapp_id, ag.grupo_nome, ag.mensagem,
            ag.ativa, ag.delay_segundos, ag.mencionar, ag.total_disparos, ag.ultimo_disparo_at,
            CASE ag.enviar_para WHEN 'dm_participante' THEN 'privado' ELSE 'grupo' END AS destino,
            COALESCE(bm.mencoes, '[]'::jsonb) AS mencoes,
            COALESCE(bd.usuarios, '{}') AS distribuir_entre,
            (SELECT array_agg(x.nome ORDER BY array_position(bd.usuarios, x.id)) FROM usuarios x
              WHERE x.id = ANY(bd.usuarios)) AS distribuir_nomes
       FROM automacoes_grupo ag JOIN usuarios u ON u.id = ag.usuario_id
       LEFT JOIN grupos_boas_vindas_mencoes bm ON bm.automacao_id = ag.id
       LEFT JOIN grupos_boas_vindas_distribuir bd ON bd.automacao_id = ag.id
      WHERE ag.empresa_id = $1
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
  /** 'grupo' (padrão) ou 'privado'. */
  destino?: string;
  /** Pessoas do grupo marcadas com @ (092). */
  mencoes?: Mencao[] | null;
  /**
   * Só no privado: números da equipe (usuario_id com chip de QR) que dividem o envio.
   * Vazio/null = sai pelo responsável do card ou pelo dono, como antes. Ausente = não mexe.
   */
  distribuir_entre?: number[] | null;
}

/** Chips de QR da empresa que podem dividir o envio da boas-vindas no privado, com o status agora. */
export async function chipsParaBoasVindas(u: Usuario) {
  const r = await query(
    `SELECT u.id, u.nome, ${SQL_PORTA_GRUPOS} AS porta FROM usuarios u
       LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id
      WHERE u.empresa_id = $1 AND u.ativo AND ${SQL_PORTA_GRUPOS} IS NOT NULL
      ORDER BY u.nome`,
    [u.empresa_id]
  );
  const chips = r.rows.filter((x: any) => !ehPortaVirtual(Number(x.porta)));
  return Promise.all(chips.map(async (x: any) => ({
    id: x.id, nome: x.nome,
    conectado: (await instancia(Number(x.porta)).get('/status', { timeout: 3000 }).catch(() => null))?.data?.status === 'connected',
  })));
}

async function salvarDistribuicao(u: Usuario, automacaoId: number, lista: number[] | null | undefined, privado: boolean) {
  await garantirTabelaBotao();
  const pedidos = privado ? [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (!pedidos.length) {
    await query(`DELETE FROM grupos_boas_vindas_distribuir WHERE automacao_id = $1`, [automacaoId]);
    return;
  }
  const validos = (await query(
    `SELECT u.id FROM usuarios u LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id
      WHERE u.id = ANY($1::int[]) AND u.empresa_id = $2 AND u.ativo AND ${SQL_PORTA_GRUPOS} IS NOT NULL
        AND ${SQL_PORTA_GRUPOS} < ${PORTA_VIRTUAL_MINIMA}`,
    [pedidos, u.empresa_id]
  )).rows.map((x: any) => x.id);
  const fora = pedidos.filter((id) => !validos.includes(id));
  if (fora.length) throw new ErroGrupos('Só dá para dividir entre pessoas da equipe com WhatsApp conectado por QR Code.');
  await query(
    `INSERT INTO grupos_boas_vindas_distribuir (automacao_id, usuarios) VALUES ($1, $2)
     ON CONFLICT (automacao_id) DO UPDATE SET usuarios = EXCLUDED.usuarios`,
    [automacaoId, pedidos]
  );
}

function validarBoasVindas(e: EntradaBoasVindas) {
  const mensagem = String(e.mensagem || '').trim();
  if (!mensagem) throw new ErroGrupos('Escreva a mensagem de boas-vindas.');
  if (mensagem.length > 4000) throw new ErroGrupos('A mensagem pode ter no máximo 4.000 caracteres.');
  const delay = Math.min(3600, Math.max(0, Math.round(Number(e.delay_segundos ?? 60))));
  const destino: Destino = e.destino === 'privado' ? 'privado' : 'grupo';
  return {
    mensagem, delay, mencionar: e.mencionar !== false, ativa: e.ativa !== false,
    enviarPara: destino === 'privado' ? 'dm_participante' : 'grupo',
    mencoes: normalizarMencoes(e.mencoes, mensagem),
  };
}

export async function salvarBoasVindas(u: Usuario, e: EntradaBoasVindas, id?: number) {
  const v = validarBoasVindas(e);
  if (id) {
    const r = await query(`SELECT * FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
    const a = r.rows[0];
    if (!a) throw new ErroGrupos('Boas-vindas não encontrada.', 404);
    if (a.usuario_id !== u.userId && !isAdminEmpresa(u as any)) throw new ErroGrupos('Só quem criou, ou um administrador, pode mexer nela.', 403);
    await query(
      `UPDATE automacoes_grupo SET mensagem=$2, delay_segundos=$3, mencionar=$4, ativa=$5, enviar_para=$6, updated_at=now() WHERE id=$1`,
      [id, v.mensagem, v.delay, v.mencionar, v.ativa, e.destino === undefined ? a.enviar_para : v.enviarPara]
    );
    // Ligar/desligar pela lista não manda as menções: ausente = não mexe.
    if (e.mencoes !== undefined) await salvarMencoesBoasVindas(id, v.mencoes);
    const privado = (e.destino === undefined ? a.enviar_para : v.enviarPara) === 'dm_participante';
    if (e.distribuir_entre !== undefined || !privado) await salvarDistribuicao(u, id, e.distribuir_entre, privado);
    return { id };
  }
  await portaQrDo(u.userId);
  const grupoId = String(e.grupo_id || '');
  if (!grupoId.endsWith('@g.us')) throw new ErroGrupos('Escolha o grupo.');
  const existe = await query(
    `SELECT 1 FROM automacoes_grupo WHERE empresa_id = $1 AND usuario_id = $2 AND grupo_whatsapp_id = $3`,
    [u.empresa_id, u.userId, grupoId]
  );
  if (existe.rows.length >= LIMITE_BOAS_VINDAS_POR_GRUPO) throw new ErroGrupos('Este grupo já tem boas-vindas. Edite a que existe.');
  const nome = String(e.grupo_nome || '').slice(0, 255) || null;
  const r = await query(
    `INSERT INTO automacoes_grupo (empresa_id, usuario_id, nome, grupo_whatsapp_id, grupo_nome, mensagem, ativa,
                                   trigger_tipo, delay_segundos, enviar_para, mencionar)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'novo_participante',$8,$10,$9) RETURNING id`,
    [u.empresa_id, u.userId, `Boas-vindas · ${nome || grupoId}`.slice(0, 200), grupoId, nome, v.mensagem, v.ativa, v.delay, v.mencionar, v.enviarPara]
  );
  if (v.mencoes.length) await salvarMencoesBoasVindas(r.rows[0].id, v.mencoes);
  if (e.distribuir_entre?.length) await salvarDistribuicao(u, r.rows[0].id, e.distribuir_entre, v.enviarPara === 'dm_participante');
  return r.rows[0];
}

export async function excluirBoasVindas(u: Usuario, id: number) {
  const r = await query(`SELECT usuario_id FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
  if (!r.rows[0]) throw new ErroGrupos('Boas-vindas não encontrada.', 404);
  if (r.rows[0].usuario_id !== u.userId && !isAdminEmpresa(u as any)) throw new ErroGrupos('Só quem criou, ou um administrador, pode excluir.', 403);
  await query(`DELETE FROM automacoes_grupo WHERE id = $1`, [id]);
  await salvarMencoesBoasVindas(id, []);
  await salvarDistribuicao(u, id, null, false);
}

/**
 * Evento da instância: gente entrou num grupo. Vale a boas-vindas do DONO da porta que
 * viu a entrada e, desde 09/10/2026, também a de quem tem esta porta no "dividir entre"
 * (#408): o chip 2 da Jéssica, dono da boas-vindas do Clube do Livro, caiu em 08/10 e
 * nenhuma entrada chegou mais à fila — os chips da equipe, no mesmo grupo e conectados,
 * viam a entrada e a ignoravam. Dois chips vendo a mesma pessoa não dão duas
 * boas-vindas: o índice único do pendente segura o evento simultâneo, e o NOT EXISTS
 * segura o que chega depois de a primeira já ter saído (24h).
 */
export async function registrarEntradas(donoId: number, empresaId: number, grupoId: string, participantes: any[]) {
  await garantirTabelaBotao();
  const auto = await query(
    `SELECT ag.id, ag.delay_segundos, ag.enviar_para FROM automacoes_grupo ag
      WHERE ag.empresa_id = $1 AND ag.grupo_whatsapp_id = $3 AND ag.ativa
        AND (ag.usuario_id = $2 OR EXISTS (SELECT 1 FROM grupos_boas_vindas_distribuir d
                                            WHERE d.automacao_id = ag.id AND $2 = ANY(d.usuarios)))`,
    [empresaId, donoId, grupoId]
  );
  let n = 0;
  for (const a of auto.rows) {
    // No privado, 1 a 5 minutos a mais, sorteados: entradas em rajada (link de campanha)
    // não viram mensagens no mesmo segundo.
    const extra = () => (a.enviar_para === 'dm_participante' ? 60 + Math.floor(Math.random() * 241) : 0);
    for (const p of participantes || []) {
      const jid = String(p?.jid || '');
      if (!/@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) continue;
      const r = await query(
        `INSERT INTO grupos_boas_vindas_fila (automacao_id, empresa_id, grupo_id, participante_jid, participante_nome, enviar_em)
         SELECT $1,$2,$3,$4::varchar,$5, now() + make_interval(secs => $6)
          WHERE NOT EXISTS (SELECT 1 FROM grupos_boas_vindas_fila x WHERE x.automacao_id = $1
                               AND x.participante_jid = $4::varchar AND x.created_at > now() - interval '24 hours')
         ON CONFLICT DO NOTHING`,
        [a.id, empresaId, grupoId, jid.replace(/@c\.us$/, '@s.whatsapp.net'), p?.nome ? String(p.nome).slice(0, 255) : null, (a.delay_segundos || 0) + extra()]
      );
      n += r.rowCount ?? 0;
    }
  }
  return n;
}

/** Nome de quem entrou: o que a instância mandou, o do contato ou o do card da empresa. */
async function nomeDoEntrante(empresaId: number, jid: string, nome: string | null): Promise<string | null> {
  if (nome) return nome;
  const numero = String(jid).replace(/@.*$/, '');
  const c = await query(
    `SELECT nome FROM contatos_whatsapp WHERE empresa_id = $1 AND numero = $2 AND NOT coalesce(is_grupo, false)
      AND nome ~ '[A-Za-zÀ-ÿ]'
     UNION ALL
     SELECT nome FROM leads WHERE empresa_id = $1
        AND regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = ANY($3::text[]) AND nome ~ '[A-Za-zÀ-ÿ]'
     LIMIT 1`,
    [empresaId, numero, variantesTelefone(numero)]
  ).catch(() => ({ rows: [] as any[] }));
  return c.rows[0]?.nome || null;
}

/**
 * A boas-vindas no privado entra na conversa do card (#294, #322, #323): saía pelo
 * chip e não ficava em lugar nenhum do CRM — a equipe não sabia se o lead tinha sido
 * abordado. Grava como `disparo`, a origem de automação em massa, que também é o que
 * o anti-ban conta. O card mais recente com o número recebe o vínculo; sem card, a
 * mensagem fica no contato e aparece quando o card nascer.
 */
/** Próximo da roda a partir do ponteiro `pos` (já incrementado), só entre os `disponiveis`. */
export function escolherDaRoda(lista: number[], disponiveis: number[], pos: number): number | null {
  const roda = lista.filter((id) => disponiveis.includes(id));
  if (!roda.length) return null;
  return roda[((pos - 1) % roda.length + roda.length) % roda.length];
}

async function conectado(porta: number | null): Promise<boolean> {
  if (!porta || ehPortaVirtual(porta)) return false;
  const st = await instancia(porta).get('/status', { timeout: 3000 }).catch(() => null);
  return st?.data?.status === 'connected';
}

/**
 * Chip que manda a boas-vindas no privado. Devolve `a` com `usuario_id` e `whatsapp_porta`
 * do remetente (é o que o histórico grava) e `lead_id` do card, se houver.
 *
 * - **Com "dividir entre" (07/10/2026):** o responsável do card, se ele está na lista,
 *   conectado e abaixo do teto do dia (o rodízio do Criar lead continua valendo); senão o
 *   próximo da roda que esteja conectado e abaixo do teto. Ninguém disponível: o dono.
 * - **Sem a lista:** o responsável do card, se tem chip de QR conectado; senão o dono.
 */
export async function remetenteDaBoasVindas(a: any, jid: string): Promise<any> {
  const numero = String(jid).replace(/@.*$/, '');
  const r = await query(
    `SELECT l.id AS lead_id, u.id, ${SQL_PORTA_GRUPOS} AS porta
       FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id AND u.ativo AND u.empresa_id = l.empresa_id
       LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id
      WHERE l.empresa_id = $1 AND regexp_replace(coalesce(l.telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY coalesce(l.arquivado, false), l.created_at DESC LIMIT 1`,
    [a.empresa_id, variantesTelefone(numero)]
  ).catch(() => ({ rows: [] as any[] }));
  const resp = r.rows[0];
  const base = { ...a, lead_id: resp?.lead_id ?? null };

  const dist = (await query(
    `SELECT usuarios FROM grupos_boas_vindas_distribuir WHERE automacao_id = $1`, [a.id]
  ).catch(() => ({ rows: [] as any[] }))).rows[0];
  const lista: number[] = dist?.usuarios || [];

  if (!lista.length) {
    if (!resp?.id || resp.id === a.usuario_id || !(await conectado(resp.porta ? Number(resp.porta) : null))) return base;
    return { ...base, usuario_id: resp.id, whatsapp_porta: resp.porta };
  }

  const chips = (await query(
    `SELECT u.id, ${SQL_PORTA_GRUPOS} AS porta FROM usuarios u LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id
      WHERE u.id = ANY($1::int[]) AND u.empresa_id = $2 AND u.ativo`,
    [lista, a.empresa_id]
  )).rows;
  const porta = new Map<number, number>(chips.filter((c: any) => c.porta).map((c: any) => [c.id, Number(c.porta)]));
  const disponivel = async (id: number) =>
    porta.has(id) && await conectado(porta.get(id)!) && await privadosHojeDoChip(id) < TETO_PRIVADO_POR_CHIP_DIA;

  if (resp?.id && lista.includes(resp.id) && await disponivel(resp.id)) {
    return { ...base, usuario_id: resp.id, whatsapp_porta: porta.get(resp.id) };
  }
  const ok = await Promise.all(lista.map(disponivel));
  const disponiveis = lista.filter((_, i) => ok[i]);
  if (!disponiveis.length) return base;
  const pos = (await query(
    `UPDATE grupos_boas_vindas_distribuir SET pos = pos + 1 WHERE automacao_id = $1 RETURNING pos`, [a.id]
  )).rows[0]?.pos ?? 1;
  const vez = escolherDaRoda(lista, disponiveis, pos);
  if (!vez) return base;
  return { ...base, usuario_id: vez, whatsapp_porta: porta.get(vez), dividido: true };
}

async function registrarBoasVindasNoHistorico(a: any, numero: string, texto: string, messageId: string | null) {
  const lead = (await query(
    `SELECT id FROM leads WHERE empresa_id = $1
        AND regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY coalesce(arquivado, false), created_at DESC LIMIT 1`,
    [a.empresa_id, variantesTelefone(numero)]
  )).rows[0];
  const contatoId = lead
    ? await contatosService.resolverContatoParaLead(lead.id, a.usuario_id, a.empresa_id)
    : (await contatosService.findOrCreateByNumero(numero, a.usuario_id, a.empresa_id)).id;
  await query(
    `INSERT INTO historico_mensagens
       (lead_id, contato_whatsapp_id, usuario_id, empresa_id, whatsapp_message_id, direcao, tipo, conteudo, origem, enviado_at)
     VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, 'disparo', NOW())`,
    [lead?.id ?? null, contatoId ?? null, a.usuario_id, a.empresa_id, messageId, texto]
  );
  if (lead) {
    await query(`UPDATE leads SET data_ultimo_contato = NOW(), aguardando_resposta = true WHERE id = $1`, [lead.id]);
  }
}

/** Uma mensagem no grupo marcando todos os `itens` (já reclamados como 'enviado'). */
async function enviarNoGrupo(a: any, itens: any[], nota: string | null): Promise<boolean> {
  const ids = itens.map((r) => r.id);
  const entrantes: Entrante[] = [];
  for (const r of itens) entrantes.push({ jid: r.participante_jid, nome: await nomeDoEntrante(a.empresa_id, r.participante_jid, r.participante_nome) });
  const montada = montarBoasVindas(a.mensagem, entrantes, a.grupo_nome, a.mencionar);
  let texto = montada.texto;
  const mencoes = [...montada.mencoes];
  // Pessoas marcadas na configuração ("fale com @Débora"): o @número deste grupo.
  const pessoas = await mencoesDaBoasVindas(a.id).catch(() => [] as Mencao[]);
  if (pessoas.length) {
    let participantes: Participante[] | null = null;
    try {
      const r = await instancia(a.whatsapp_porta).get(`/groups/${encodeURIComponent(a.grupo_whatsapp_id)}/participants`, { timeout: 15000 });
      participantes = r.data?.participants || null;
    } catch { participantes = null; }
    const aplicado = aplicarMencoes(texto, pessoas, participantes);
    texto = aplicado.texto;
    for (const j of aplicado.jids) if (!mencoes.includes(j)) mencoes.push(j);
  }
  try {
    await instancia(a.whatsapp_porta).post('/send', { number: a.grupo_whatsapp_id, message: texto, mentions: mencoes }, { timeout: 30000 });
    if (nota) await query(`UPDATE grupos_boas_vindas_fila SET erro = $2 WHERE id = ANY($1::int[])`, [ids, nota]);
    await query(
      `UPDATE automacoes_grupo SET total_disparos = total_disparos + $2, ultimo_disparo_at = now() WHERE id = $1`,
      [a.id, entrantes.length]
    );
    return true;
  } catch (e: any) {
    await query(`UPDATE grupos_boas_vindas_fila SET status = 'falhou', erro = $2 WHERE id = ANY($1::int[])`, [ids, erroDaInstancia(e)]);
    return false;
  }
}

export function horaDeBrasilia(agora = new Date()): number {
  return new Date(agora.getTime() - 3 * 3600_000).getUTCHours();
}

/** Boas-vindas no privado que o chip já mandou hoje (Brasília) — o teto é por chip REMETENTE. */
async function privadosHojeDoChip(usuarioId: number): Promise<number> {
  const r = await query(
    `SELECT count(*)::int AS n FROM grupos_boas_vindas_fila f JOIN automacoes_grupo ag ON ag.id = f.automacao_id
       LEFT JOIN grupos_boas_vindas_remetente rm ON rm.fila_id = f.id
      WHERE COALESCE(rm.usuario_id, ag.usuario_id) = $1
        AND ag.enviar_para = 'dm_participante' AND f.status = 'enviado' AND f.erro IS NULL
        AND (f.processado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    [usuarioId]
  );
  return r.rows[0]?.n || 0;
}

/**
 * Boas-vindas no privado: uma por chip por rodada do job (1/min), só das 08h às 21h.
 * Fora da janela o item espera. Estourou o teto do dia, participante sem número
 * (`@lid`) ou número sem WhatsApp (422): sai no grupo, marcado em `erro` com
 * `PREFIXO_NO_GRUPO` — é assim que o teto não conta esses.
 */
async function processarBoasVindasPrivado(): Promise<number> {
  const hora = horaDeBrasilia();
  if (hora < JANELA_PRIVADO[0] || hora >= JANELA_PRIVADO[1]) return 0;

  const chips = await query(
    `SELECT DISTINCT ag.usuario_id FROM grupos_boas_vindas_fila f JOIN automacoes_grupo ag ON ag.id = f.automacao_id
      WHERE f.status = 'pendente' AND f.enviar_em <= now() AND ag.enviar_para = 'dm_participante'`
  );
  let enviadas = 0;
  for (const { usuario_id } of chips.rows) {
    const proximo = await query(
      `SELECT f.id FROM grupos_boas_vindas_fila f JOIN automacoes_grupo ag ON ag.id = f.automacao_id
        WHERE f.status = 'pendente' AND f.enviar_em <= now() AND ag.enviar_para = 'dm_participante' AND ag.usuario_id = $1
        ORDER BY f.enviar_em LIMIT 1`,
      [usuario_id]
    );
    if (!proximo.rows[0]) continue;
    const item = (await query(
      `UPDATE grupos_boas_vindas_fila SET status = 'enviado', processado_em = now()
        WHERE id = $1 AND status = 'pendente' RETURNING id, automacao_id, participante_jid, participante_nome`,
      [proximo.rows[0].id]
    )).rows[0];
    if (!item) continue;
    const a = (await query(
      `SELECT ag.*, ${SQL_PORTA_GRUPOS} AS whatsapp_porta FROM automacoes_grupo ag JOIN usuarios u ON u.id = ag.usuario_id
         LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id WHERE ag.id = $1`,
      [item.automacao_id]
    )).rows[0];
    const falhar = (erro: string) =>
      query(`UPDATE grupos_boas_vindas_fila SET status = 'falhou', erro = $2 WHERE id = $1`, [item.id, erro]);
    if (!a || !a.ativa) { await falhar('Boas-vindas desligada antes do envio'); continue; }
    if (!a.whatsapp_porta || ehPortaVirtual(a.whatsapp_porta)) { await falhar('O chip de quem criou não está no QR Code'); continue; }

    if (!/@s\.whatsapp\.net$/.test(item.participante_jid)) {
      await enviarNoGrupo(a, [item], PREFIXO_NO_GRUPO + 'sem número do participante');
      continue;
    }
    // Sai pelo chip do RESPONSÁVEL do card, quando ele tem chip, ou pelo próximo da roda do
    // "dividir entre" (`remetenteDaBoasVindas`). Sem nenhum dos dois, pelo dono da boas-vindas.
    await garantirTabelaBotao();
    const remetente = await remetenteDaBoasVindas(a, item.participante_jid);
    if (await privadosHojeDoChip(remetente.usuario_id) >= TETO_PRIVADO_POR_CHIP_DIA) {
      // O teto vale para o resto do dia: o que venceu desta boas-vindas vai no grupo, junto.
      const resto = (await query(
        `UPDATE grupos_boas_vindas_fila f SET status = 'enviado', processado_em = now()
           FROM automacoes_grupo ag
          WHERE ag.id = f.automacao_id AND ag.id = $1 AND f.status = 'pendente' AND f.enviar_em <= now()
          RETURNING f.id, f.participante_jid, f.participante_nome`,
        [a.id]
      )).rows;
      await enviarNoGrupo(a, [item, ...resto], PREFIXO_NO_GRUPO + `limite de ${TETO_PRIVADO_POR_CHIP_DIA} no privado por dia`);
      continue;
    }

    const nome = await nomeDoEntrante(a.empresa_id, item.participante_jid, item.participante_nome);
    // No privado não existe menção: quem foi marcado na configuração sai só pelo nome.
    const texto = aplicarMencoes(
      montarBoasVindas(a.mensagem, [{ jid: item.participante_jid, nome }], a.grupo_nome, false, true).texto,
      await mencoesDaBoasVindas(a.id).catch(() => [] as Mencao[]), null,
    ).texto;
    const numero = item.participante_jid.replace(/@.*$/, '');
    try {
      const r = await instancia(remetente.whatsapp_porta).post('/send', { number: numero, message: texto }, { timeout: 30000 });
      // Já saiu: falha ao gravar não pode virar 'falhou' (e reenvio).
      await registrarBoasVindasNoHistorico(remetente, numero, texto, r.data?.messageId || null)
        .catch((e: any) => console.error(`[Grupos] boas-vindas ${item.id} enviada sem histórico:`, e?.message));
      await query(
        `INSERT INTO grupos_boas_vindas_remetente (fila_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [item.id, remetente.usuario_id]
      ).catch(() => undefined);
      // Dividindo o envio, o card fica com quem mandou: a resposta cai no WhatsApp dela
      // (regra do dono, 06/10/2026 — "responsável único é quem enviou a mensagem").
      if (remetente.dividido && remetente.lead_id) {
        await leadsService.transferirPropriedadeSeDiferente(remetente.lead_id, remetente.usuario_id, a.empresa_id, 'boas_vindas_grupo')
          .catch((e: any) => console.error(`[Grupos] boas-vindas ${item.id}: card não passou para quem enviou:`, e?.message));
      }
      await query(
        `UPDATE automacoes_grupo SET total_disparos = total_disparos + 1, ultimo_disparo_at = now() WHERE id = $1`,
        [a.id]
      );
      enviadas++;
    } catch (e: any) {
      if (e?.response?.status === 422) await enviarNoGrupo(a, [item], PREFIXO_NO_GRUPO + 'número sem WhatsApp');
      else await falhar(erroDaInstancia(e));
    }
  }
  return enviadas;
}

/**
 * Processa a fila. No GRUPO, por automação, todos os pendentes vencidos viram uma
 * mensagem só. No PRIVADO, uma por chip por rodada (`processarBoasVindasPrivado`).
 */
export async function processarBoasVindas(): Promise<number> {
  const venc = await query(
    `SELECT DISTINCT f.automacao_id FROM grupos_boas_vindas_fila f JOIN automacoes_grupo ag ON ag.id = f.automacao_id
      WHERE f.status = 'pendente' AND f.enviar_em <= now() AND ag.enviar_para <> 'dm_participante'`
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
      `SELECT ag.*, ${SQL_PORTA_GRUPOS} AS whatsapp_porta FROM automacoes_grupo ag JOIN usuarios u ON u.id = ag.usuario_id
         LEFT JOIN whatsapp_chip_grupos cg ON cg.usuario_id = u.id WHERE ag.id = $1`,
      [automacao_id]
    )).rows[0];
    const ids = itens.rows.map((r: any) => r.id);
    const falhar = (erro: string) =>
      query(`UPDATE grupos_boas_vindas_fila SET status = 'falhou', erro = $2 WHERE id = ANY($1::int[])`, [ids, erro]);
    if (!a || !a.ativa) { await falhar('Boas-vindas desligada antes do envio'); continue; }
    if (!a.whatsapp_porta || ehPortaVirtual(a.whatsapp_porta)) { await falhar('O chip de quem criou não está no QR Code'); continue; }
    if (await enviarNoGrupo(a, itens.rows, null)) mensagens++;
  }
  return mensagens + await processarBoasVindasPrivado();
}
