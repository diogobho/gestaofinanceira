import { query } from '../../../config/database';
import { contatosService } from '../contatos/contatos.service';
import { tarefasService } from '../tarefas/tarefas.service';
import { leadsService } from '../leads/leads.service';
import { aplicarVariaveisLead } from '../_shared/agendamento';
import { RegraResposta, escolherRegra, problemaNasRegras, dataDaqui, regraDaRespostaEscrita, normalizar } from './regras';

/**
 * Respostas por botão (migration 094). Tabelas do gestao_user — o serviço cria sozinho
 * (`estagios_funil` é do postgres e não ganha coluna).
 */
let tabelasProntas: Promise<unknown> | null = null;
function garantirTabelas() {
  tabelasProntas ??= query(
    `CREATE TABLE IF NOT EXISTS respostas_botao (
       id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, estagio_id INTEGER NOT NULL,
       origem VARCHAR(50), botao VARCHAR(60) NOT NULL, passos JSONB NOT NULL DEFAULT '[]',
       tarefa_dias INTEGER, ativa BOOLEAN NOT NULL DEFAULT true, ordem INTEGER NOT NULL DEFAULT 0,
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now());
     CREATE INDEX IF NOT EXISTS idx_respostas_botao_estagio ON respostas_botao (estagio_id);
     CREATE TABLE IF NOT EXISTS respostas_botao_aplicadas (
       regra_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (regra_id, lead_id));
     ALTER TABLE respostas_botao ADD COLUMN IF NOT EXISTS mover_para_estagio_id INTEGER;
     ALTER TABLE respostas_botao ADD COLUMN IF NOT EXISTS aceita_texto BOOLEAN NOT NULL DEFAULT false`
  ).catch((e) => { tabelasProntas = null; throw e; });
  return tabelasProntas;
}

export class ErroRespostas extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function estagioDaEmpresa(estagioId: number, empresaId: number): Promise<number> {
  const r = await query(
    `SELECT e.id, e.funil_id FROM estagios_funil e JOIN funis f ON f.id = e.funil_id WHERE e.id = $1 AND f.empresa_id = $2`,
    [estagioId, empresaId]
  );
  if (!r.rows.length) throw new ErroRespostas('Estágio não encontrado.', 404);
  return r.rows[0].funil_id;
}

export async function listar(empresaId: number, estagioId: number): Promise<RegraResposta[]> {
  await garantirTabelas();
  await estagioDaEmpresa(estagioId, empresaId);
  const r = await query(
    `SELECT id, origem, botao, passos, tarefa_dias, mover_para_estagio_id, aceita_texto, ativa FROM respostas_botao
      WHERE empresa_id = $1 AND estagio_id = $2 ORDER BY ordem, id`,
    [empresaId, estagioId]
  );
  return r.rows;
}

/**
 * A etapa tem fluxo de respostas PRÓPRIO para a origem deste lead? (06/10/2026, funil
 * oficial da Escola: o Clube do Livro e o Desafio, na Tentativa, seguem conforme a
 * resposta — "Já sei", "Quero entender" — e não pelo "ao responder, vai para Conexão".)
 * Regra sem origem não conta: ela é a resposta genérica, que convive com o mover da etapa.
 */
export async function origemTemFluxoDeRespostas(estagioId: number, origemLead: string | null): Promise<boolean> {
  const o = normalizar(origemLead);
  if (!o) return false;
  const r = await query(
    `SELECT origem FROM respostas_botao WHERE estagio_id = $1 AND ativa AND coalesce(origem, '') <> ''`,
    [estagioId]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows.some((x: any) => normalizar(x.origem) === o);
}

/** Troca o conjunto inteiro de regras do estágio (a tela edita a lista toda de uma vez). */
export async function salvar(empresaId: number, estagioId: number, entrada: any[]) {
  await garantirTabelas();
  const funilId = await estagioDaEmpresa(estagioId, empresaId);
  const regras: RegraResposta[] = (Array.isArray(entrada) ? entrada : []).map((r: any) => ({
    origem: String(r?.origem ?? '').trim() || null,
    botao: String(r?.botao ?? '').trim(),
    passos: (Array.isArray(r?.passos) ? r.passos : []).map((p: any) => ({
      texto: String(p?.texto ?? '').trim() || null,
      media_url: p?.media_url || null,
      media_mimetype: p?.media_mimetype || null,
      media_filename: p?.media_filename || null,
      botoes: Array.isArray(p?.botoes) && p.botoes.length ? p.botoes.map((b: any) => String(b ?? '').trim()) : null,
    })),
    tarefa_dias: r?.tarefa_dias === '' || r?.tarefa_dias == null ? null : Number(r.tarefa_dias),
    mover_para_estagio_id: Number(r?.mover_para_estagio_id) > 0 ? Number(r.mover_para_estagio_id) : null,
    aceita_texto: r?.aceita_texto === true,
    ativa: r?.ativa !== false,
  }));
  const problema = problemaNasRegras(regras);
  if (problema) throw new ErroRespostas(problema);
  // "Mover para" só dentro do mesmo funil — e nunca para a própria etapa.
  for (const r of regras) {
    if (!r.mover_para_estagio_id) continue;
    if (r.mover_para_estagio_id === estagioId) throw new ErroRespostas(`Regra "${r.botao}": escolha outra etapa para mover.`);
    const ok = await query(`SELECT 1 FROM estagios_funil WHERE id = $1 AND funil_id = $2`, [r.mover_para_estagio_id, funilId]);
    if (!ok.rows.length) throw new ErroRespostas(`Regra "${r.botao}": a etapa para mover tem que ser deste funil.`);
  }
  // Anexo tem que ser desta empresa: o caminho do upload carrega o id dela.
  for (const r of regras) for (const p of r.passos) {
    if (p.media_url && !p.media_url.startsWith(`/uploads/whatsapp/${empresaId}/`)) throw new ErroRespostas('Anexo de outra conta.');
  }

  // Regra que continua (mesmo botão + origem) mantém o id — e com ele o registro de quem
  // já recebeu, para editar o texto não reenviar a sequência a ninguém.
  const atuais = (await query(`SELECT id, origem, botao FROM respostas_botao WHERE estagio_id = $1 AND empresa_id = $2`, [estagioId, empresaId])).rows;
  const chave = (o: any, b: any) => `${String(o ?? '').toLowerCase()}|${String(b).toLowerCase()}`;
  const porChave = new Map(atuais.map((a: any) => [chave(a.origem, a.botao), a.id]));
  const mantidos: number[] = [];
  for (const [i, r] of regras.entries()) {
    const id = porChave.get(chave(r.origem, r.botao));
    if (id) {
      await query(
        `UPDATE respostas_botao SET origem=$2, botao=$3, passos=$4, tarefa_dias=$5, ativa=$6, ordem=$7, mover_para_estagio_id=$8, aceita_texto=$9 WHERE id=$1`,
        [id, r.origem, r.botao, JSON.stringify(r.passos), r.tarefa_dias || null, r.ativa, i, r.mover_para_estagio_id || null, !!r.aceita_texto]
      );
      mantidos.push(id);
    } else {
      const n = await query(
        `INSERT INTO respostas_botao (empresa_id, estagio_id, origem, botao, passos, tarefa_dias, ativa, ordem, mover_para_estagio_id, aceita_texto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [empresaId, estagioId, r.origem, r.botao, JSON.stringify(r.passos), r.tarefa_dias || null, r.ativa, i, r.mover_para_estagio_id || null, !!r.aceita_texto]
      );
      mantidos.push(n.rows[0].id);
    }
  }
  await query(
    `DELETE FROM respostas_botao WHERE estagio_id = $1 AND empresa_id = $2 AND NOT (id = ANY($3::int[]))`,
    [estagioId, empresaId, mantidos]
  );
  return listar(empresaId, estagioId);
}

/**
 * Resposta ESCRITA (05/10/2026): se a etapa atual do lead tem regra com `aceita_texto`
 * e o texto é o do botão ("sim", "Sim!"), aplica como se fosse o clique. Nunca lança.
 */
export async function aplicarRespostaEscrita(leadId: number, empresaId: number, texto: string): Promise<void> {
  try {
    await garantirTabelas();
    const lead = (await query(`SELECT estagio_id, origem FROM leads WHERE id = $1 AND empresa_id = $2`, [leadId, empresaId])).rows[0];
    if (!lead?.estagio_id) return;
    const regras = (await query(
      `SELECT id, origem, botao, passos, tarefa_dias, mover_para_estagio_id, aceita_texto, ativa FROM respostas_botao
        WHERE empresa_id = $1 AND estagio_id = $2 AND aceita_texto AND ativa`,
      [empresaId, lead.estagio_id]
    )).rows as (RegraResposta & { id: number })[];
    if (!regras.length) return;
    const regra = regraDaRespostaEscrita(regras, lead.origem, texto);
    if (regra) await aplicarCliqueDeBotao(leadId, empresaId, regra.botao);
  } catch (e: any) {
    console.error(`[RespostaBotao] resposta escrita do lead #${leadId}:`, e?.message || e);
  }
}

const PAUSA_ENTRE_MENSAGENS_MS = 2500;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O lead clicou num botão. Se o estágio em que ele está AGORA (depois da automação de
 * resposta, que já o moveu) tem regra para esse botão e a origem dele, envia a sequência
 * pelo número do responsável e cria a tarefa de FUP. Cada regra vale uma vez por lead:
 * clicar de novo não repete — a garantia é do banco (3 instâncias no cluster).
 * Nunca lança: roda depois de a mensagem já estar gravada.
 */
export async function aplicarCliqueDeBotao(leadId: number, empresaId: number, botao: string): Promise<void> {
  try {
    await garantirTabelas();
    const lead = (await query(
      `SELECT l.*, u.nome AS responsavel_nome FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id
        WHERE l.id = $1 AND l.empresa_id = $2`,
      [leadId, empresaId]
    )).rows[0];
    if (!lead?.estagio_id) return;
    const regras = (await query(
      `SELECT id, origem, botao, passos, tarefa_dias, mover_para_estagio_id, aceita_texto, ativa FROM respostas_botao WHERE empresa_id = $1 AND estagio_id = $2`,
      [empresaId, lead.estagio_id]
    )).rows as (RegraResposta & { id: number })[];
    const regra = escolherRegra(regras, lead.origem, botao);
    if (!regra) return;

    const marcou = await query(
      `INSERT INTO respostas_botao_aplicadas (regra_id, lead_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING regra_id`,
      [regra.id, leadId]
    );
    if (!marcou.rowCount) return;

    const remetente = lead.responsavel_id || lead.usuario_id;

    // Move ANTES de mandar a sequência: se ela traz outra pergunta com botões, a resposta
    // tem que cair nas regras da etapa nova — e a pessoa pode tocar em segundos.
    let movido = '';
    if (regra.mover_para_estagio_id && regra.mover_para_estagio_id !== lead.estagio_id) {
      try {
        const destino = (await query(
          `SELECT e.nome FROM estagios_funil e JOIN funis f ON f.id = e.funil_id WHERE e.id = $1 AND f.empresa_id = $2`,
          [regra.mover_para_estagio_id, empresaId]
        )).rows[0];
        if (destino) {
          await leadsService.moverPorAutomacao(leadId, empresaId, remetente, regra.mover_para_estagio_id,
            `Movido para "${destino.nome}" pelo botão "${botao}"`, { trigger: 'resposta_botao', botao });
          movido = `, movido para "${destino.nome}"`;
        }
      } catch (e: any) {
        console.error(`[RespostaBotao] lead #${leadId}: mover falhou:`, e?.message || e);
      }
    }

    let contatoId = lead.contato_whatsapp_id;
    if (!contatoId) contatoId = await contatosService.resolverContatoParaLead(leadId, remetente, empresaId);

    let enviadas = 0;
    const falhas: string[] = [];
    if (contatoId) {
      for (const [i, p] of (regra.passos || []).entries()) {
        if (i > 0) await esperar(PAUSA_ENTRE_MENSAGENS_MS);
        const texto = aplicarVariaveisLead(p.texto || '', lead).trim();
        try {
          if (p.media_url) {
            // Áudio não tem legenda no WhatsApp: o texto, se houver, sai logo depois.
            const audio = String(p.media_mimetype || '').startsWith('audio/');
            await contatosService.enviarMediaArmazenada(
              remetente, empresaId, contatoId, p.media_url, p.media_mimetype || 'application/octet-stream',
              p.media_filename || 'arquivo', audio ? undefined : (texto || undefined), leadId, 'followup'
            ).then((r) => { if (!r.success) throw new Error(r.error || 'falha no envio'); });
            if (audio && texto) {
              await esperar(PAUSA_ENTRE_MENSAGENS_MS);
              await contatosService.enviarMensagemOuFalhar(remetente, empresaId, contatoId, texto, leadId, 'followup');
            }
          } else if (texto) {
            await contatosService.enviarMensagemOuFalhar(remetente, empresaId, contatoId, texto, leadId, 'followup', p.botoes);
          }
          enviadas++;
        } catch (e: any) {
          falhas.push(`mensagem ${i + 1}: ${e?.message || e}`);
          break; // sequência fora de ordem é pior que sequência interrompida
        }
      }
    } else if (regra.passos?.length) {
      falhas.push('lead sem contato de WhatsApp');
    }

    if (regra.tarefa_dias) {
      await tarefasService.create(empresaId, remetente, {
        lead_id: leadId,
        responsavel_id: remetente,
        tipo: 'follow_up',
        titulo: 'FUP',
        descricao: `Respondeu "${botao}" no botão. Retomar a conversa.`,
        data_vencimento: dataDaqui(Number(regra.tarefa_dias)),
      } as any);
    }

    await query(
      `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados) VALUES ($1,$2,$3,'atualizacao',$4,$5)`,
      [leadId, remetente, empresaId,
       `Resposta automática ao botão "${botao}": ${enviadas} de ${(regra.passos || []).length} mensagem(ns)` +
         (regra.tarefa_dias ? `, FUP em ${regra.tarefa_dias} dia(s)` : '') + movido + (falhas.length ? ` — falhou: ${falhas.join('; ')}` : ''),
       JSON.stringify({ trigger: 'resposta_botao', regra_id: regra.id, botao, enviadas, falhas })]
    ).catch((e) => console.error('[RespostaBotao] atividade:', e?.message));
    console.log(`[RespostaBotao] lead #${leadId} botão "${botao}" → regra #${regra.id}: ${enviadas} enviada(s)${falhas.length ? `, falhas: ${falhas.join('; ')}` : ''}`);
  } catch (e: any) {
    console.error(`[RespostaBotao] lead #${leadId}:`, e?.message || e);
  }
}
