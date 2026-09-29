/**
 * Campanhas de grupo (migration 089, 28/09/2026) — o que o SendFlow faz, do nosso jeito.
 *
 * - **Link único** (`duofuturo.tech/gestao/g/<slug>`): manda cada pessoa para o
 *   primeiro grupo com vaga; quando todos enchem, um chip da campanha cria o próximo
 *   (com a equipe dentro como admin, a descrição com as regras e "só admins enviam").
 * - **Entradas e saídas** chegam pelo mesmo evento da boas-vindas
 *   (`group_participants`), e só o chip que ADMINISTRA o grupo na campanha conta —
 *   dois chips nossos no mesmo grupo não contam a mesma pessoa duas vezes.
 * - **Quem entra vira lead** no funil escolhido (o que o SendFlow não tem): duplicata
 *   no funil ganha uma anotação, nunca um card novo nem troca de estágio.
 * - **Mensagem da campanha** é uma `grupos_mensagens` com `campanha_id`: sai para os
 *   grupos ativos NA HORA do envio, cada um pelo chip que o administra.
 *
 * Só QR Code, como toda a página de Grupos. Capacidade `grupos_campanhas` (Enterprise).
 */

import { query } from '../../config/database';
import { instancia } from '../whatsapp/canal/instancia';
import { ehPortaVirtual } from '../whatsapp/canal/contas';
import { leadsService } from '../crm/leads/leads.service';
import { telefonePlausivel } from '../crm/_shared/telefone';
import { ErroGrupos, erroDaInstancia, portaDo } from './grupos.service';
import {
  chipDaVez, grupoComVaga, nomeDoGrupo, precisaDeGrupoNovo, slugDe, slugValido, utmLimpo,
} from './campanhas-regras';

type Usuario = { userId: number; empresa_id: number; tipo_usuario?: string; nivel?: string };

/** Grupos novos por chip por dia: criar grupo em série chama a atenção do WhatsApp. */
export const LIMITE_GRUPOS_NOVOS_POR_DIA = 10;
const PREFIXO = '[Campanhas]';

// ─── Cadastro ─────────────────────────────────────────────────────────────────

export interface EntradaCampanha {
  nome?: string;
  slug?: string;
  limite_por_grupo?: number;
  chips?: number[];
  criar_grupos?: boolean;
  nome_grupo_modelo?: string;
  descricao_grupo?: string | null;
  so_admins_enviam?: boolean;
  criar_lead?: boolean;
  funil_id?: number | null;
  estagio_id?: number | null;
  responsavel_id?: number | null;
  origem?: string | null;
  ativa?: boolean;
}

/** Chips que podem entrar numa campanha: usuários ativos da empresa, no QR Code. */
export async function chipsDaEmpresa(empresaId: number) {
  const r = await query(
    `SELECT id, nome, whatsapp_porta FROM usuarios
      WHERE empresa_id = $1 AND ativo = true AND whatsapp_porta IS NOT NULL
      ORDER BY nome`,
    [empresaId]
  );
  return r.rows
    .filter((u: any) => !ehPortaVirtual(Number(u.whatsapp_porta)))
    .map((u: any) => ({ id: u.id, nome: u.nome, porta: Number(u.whatsapp_porta) }));
}

async function validar(u: Usuario, e: EntradaCampanha, atualId?: number) {
  const nome = String(e.nome || '').trim().slice(0, 120);
  if (!nome) throw new ErroGrupos('Dê um nome para a campanha.');

  const slug = e.slug ? String(e.slug).trim().toLowerCase() : slugDe(nome);
  if (!slugValido(slug)) {
    throw new ErroGrupos('O endereço do link aceita letras minúsculas, números e hífen (3 a 60 caracteres).');
  }
  const outro = await query(`SELECT id FROM grupos_campanhas WHERE slug = $1 AND id <> $2`, [slug, atualId || 0]);
  if (outro.rows.length) throw new ErroGrupos('Esse endereço de link já está em uso. Escolha outro.');

  const limite = Math.round(Number(e.limite_por_grupo ?? 900));
  if (!(limite >= 5 && limite <= 1024)) throw new ErroGrupos('O limite por grupo vai de 5 a 1024 pessoas (o máximo do WhatsApp).');

  const permitidos = new Set((await chipsDaEmpresa(u.empresa_id)).map((c) => c.id));
  const chips = [...new Set((e.chips || []).map(Number))].filter((c) => permitidos.has(c));
  if (!chips.length) throw new ErroGrupos('Escolha pelo menos um WhatsApp (conectado por QR Code) para a campanha.');

  const modelo = String(e.nome_grupo_modelo || '').trim().slice(0, 100) || `${nome.slice(0, 80)} {{n}}`;

  let funilId: number | null = null;
  let estagioId: number | null = null;
  let responsavelId: number | null = null;
  if (e.criar_lead) {
    funilId = Number(e.funil_id) || null;
    if (!funilId) throw new ErroGrupos('Escolha o funil em que os leads vão entrar.');
    const f = await query(`SELECT 1 FROM funis WHERE id = $1 AND empresa_id = $2`, [funilId, u.empresa_id]);
    if (!f.rows.length) throw new ErroGrupos('Funil não encontrado.');
    estagioId = Number(e.estagio_id) || null;
    if (estagioId) {
      const s = await query(`SELECT 1 FROM estagios_funil WHERE id = $1 AND funil_id = $2`, [estagioId, funilId]);
      if (!s.rows.length) throw new ErroGrupos('A etapa escolhida não é deste funil.');
    }
    responsavelId = Number(e.responsavel_id) || null;
    if (responsavelId) {
      const r = await query(`SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true`, [responsavelId, u.empresa_id]);
      if (!r.rows.length) throw new ErroGrupos('Responsável não encontrado.');
    }
  }

  return {
    nome, slug, limite, chips, modelo,
    descricao: e.descricao_grupo ? String(e.descricao_grupo).slice(0, 2000) : null,
    soAdmins: e.so_admins_enviam !== false,
    criarGrupos: e.criar_grupos !== false,
    criarLead: !!e.criar_lead,
    funilId, estagioId, responsavelId,
    // leads.origem é VARCHAR(50)
    origem: (String(e.origem || '').trim() || nome).slice(0, 50),
    ativa: e.ativa !== false,
  };
}

const SELECT_CAMPANHA = `
  SELECT c.*,
         f.nome AS funil_nome,
         (SELECT count(*)::int FROM grupos_campanhas_grupos g WHERE g.campanha_id = c.id AND g.ativo) AS total_grupos,
         (SELECT coalesce(sum(g.participantes), 0)::int FROM grupos_campanhas_grupos g WHERE g.campanha_id = c.id AND g.ativo) AS total_participantes,
         (SELECT count(*)::int FROM grupos_campanhas_cliques k WHERE k.campanha_id = c.id) AS total_cliques,
         (SELECT count(*)::int FROM grupos_campanhas_eventos v WHERE v.campanha_id = c.id AND v.tipo = 'entrada') AS total_entradas,
         (SELECT count(*)::int FROM grupos_campanhas_eventos v WHERE v.campanha_id = c.id AND v.tipo = 'saida') AS total_saidas
    FROM grupos_campanhas c
    LEFT JOIN funis f ON f.id = c.funil_id`;

export async function listarCampanhas(u: Usuario) {
  const r = await query(`${SELECT_CAMPANHA} WHERE c.empresa_id = $1 ORDER BY c.ativa DESC, c.created_at DESC`, [u.empresa_id]);
  return r.rows;
}

async function daEmpresa(u: Usuario, id: number) {
  const r = await query(`SELECT * FROM grupos_campanhas WHERE id = $1 AND empresa_id = $2`, [id, u.empresa_id]);
  if (!r.rows[0]) throw new ErroGrupos('Campanha não encontrada.', 404);
  return r.rows[0];
}

export async function obterCampanha(u: Usuario, id: number) {
  await daEmpresa(u, id);
  const c = (await query(`${SELECT_CAMPANHA} WHERE c.id = $1`, [id])).rows[0];
  const grupos = await query(
    `SELECT g.*, us.nome AS chip_nome FROM grupos_campanhas_grupos g JOIN usuarios us ON us.id = g.usuario_id
      WHERE g.campanha_id = $1 ORDER BY g.ativo DESC, g.ordem, g.id`,
    [id]
  );
  return { ...c, grupos: grupos.rows };
}

export async function criarCampanha(u: Usuario, e: EntradaCampanha) {
  const v = await validar(u, e);
  const r = await query(
    `INSERT INTO grupos_campanhas
       (empresa_id, criado_por, nome, slug, limite_por_grupo, chips, criar_grupos, nome_grupo_modelo, descricao_grupo,
        so_admins_enviam, criar_lead, funil_id, estagio_id, responsavel_id, origem, ativa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [u.empresa_id, u.userId, v.nome, v.slug, v.limite, v.chips, v.criarGrupos, v.modelo, v.descricao,
     v.soAdmins, v.criarLead, v.funilId, v.estagioId, v.responsavelId, v.origem, v.ativa]
  );
  return r.rows[0];
}

export async function atualizarCampanha(u: Usuario, id: number, e: EntradaCampanha) {
  await daEmpresa(u, id);
  const v = await validar(u, e, id);
  await query(
    `UPDATE grupos_campanhas SET nome=$3, slug=$4, limite_por_grupo=$5, chips=$6, criar_grupos=$7, nome_grupo_modelo=$8,
            descricao_grupo=$9, so_admins_enviam=$10, criar_lead=$11, funil_id=$12, estagio_id=$13, responsavel_id=$14,
            origem=$15, ativa=$16, updated_at=now()
      WHERE id=$1 AND empresa_id=$2`,
    [id, u.empresa_id, v.nome, v.slug, v.limite, v.chips, v.criarGrupos, v.modelo, v.descricao,
     v.soAdmins, v.criarLead, v.funilId, v.estagioId, v.responsavelId, v.origem, v.ativa]
  );
  // Limite novo muda quem está cheio.
  await query(
    `UPDATE grupos_campanhas_grupos SET cheio = (participantes >= $2) WHERE campanha_id = $1`,
    [id, v.limite]
  );
}

/** Excluir a campanha não mexe nos grupos do WhatsApp: eles continuam existindo. */
export async function excluirCampanha(u: Usuario, id: number) {
  await daEmpresa(u, id);
  await query(`DELETE FROM grupos_campanhas WHERE id = $1`, [id]);
}

// ─── Grupos da campanha ───────────────────────────────────────────────────────

async function conviteDe(porta: number, grupoId: string): Promise<string> {
  const r = await instancia(porta).get(`/groups/${encodeURIComponent(grupoId)}/invite`, { timeout: 20000 });
  const code = r.data?.code;
  if (!code) throw new ErroGrupos('O WhatsApp não devolveu o link de convite do grupo.', 502);
  return String(code);
}

async function proximaOrdem(campanhaId: number): Promise<number> {
  const r = await query(`SELECT coalesce(max(ordem), 0) + 1 AS n FROM grupos_campanhas_grupos WHERE campanha_id = $1`, [campanhaId]);
  return Number(r.rows[0].n);
}

/**
 * Coloca na campanha um grupo que o chip já administra. Precisa ser admin: só admin
 * gera o link de convite, e é o link que a campanha distribui.
 */
export async function adicionarGrupoExistente(u: Usuario, campanhaId: number, chipId: number, grupoId: string) {
  const c = await daEmpresa(u, campanhaId);
  if (!String(grupoId || '').endsWith('@g.us')) throw new ErroGrupos('Escolha o grupo.');
  const chip = (await chipsDaEmpresa(u.empresa_id)).find((x) => x.id === Number(chipId));
  if (!chip) throw new ErroGrupos('Escolha um WhatsApp da empresa conectado por QR Code.');

  let grupo: any;
  try {
    const r = await instancia(chip.porta).get('/groups', { timeout: 30000 });
    grupo = (r.data?.groups || []).find((g: any) => g.id === grupoId);
  } catch (e) {
    throw new ErroGrupos(erroDaInstancia(e), 502);
  }
  if (!grupo) throw new ErroGrupos('Este WhatsApp não está nesse grupo.');
  if (!grupo.souAdmin) throw new ErroGrupos('Este WhatsApp precisa ser administrador do grupo para gerar o link de convite.');

  let convite: string;
  try { convite = await conviteDe(chip.porta, grupoId); } catch (e: any) {
    throw e instanceof ErroGrupos ? e : new ErroGrupos(erroDaInstancia(e), 502);
  }
  const participantes = Number(grupo.participantCount || 0);
  await query(
    `INSERT INTO grupos_campanhas_grupos
       (campanha_id, empresa_id, usuario_id, grupo_id, nome, convite, participantes, participantes_em, ordem, cheio)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8, $9)
     ON CONFLICT (campanha_id, grupo_id) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id, convite = EXCLUDED.convite, participantes = EXCLUDED.participantes,
           participantes_em = now(), ativo = true, cheio = EXCLUDED.cheio`,
    [c.id, u.empresa_id, chip.id, grupoId, grupo.subject || null, convite, participantes,
     await proximaOrdem(c.id), participantes >= c.limite_por_grupo]
  );
}

export async function alternarGrupo(u: Usuario, campanhaId: number, grupoLinhaId: number, ativo: boolean) {
  await daEmpresa(u, campanhaId);
  await query(`UPDATE grupos_campanhas_grupos SET ativo = $3 WHERE id = $1 AND campanha_id = $2`, [grupoLinhaId, campanhaId, ativo]);
}

/** Tira da campanha (o grupo continua existindo no WhatsApp). */
export async function removerGrupo(u: Usuario, campanhaId: number, grupoLinhaId: number) {
  await daEmpresa(u, campanhaId);
  await query(`DELETE FROM grupos_campanhas_grupos WHERE id = $1 AND campanha_id = $2`, [grupoLinhaId, campanhaId]);
}

/** Número de WhatsApp de cada chip (para colocar a equipe como admin do grupo novo). */
async function numeroDoChip(porta: number): Promise<string | null> {
  try {
    const s = await instancia(porta).get('/status', { timeout: 5000 });
    return s.data?.status === 'connected' && s.data?.numero ? String(s.data.numero) : null;
  } catch {
    return null;
  }
}

/**
 * Cria o próximo grupo da campanha pelo chip da vez. A equipe (os outros chips da
 * campanha) entra junto como admin — se um chip cair, outro segue administrando.
 *
 * Trava na própria linha (`criando_grupo_em`), não em advisory lock: são 3 processos
 * no cluster com pool de conexões, e lock de sessão pego numa conexão e solto noutra
 * não solta nada. A trava vence sozinha em 2 minutos se o processo morrer no meio.
 *
 * `forcar` é o botão da tela: cria mesmo com vaga sobrando e respeita só o limite
 * diário por chip.
 */
export async function abrirGrupo(campanhaId: number, motivo: string, forcar = false): Promise<{ grupo_id: string; convite: string } | null> {
  const trava = await query(
    `UPDATE grupos_campanhas SET criando_grupo_em = now()
      WHERE id = $1 AND ativa AND (criando_grupo_em IS NULL OR criando_grupo_em < now() - interval '2 minutes')
      RETURNING *`,
    [campanhaId]
  );
  const c = trava.rows[0];
  if (!c) return null;
  try {
    const existentes = (await query(`SELECT * FROM grupos_campanhas_grupos WHERE campanha_id = $1`, [campanhaId])).rows;
    // Quem pediu pode ter chegado atrasado: outro processo já abriu o grupo.
    if (!forcar && !precisaDeGrupoNovo(existentes, c.limite_por_grupo)) return null;

    const daCampanha = (await chipsDaEmpresa(c.empresa_id)).filter((x) => (c.chips || []).includes(x.id));
    const hoje = await query(
      `SELECT usuario_id, count(*)::int AS n FROM grupos_campanhas_grupos
        WHERE criado_pela_campanha AND created_at > now() - interval '24 hours' AND usuario_id = ANY($1::int[])
        GROUP BY usuario_id`,
      [daCampanha.map((x) => x.id)]
    );
    const criadosHoje: Record<number, number> = Object.fromEntries(hoje.rows.map((r: any) => [r.usuario_id, r.n]));
    const porChip: Record<number, number> = {};
    for (const g of existentes) porChip[g.usuario_id] = (porChip[g.usuario_id] || 0) + 1;
    const escolhido = chipDaVez(
      daCampanha.filter((x) => (criadosHoje[x.id] || 0) < LIMITE_GRUPOS_NOVOS_POR_DIA).map((x) => x.id),
      porChip
    );
    const chip = daCampanha.find((x) => x.id === escolhido);
    if (!chip) {
      console.warn(`${PREFIXO} campanha #${c.id}: nenhum chip pode criar grupo agora (limite de ${LIMITE_GRUPOS_NOVOS_POR_DIA}/dia ou sem chip)`);
      if (forcar) throw new ErroGrupos(`Os WhatsApps da campanha já criaram ${LIMITE_GRUPOS_NOVOS_POR_DIA} grupos nas últimas 24 horas, ou nenhum está conectado.`, 409);
      return null;
    }

    const equipe: string[] = [];
    for (const outro of daCampanha) {
      if (outro.id === chip.id) continue;
      const n = await numeroDoChip(outro.porta);
      if (n) equipe.push(n);
    }

    const nome = nomeDoGrupo(c.nome_grupo_modelo, existentes.length + 1);
    const r = await instancia(chip.porta).post('/groups/create', {
      subject: nome,
      description: c.descricao_grupo || undefined,
      announce: !!c.so_admins_enviam,
      participants: equipe,
      admins: equipe,
    }, { timeout: 60000 });
    const grupoId = r.data?.id;
    const convite = r.data?.invite;
    if (!grupoId || !convite) throw new Error('A instância não devolveu o grupo criado');

    await query(
      `INSERT INTO grupos_campanhas_grupos
         (campanha_id, empresa_id, usuario_id, grupo_id, nome, convite, participantes, participantes_em, ordem, criado_pela_campanha)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8, true)
       ON CONFLICT (campanha_id, grupo_id) DO NOTHING`,
      [c.id, c.empresa_id, chip.id, grupoId, nome, convite, 1 + equipe.length, await proximaOrdem(c.id)]
    );
    console.log(`${PREFIXO} campanha #${c.id}: grupo "${nome}" criado pelo chip ${chip.porta} (${motivo})`);
    return { grupo_id: grupoId, convite };
  } catch (e: any) {
    if (e instanceof ErroGrupos) throw e;
    console.error(`${PREFIXO} campanha #${campanhaId}: falha ao criar grupo:`, erroDaInstancia(e));
    if (forcar) throw new ErroGrupos(erroDaInstancia(e), 502);
    return null;
  } finally {
    await query(`UPDATE grupos_campanhas SET criando_grupo_em = NULL WHERE id = $1`, [campanhaId]).catch(() => {});
  }
}

/** Botão "Criar grupo agora" da tela. */
export async function criarGrupoAgora(u: Usuario, campanhaId: number) {
  const c = await daEmpresa(u, campanhaId);
  if (!c.ativa) throw new ErroGrupos('A campanha está pausada. Ative antes de criar grupo.');
  if (!c.chips?.length) throw new ErroGrupos('Escolha pelo menos um WhatsApp na campanha.');
  const criado = await abrirGrupo(campanhaId, 'pedido na tela', true);
  if (!criado) throw new ErroGrupos('Outro grupo desta campanha está sendo criado agora. Tente de novo em instantes.', 409);
  return criado;
}

// ─── O link público ───────────────────────────────────────────────────────────

/**
 * Resolve o link da campanha: o convite do grupo com vaga, registrando o clique.
 * Sem vaga e com criação automática, cria o grupo na hora (o visitante espera alguns
 * segundos — melhor que uma página de "lotado").
 */
export async function resolverLink(
  slug: string,
  utm: { source?: unknown; medium?: unknown; campaign?: unknown },
  contar: boolean
): Promise<{ convite: string | null; campanha: string | null }> {
  const c = (await query(`SELECT * FROM grupos_campanhas WHERE slug = $1`, [String(slug || '').toLowerCase()])).rows[0];
  if (!c || !c.ativa) return { convite: null, campanha: null };

  const grupos = (await query(`SELECT * FROM grupos_campanhas_grupos WHERE campanha_id = $1`, [c.id])).rows;
  let destino = grupoComVaga(grupos, c.limite_por_grupo);
  let convite: string | null = destino?.convite || null;
  let grupoId: string | null = destino?.grupo_id || null;
  if (!destino && c.criar_grupos) {
    const novo = await abrirGrupo(c.id, 'link sem vaga');
    if (novo) { convite = novo.convite; grupoId = novo.grupo_id; }
  } else if (destino && c.criar_grupos && precisaDeGrupoNovo(grupos, c.limite_por_grupo)) {
    // Ainda tem vaga, mas pouca: o próximo grupo nasce agora, em segundo plano.
    abrirGrupo(c.id, 'folga acabando').catch(() => {});
  }

  if (contar) {
    await query(
      `INSERT INTO grupos_campanhas_cliques (campanha_id, grupo_id, utm_source, utm_medium, utm_campaign) VALUES ($1,$2,$3,$4,$5)`,
      [c.id, grupoId, utmLimpo(utm.source), utmLimpo(utm.medium), utmLimpo(utm.campaign)]
    ).catch((e: any) => console.error(`${PREFIXO} clique:`, e?.message));
  }
  return { convite, campanha: c.nome };
}

// ─── Entradas e saídas (evento da instância) ─────────────────────────────────

async function estagioDeEntrada(funilId: number, preferido: number | null): Promise<number | null> {
  if (preferido) {
    const s = await query(`SELECT 1 FROM estagios_funil WHERE id = $1 AND funil_id = $2`, [preferido, funilId]);
    if (s.rows.length) return preferido;
  }
  const r = await query(
    `SELECT id FROM estagios_funil WHERE funil_id = $1 ORDER BY is_entrada DESC NULLS LAST, ordem ASC, id ASC LIMIT 1`,
    [funilId]
  );
  return r.rows[0]?.id || null;
}

async function nomeConhecido(numero: string, empresaId: number): Promise<string | null> {
  const r = await query(
    `SELECT nome FROM contatos_whatsapp WHERE empresa_id = $1 AND numero = $2 AND NOT coalesce(is_grupo, false)
       AND nome ~ '[A-Za-zÀ-ÿ]' LIMIT 1`,
    [empresaId, numero]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows[0]?.nome || null;
}

async function leadDaEntrada(c: any, grupoNome: string | null, numero: string, nome: string | null): Promise<number | null> {
  if (!c.criar_lead || !c.funil_id || !telefonePlausivel(numero)) return null;
  const carimbo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const nota = `Campanha de grupo: ${c.nome}${grupoNome ? `\nGrupo: ${grupoNome}` : ''}`;

  const dup = await leadsService.telefoneExiste(numero, c.empresa_id, undefined, c.funil_id);
  if (dup.existe && dup.lead_id) {
    await query(
      `UPDATE leads SET notas = concat_ws(E'\\n\\n', nullif(notas, ''), $2::text), updated_at = now() WHERE id = $1`,
      [dup.lead_id, `[${carimbo}] Entrou no grupo — ${nota}`]
    );
    return dup.lead_id;
  }
  const estagio = await estagioDeEntrada(c.funil_id, c.estagio_id);
  if (!estagio) return null;
  const dono = c.responsavel_id || c.criado_por;
  try {
    const lead = await leadsService.create(c.empresa_id, dono, {
      funil_id: c.funil_id,
      estagio_id: estagio,
      responsavel_id: dono,
      nome: (nome || await nomeConhecido(numero, c.empresa_id) || numero).slice(0, 200),
      telefone: numero,
      origem: c.origem || c.nome.slice(0, 50),
      notas: nota,
    } as any, false);
    return lead.id;
  } catch (e: any) {
    if (/Já existe um lead/i.test(e?.message || '')) return null; // corrida entre dois eventos
    throw e;
  }
}

/**
 * Evento `group_participants` da instância. Conta só quando o dono da porta é o chip
 * que administra o grupo na campanha. Devolve quantas pessoas foram registradas.
 */
export async function registrarMovimento(
  donoId: number, empresaId: number, grupoId: string, acao: string, participantes: any[]
): Promise<number> {
  const tipo = acao === 'add' ? 'entrada' : acao === 'remove' ? 'saida' : null;
  if (!tipo) return 0;
  const linhas = await query(
    `SELECT g.*, c.nome AS campanha_nome, c.limite_por_grupo, c.criar_lead, c.funil_id, c.estagio_id, c.responsavel_id,
            c.criado_por, c.origem, c.criar_grupos, c.ativa AS campanha_ativa
       FROM grupos_campanhas_grupos g JOIN grupos_campanhas c ON c.id = g.campanha_id
      WHERE g.empresa_id = $1 AND g.grupo_id = $2 AND g.usuario_id = $3`,
    [empresaId, grupoId, donoId]
  );
  let n = 0;
  for (const g of linhas.rows) {
    const c = {
      id: g.campanha_id, empresa_id: empresaId, nome: g.campanha_nome, criar_lead: g.criar_lead, funil_id: g.funil_id,
      estagio_id: g.estagio_id, responsavel_id: g.responsavel_id, criado_por: g.criado_por, origem: g.origem,
    };
    for (const p of participantes || []) {
      const jid = String(p?.jid || '');
      if (!/@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) continue;
      const numero = jid.endsWith('@lid') ? null : jid.replace(/@.*$/, '');
      let leadId: number | null = null;
      if (tipo === 'entrada' && numero && g.campanha_ativa) {
        leadId = await leadDaEntrada(c, g.nome, numero, p?.nome || null).catch((e: any) => {
          console.error(`${PREFIXO} lead da entrada (${numero}):`, e?.message);
          return null;
        });
      }
      await query(
        `INSERT INTO grupos_campanhas_eventos (campanha_id, empresa_id, grupo_id, participante_jid, numero, nome, tipo, lead_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [g.campanha_id, empresaId, grupoId, jid, numero, p?.nome ? String(p.nome).slice(0, 255) : null, tipo, leadId]
      );
      n++;
    }
    const delta = tipo === 'entrada' ? n : -n;
    const atual = await query(
      `UPDATE grupos_campanhas_grupos SET participantes = greatest(0, participantes + $2),
              cheio = (greatest(0, participantes + $2) >= $3)
        WHERE id = $1 RETURNING participantes`,
      [g.id, delta, g.limite_por_grupo]
    );
    if (tipo === 'entrada' && g.criar_grupos && g.campanha_ativa) {
      const todos = (await query(`SELECT * FROM grupos_campanhas_grupos WHERE campanha_id = $1`, [g.campanha_id])).rows;
      if (precisaDeGrupoNovo(todos, g.limite_por_grupo)) {
        abrirGrupo(g.campanha_id, `grupo "${g.nome}" com ${atual.rows[0]?.participantes} pessoas`).catch(() => {});
      }
    }
  }
  return n;
}

/**
 * Leitura periódica (job): a contagem por evento se perde num restart da instância,
 * então de tempos em tempos a lista de grupos do chip é a verdade.
 */
export async function sincronizarContagens(): Promise<void> {
  const r = await query(
    `SELECT g.id, g.grupo_id, g.usuario_id, g.campanha_id, c.limite_por_grupo, c.criar_grupos, u.whatsapp_porta
       FROM grupos_campanhas_grupos g
       JOIN grupos_campanhas c ON c.id = g.campanha_id AND c.ativa
       JOIN usuarios u ON u.id = g.usuario_id
      WHERE g.ativo AND (g.participantes_em IS NULL OR g.participantes_em < now() - interval '10 minutes')`
  );
  const porPorta = new Map<number, any[]>();
  for (const l of r.rows) {
    const p = Number(l.whatsapp_porta);
    if (!p || ehPortaVirtual(p)) continue;
    if (!porPorta.has(p)) porPorta.set(p, []);
    porPorta.get(p)!.push(l);
  }
  const campanhasTocadas = new Set<number>();
  for (const [porta, linhas] of porPorta) {
    let grupos: any[];
    try {
      grupos = (await instancia(porta).get('/groups', { timeout: 30000 })).data?.groups || [];
    } catch {
      continue; // chip fora do ar: fica para a próxima
    }
    for (const l of linhas) {
      const g = grupos.find((x: any) => x.id === l.grupo_id);
      if (!g) continue; // o chip saiu do grupo: a tela mostra a contagem antiga, e o dono decide
      await query(
        `UPDATE grupos_campanhas_grupos SET participantes = $2, participantes_em = now(), cheio = ($2 >= $3) WHERE id = $1`,
        [l.id, Number(g.participantCount || 0), l.limite_por_grupo]
      );
      if (l.criar_grupos) campanhasTocadas.add(l.campanha_id);
    }
  }
  for (const id of campanhasTocadas) {
    const c = (await query(`SELECT limite_por_grupo FROM grupos_campanhas WHERE id = $1`, [id])).rows[0];
    const todos = (await query(`SELECT * FROM grupos_campanhas_grupos WHERE campanha_id = $1`, [id])).rows;
    if (c && todos.length && precisaDeGrupoNovo(todos, c.limite_por_grupo)) await abrirGrupo(id, 'sincronização');
  }
}

// ─── Painel ───────────────────────────────────────────────────────────────────

const DIA_BRT = `(created_at AT TIME ZONE 'America/Sao_Paulo')::date`;

export async function painel(u: Usuario, id: number, dias = 30) {
  await daEmpresa(u, id);
  const janela = Math.min(180, Math.max(1, Math.round(dias)));
  const [porDia, porUtm, porGrupo, leads] = await Promise.all([
    query(
      `WITH d AS (SELECT generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int - 1),
                                         (now() AT TIME ZONE 'America/Sao_Paulo')::date, '1 day')::date AS dia)
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
              (SELECT count(*)::int FROM grupos_campanhas_cliques k WHERE k.campanha_id = $1 AND ${DIA_BRT.replace('created_at', 'k.created_at')} = d.dia) AS cliques,
              (SELECT count(*)::int FROM grupos_campanhas_eventos v WHERE v.campanha_id = $1 AND v.tipo = 'entrada' AND ${DIA_BRT.replace('created_at', 'v.created_at')} = d.dia) AS entradas,
              (SELECT count(*)::int FROM grupos_campanhas_eventos v WHERE v.campanha_id = $1 AND v.tipo = 'saida' AND ${DIA_BRT.replace('created_at', 'v.created_at')} = d.dia) AS saidas
         FROM d ORDER BY d.dia`,
      [id, janela]
    ),
    query(
      `SELECT coalesce(utm_source, '(sem utm)') AS origem, count(*)::int AS cliques
         FROM grupos_campanhas_cliques WHERE campanha_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      [id]
    ),
    query(
      `SELECT g.grupo_id, g.nome,
              count(*) FILTER (WHERE v.tipo = 'entrada')::int AS entradas,
              count(*) FILTER (WHERE v.tipo = 'saida')::int AS saidas
         FROM grupos_campanhas_grupos g
         LEFT JOIN grupos_campanhas_eventos v ON v.campanha_id = g.campanha_id AND v.grupo_id = g.grupo_id
        WHERE g.campanha_id = $1 GROUP BY g.grupo_id, g.nome, g.ordem ORDER BY g.ordem`,
      [id]
    ),
    query(
      `SELECT count(DISTINCT lead_id)::int AS n FROM grupos_campanhas_eventos WHERE campanha_id = $1 AND lead_id IS NOT NULL`,
      [id]
    ),
  ]);
  return { porDia: porDia.rows, porUtm: porUtm.rows, porGrupo: porGrupo.rows, leads: leads.rows[0].n };
}

/** Porta QR de um chip (para as mensagens da campanha, grupo a grupo). */
export async function portaDoChip(usuarioId: number): Promise<number | null> {
  const p = await portaDo(usuarioId);
  return p && !ehPortaVirtual(p) ? p : null;
}
