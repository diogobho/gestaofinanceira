/**
 * Cadência de entrada por origem (06/10/2026) — pedido do dono da Panteras para o funil
 * Escola (24): lead do Clube do Livro e do Desafio 52 semanas.
 *
 *  - Entrada de Leads: recebeu o primeiro contato (a boas-vindas do grupo, ou mensagem
 *    nossa) e RESPONDEU → Conexão, com tarefa de follow-up 1 semana depois da resposta.
 *    Não respondeu em `semRespostaHoras` → Tentativa de Contato, com tarefa.
 *  - Tentativa de Contato: respondeu depois de entrar nela → Conexão, com a tarefa. O
 *    webhook já faz isso quando acha o lead (`estagio_apos_resposta_id`), mas não acha o
 *    card sem contato vinculado — o do grupo nasce só com o telefone.
 *  - Conexão e Tentativa: card sem tarefa pendente ganha uma. Entrada de Leads sem nenhum
 *    contato (o card do SendFlow, sem boas-vindas no privado) ganha a de primeiro contato.
 *
 * A data da tarefa conta da resposta (ou do contato), não de hoje: o que está atrasado
 * já aparece acumulado na lista do responsável. Tarefa é sempre `follow_up` — `reuniao`
 * dispara lembrete para o lead (`reuniao-lembretes-scheduler`).
 *
 *  - Responsável único é quem enviou a boas-vindas: ela sai pelo chip do dono da automação
 *    (Hellen) e o card podia ser de outro (chip 2 da Jéssica). Passa o card para quem enviou,
 *    se a boas-vindas foi o 1º contato e o responsável atual nunca mandou mensagem ao lead.
 *
 * De quebra, vincula o contato do WhatsApp ao card que não tinha (a conversa passa a
 * aparecer nele) e dá nome ao card que é só telefone, quando o contato tem nome.
 * Quem roda é `jobs/cadencia-entrada-scheduler.ts`.
 */

import { query } from '../../../config/database';
import { leadsService } from '../leads/leads.service';
import { nomeDoPush, nomeEhSoTelefone } from '../_shared/nome';

export interface RegraEntrada {
  empresaId: number;
  funilId: number;
  entrada: number;
  tentativa: number;
  conexao: number;
  origens: RegExp;
  semRespostaHoras: number;
  tarefaConexaoDias: number;
  tarefaTentativaDias: number;
}

export const REGRAS_ENTRADA: RegraEntrada[] = [
  {
    empresaId: 5, funilId: 24, entrada: 208, tentativa: 209, conexao: 310,
    origens: /^\s*(clube\s*do\s*livro|desafio\s*52)/i,
    semRespostaHoras: 24, tarefaConexaoDias: 7, tarefaTentativaDias: 2,
  },
];

export interface SituacaoLead {
  estagioId: number;
  primeiroContato: Date | null;
  /** Primeira mensagem do lead depois do primeiro contato (ou qualquer uma, se ele chamou antes). */
  resposta: Date | null;
  /** Quando entrou na etapa atual (última mudança para ela), ou null se nasceu nela. */
  entrouNaEtapa: Date | null;
  tarefaPendente: boolean;
  criadoEm: Date;
}

export interface Decisao {
  mover?: number;
  tarefa?: { titulo: string; vencimento: Date };
}

const DIA = 24 * 3600_000;

/** 09:00 de Brasília (12:00 UTC) do dia `dias` depois de `base` — a convenção das tarefas da base. */
export function vencimento(base: Date, dias: number): Date {
  const d = new Date(base.getTime() + dias * DIA);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

export function decidir(s: SituacaoLead, r: RegraEntrada, agora: Date): Decisao {
  const tarefaConexao = (base: Date) => ({
    titulo: 'Follow-up — 1 semana depois da resposta', vencimento: vencimento(base, r.tarefaConexaoDias),
  });
  const tarefaTentativa = (base: Date) => ({
    titulo: 'Tentativa de contato — não respondeu a boas-vindas', vencimento: vencimento(base, r.tarefaTentativaDias),
  });

  if (s.estagioId === r.entrada) {
    if (s.resposta) return { mover: r.conexao, tarefa: s.tarefaPendente ? undefined : tarefaConexao(s.resposta) };
    if (s.primeiroContato && agora.getTime() - s.primeiroContato.getTime() >= r.semRespostaHoras * 3600_000) {
      return { mover: r.tentativa, tarefa: s.tarefaPendente ? undefined : tarefaTentativa(s.primeiroContato) };
    }
    if (!s.primeiroContato && !s.tarefaPendente) {
      return { tarefa: { titulo: 'Primeiro contato — ainda não abordado', vencimento: vencimento(s.criadoEm, 0) } };
    }
    return {};
  }

  if (s.estagioId === r.tentativa) {
    const desde = s.entrouNaEtapa ?? s.primeiroContato;
    if (s.resposta && desde && s.resposta > desde) {
      return { mover: r.conexao, tarefa: s.tarefaPendente ? undefined : tarefaConexao(s.resposta) };
    }
    if (!s.tarefaPendente && desde) return { tarefa: tarefaTentativa(desde) };
    return {};
  }

  if (s.estagioId === r.conexao && !s.tarefaPendente) {
    const base = s.resposta ?? s.entrouNaEtapa ?? s.primeiroContato;
    if (base) return { tarefa: tarefaConexao(base) };
  }
  return {};
}

// Telefone do card e a variante com/sem o 9º dígito (BR): o contato pode estar gravado
// de um jeito e o card de outro.
const TEL = `regexp_replace(coalesce(l.telefone, ''), '\\D', '', 'g')`;
const TEL_ALT = `CASE WHEN length(${TEL}) = 13 AND ${TEL} LIKE '55%' THEN substr(${TEL}, 1, 4) || substr(${TEL}, 6)
                      WHEN length(${TEL}) = 12 AND ${TEL} LIKE '55%' THEN substr(${TEL}, 1, 4) || '9' || substr(${TEL}, 5)
                      ELSE ${TEL} END`;

/** `simular`: só conta e devolve o que faria, sem gravar nada. */
export async function aplicarCadenciaEntrada(r: RegraEntrada, agora = new Date(), simular = false) {
  const leads = await query(
    `WITH l0 AS (
       SELECT l.id, l.nome, l.origem, l.created_at, l.estagio_id, l.responsavel_id, l.contato_whatsapp_id,
              ${TEL} AS tel, ${TEL_ALT} AS tel_alt
         FROM leads l
        WHERE l.empresa_id = $1 AND l.funil_id = $2 AND NOT l.arquivado
          AND l.estagio_id = ANY($3::int[])
     ),
     ct AS (
       SELECT l0.id AS lead_id, c.id AS contato_id, c.nome, c.nome_push
         FROM l0 JOIN contatos_whatsapp c ON c.empresa_id = $1 AND NOT coalesce(c.is_grupo, false)
          AND (c.id = l0.contato_whatsapp_id OR (l0.tel <> '' AND c.numero IN (l0.tel, l0.tel_alt)))
     ),
     msg AS (
       SELECT ct.lead_id, h.direcao, h.enviado_at, h.usuario_id, h.origem
         FROM ct JOIN historico_mensagens h ON h.contato_whatsapp_id = ct.contato_id
        WHERE h.grupo_whatsapp_id IS NULL AND NOT h.copia_indevida
          AND (h.direcao = 'entrada' OR h.erro IS NULL)
     ),
     bv AS (
       SELECT DISTINCT ON (l0.id) l0.id AS lead_id, f.processado_em AT TIME ZONE 'UTC' AS t, ag.usuario_id
         FROM l0 JOIN grupos_boas_vindas_fila f
           ON f.empresa_id = $1 AND f.status = 'enviado'
          AND split_part(f.participante_jid, '@', 1) IN (l0.tel, l0.tel_alt)
         JOIN automacoes_grupo ag ON ag.id = f.automacao_id
        WHERE l0.tel <> ''
        ORDER BY l0.id, f.processado_em
     ),
     contato AS (
       SELECT l0.id AS lead_id,
              LEAST((SELECT MIN(enviado_at) FROM msg WHERE msg.lead_id = l0.id AND direcao = 'saida'),
                    (SELECT t FROM bv WHERE bv.lead_id = l0.id)) AS primeiro
         FROM l0
     )
     SELECT l0.*, contato.primeiro AS primeiro_contato,
            -- Quem abordou: o dono da boas-vindas do grupo, se ela foi o PRIMEIRO contato deste
            -- card (depois que ele nasceu). Mensagem de gente já passa o card pelos caminhos de
            -- envio (transferirPropriedadeSeDiferente); a 1ª saída do histórico não entra aqui
            -- porque a importação da coexistência traz conversa do WhatsApp Business da Débora.
            -- O remetente real: desde 06/10 a boas-vindas sai pelo chip do responsável e vai
            -- para o histórico com o usuario_id de quem mandou; antes disso, era o dono da automação.
            (SELECT coalesce((SELECT m2.usuario_id FROM msg m2 WHERE m2.lead_id = l0.id AND m2.direcao = 'saida'
                                 AND m2.origem = 'disparo' AND m2.enviado_at BETWEEN bv.t - interval '3 minutes' AND bv.t + interval '3 minutes'
                               ORDER BY m2.enviado_at LIMIT 1), bv.usuario_id)
               FROM bv JOIN usuarios u ON u.id = bv.usuario_id AND u.empresa_id = $1 AND u.ativo
              WHERE bv.lead_id = l0.id AND bv.t >= l0.created_at - interval '10 minutes'
                AND NOT EXISTS (SELECT 1 FROM msg WHERE msg.lead_id = l0.id AND msg.direcao = 'saida'
                                   AND msg.enviado_at >= l0.created_at - interval '10 minutes'
                                   AND msg.enviado_at < bv.t - interval '1 minute')) AS quem_abordou,
            EXISTS (SELECT 1 FROM msg WHERE msg.lead_id = l0.id AND direcao = 'saida'
                       AND msg.usuario_id = l0.responsavel_id AND msg.origem IS DISTINCT FROM 'disparo') AS responsavel_falou,
            (SELECT MIN(enviado_at) FROM msg WHERE msg.lead_id = l0.id AND direcao = 'entrada'
                AND enviado_at >= coalesce(contato.primeiro, '-infinity'::timestamp)) AS resposta,
            (SELECT MAX(a.created_at) FROM atividades_lead a
              WHERE a.lead_id = l0.id AND a.tipo = 'mudanca_estagio'
                -- moverPorAutomacao grava novo_estagio_id; a tela, estagio_novo_id.
                AND COALESCE(a.dados->>'estagio_novo_id', a.dados->>'novo_estagio_id')::int = l0.estagio_id) AS entrou_na_etapa,
            EXISTS (SELECT 1 FROM tarefas_lead t WHERE t.lead_id = l0.id AND t.status = 'pendente') AS tarefa_pendente,
            (SELECT ct.contato_id FROM ct WHERE ct.lead_id = l0.id
              ORDER BY (ct.contato_id = l0.contato_whatsapp_id) DESC NULLS LAST, ct.contato_id LIMIT 1) AS contato_achado,
            (SELECT coalesce(nullif(ct.nome_push, ''), ct.nome) FROM ct WHERE ct.lead_id = l0.id
              AND coalesce(nullif(ct.nome_push, ''), ct.nome) ~ '[[:alpha:]]' LIMIT 1) AS nome_contato
       FROM l0 JOIN contato ON contato.lead_id = l0.id`,
    [r.empresaId, r.funilId, [r.entrada, r.tentativa, r.conexao]]
  );

  const resumo = { lidos: 0, transferidos: 0, movidos: 0, tarefas: 0, vinculados: 0, nomeados: 0, plano: [] as any[] };
  // Naive em UTC vindo do pg como Date local do processo (TZ=UTC no servidor).
  const data = (v: any) => (v ? new Date(v) : null);

  for (const l of leads.rows) {
    if (!r.origens.test(String(l.origem || ''))) continue;
    resumo.lidos++;

    const nome = nomeEhSoTelefone(l.nome) ? nomeDoPush(l.nome_contato) : null;
    const d = decidir({
      estagioId: l.estagio_id,
      primeiroContato: data(l.primeiro_contato),
      resposta: data(l.resposta),
      entrouNaEtapa: data(l.entrou_na_etapa),
      tarefaPendente: !!l.tarefa_pendente,
      criadoEm: new Date(l.created_at),
    }, r, agora);
    const passarPara = l.quem_abordou && l.quem_abordou !== l.responsavel_id && !l.responsavel_falou
      ? Number(l.quem_abordou) : null;
    if (simular) {
      resumo.plano.push({ passarPara, id: l.id, estagio: l.estagio_id, resp: l.responsavel_id, mover: d.mover, tarefa: d.tarefa,
        vincula: !l.contato_whatsapp_id && !!l.contato_achado, nome });
      continue;
    }

    if (!l.contato_whatsapp_id && l.contato_achado) {
      await query(`UPDATE leads SET contato_whatsapp_id = $1 WHERE id = $2 AND contato_whatsapp_id IS NULL`, [l.contato_achado, l.id]);
      resumo.vinculados++;
    }
    if (passarPara && await leadsService.transferirPropriedadeSeDiferente(l.id, passarPara, r.empresaId, 'boas_vindas_grupo')) {
      l.responsavel_id = passarPara;
      resumo.transferidos++;
    }
    if (nome) {
      await query(`UPDATE leads SET nome = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND nome !~ '[[:alpha:]]'`, [nome, l.id]);
      resumo.nomeados++;
    }

    if (d.mover) {
      const resp = !!l.resposta;
      const ok = await leadsService.moverPorAutomacao(
        l.id, r.empresaId, l.responsavel_id, d.mover,
        resp ? 'Movido para Conexão: respondeu ao primeiro contato'
             : `Movido para Tentativa de Contato: sem resposta ${r.semRespostaHoras}h depois da boas-vindas`,
        { trigger: 'cadencia_entrada', origem: l.origem }
      );
      if (ok) resumo.movidos++;
    }
    if (d.tarefa && l.responsavel_id) {
      await query(
        `INSERT INTO tarefas_lead (lead_id, empresa_id, responsavel_id, criado_por_id, tipo, titulo, descricao, data_vencimento, prioridade)
         SELECT $1, $2, $3, $3, 'follow_up', $4, $5, $6, 'normal'
          WHERE NOT EXISTS (SELECT 1 FROM tarefas_lead WHERE lead_id = $1 AND status = 'pendente')`,
        [l.id, r.empresaId, l.responsavel_id, d.tarefa.titulo,
         `Criada pela cadência de entrada (${l.origem}).`, d.tarefa.vencimento]
      );
      resumo.tarefas++;
    }
  }
  return resumo;
}
