/**
 * Job: Lembretes de Reunião Agendada
 *
 * Roda a cada minuto. Para cada estágio com `reuniao_lembretes.ativo = true`, olha os
 * leads que estão no estágio e têm uma tarefa de reunião (tarefas_lead.tipo='reuniao').
 * A data/hora da reunião é a `data_vencimento` da tarefa mais recente do lead.
 *
 * Cada "marco" tem um offset em minutos relativo ao início da reunião:
 *   - offset < 0  → lembrete ANTES (ex.: -1440 = 24h antes, -60 = 1h antes)
 *   - offset >= 0 → NO-SHOW depois (ex.: 60 = 1h depois, 1440 = D+1, 4320 = D+3)
 * Só dispara se agora ∈ [reuniao+offset, reuniao+offset+tolerancia_min) — assim um
 * lembrete perdido (downtime) ou fora de hora não é enviado atrasado/errado.
 *
 * O no-show é "detectado" naturalmente: só chega aqui quem AINDA está no estágio. Se o
 * vendedor mover o lead para "Reunião Realizada" após a reunião, ele sai da régua.
 *
 * Envio via WhatsApp do RESPONSÁVEL do lead. Idempotência garantida pela tabela
 * reuniao_lembretes_enviados (UNIQUE tarefa_id+marco): o marco é "reivindicado" com
 * INSERT ... ON CONFLICT DO NOTHING antes do envio.
 */

import cron from 'node-cron';
import { query } from '../config/database';
import { contatosService } from '../modules/crm/contatos/contatos.service';
import { aplicarVariaveisLead } from '../modules/crm/_shared/agendamento';
import { isMainInstance } from '../shared/utils';
import { aplicarVariaveisReuniao, DadosReuniao } from './reuniao-variaveis';
import { leadSaiu } from '../modules/crm/optout/optout.service';
import { contaAtivaDoUsuario } from '../modules/whatsapp/canal/contas';
import { estadoJanela } from '../modules/whatsapp/canal/janela';
import { leadsService } from '../modules/crm/leads/leads.service';

const TOLERANCIA_PADRAO_MIN = 120;


// Impede que um ciclo lento se sobreponha ao próximo.
let processando = false;

interface Marco {
  marco: string;
  offset_min: number;
  tolerancia_min?: number;
  grupo?: string;
  mensagem: string;
  /**
   * Base do offset: 'reuniao' (padrão) = início da reunião; 'criacao' = quando a tarefa
   * foi criada — é a confirmação "assim que a reunião é marcada" (06/10/2026).
   */
  base?: 'reuniao' | 'criacao';
  /** Número oficial com a janela de 24h fechada: sai este modelo no lugar da mensagem. */
  modelo_whatsapp?: { nome: string; idioma?: string; variaveis?: string[] } | null;
  /** Depois de enviar, move o card para `estagio_apos_envio_id` da etapa (ex.: no-show D+6 → Perda). */
  mover_apos?: boolean;
}

/**
 * Este remetente precisa de modelo para falar com este contato agora? Só no número
 * oficial e com a janela de 24h fechada — a mesma pergunta do despacho do follow-up.
 */
async function precisaDeModelo(remetenteId: number, empresaId: number, contatoId: number): Promise<boolean> {
  const conta = await contaAtivaDoUsuario(remetenteId, empresaId);
  if (!conta) return false;
  const c = await query(`SELECT whatsapp_id, numero FROM contatos_whatsapp WHERE id = $1`, [contatoId]);
  const destino = c.rows[0]?.whatsapp_id || c.rows[0]?.numero;
  if (!destino) return false;
  return !(await estadoJanela(empresaId, destino)).aberta;
}

async function processar(): Promise<void> {
  // Política da empresa: não enviar lembretes de reunião em sábado/domingo (fuso SP).
  // Um lembrete que cairia no fim de semana simplesmente não sai (a janela passa).
  const dowSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  if (dowSP === 0 || dowSP === 6) {
    return;
  }

  // Candidatos: 1 linha por lead (a reunião mais recente), já com a distância em minutos
  // entre agora e a reunião calculada pelo Postgres.
  //
  // `tarefas_lead.data_vencimento` é naive gravado em UTC — é o que o front manda
  // (`toISOString()`), o que o agente grava (agendar_reuniao) e o que o CRM lê de volta.
  // Este job interpretava a coluna como parede de São Paulo: com isso a reunião das 14h
  // (gravada 17:00 UTC) virava "17h" na mensagem para o lead e o lembrete de "1h antes"
  // saía 2h DEPOIS da reunião. Agora converte UTC → SP, igual ao resto do sistema.
  //
  // `hora_definida`: no formulário de tarefa a hora vem preenchida com "agora" quando o
  // vendedor escolhe só a data — nesse caso o horário gravado não quer dizer nada (a hora
  // real costuma estar no título) e mandar lembrete com ele significaria informar ao lead
  // um horário inventado. Mesma heurística que o agente usa em getAgendaLead.
  const { rows: candidatos } = await query(
    `SELECT DISTINCT ON (l.id)
        l.id  AS lead_id, l.nome, l.telefone, l.email, l.empresa, l.cargo, l.origem,
        l.temperatura, l.valor_potencial, l.moeda, l.cpf_cnpj,
        l.contato_whatsapp_id, l.responsavel_id, l.empresa_id,
        ur.nome AS responsavel_nome,
        t.id AS tarefa_id, t.responsavel_id AS tarefa_responsavel_id,
        to_char(t.data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
                'HH24:MI') AS reuniao_hora,
        to_char(t.data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
                'DD/MM')   AS reuniao_data,
        (ABS(EXTRACT(EPOCH FROM (t.data_vencimento::time - t.created_at::time))) > 120)
          AS hora_definida,
        EXTRACT(EPOCH FROM (NOW() - (t.data_vencimento AT TIME ZONE 'UTC'))) / 60.0 AS min_desde,
        ef.reuniao_lembretes AS cfg,
        ef.estagio_apos_envio_id,
        to_char(t.data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
                'YYYY-MM-DD') AS reuniao_dia_iso,
        to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS hoje_iso,
        t.titulo AS tarefa_titulo, t.descricao AS tarefa_descricao,
        -- created_at é naive em UTC, como data_vencimento.
        EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - t.created_at)) / 60.0 AS min_desde_criacao,
        to_jsonb(l) AS lead_json,
        -- Ambos naive em UTC: o lead escreveu depois do horário da reunião?
        (l.ultima_resposta_cliente_at IS NOT NULL AND l.ultima_resposta_cliente_at > t.data_vencimento)
          AS respondeu_apos_reuniao
     FROM estagios_funil ef
     JOIN leads l        ON l.estagio_id = ef.id AND l.arquivado = false
     LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
     JOIN tarefas_lead t ON t.lead_id = l.id AND t.tipo = 'reuniao'
     WHERE ef.reuniao_lembretes IS NOT NULL
       AND (ef.reuniao_lembretes->>'ativo') = 'true'
     ORDER BY l.id, t.data_vencimento DESC`,
    []
  );

  if (candidatos.length === 0) return;

  for (const c of candidatos) {
    // Guarda de horário: sem hora real não há lembrete. Dois casos:
    // 1. a hora veio do preenchimento automático do formulário (hora_definida = false) —
    //    mandar "sua conversa é às 10h37" com um horário que ninguém combinou é pior do
    //    que não mandar nada;
    // 2. meia-noite / madrugada, que é quase sempre "hora não preenchida" — evita também
    //    o lembrete de 24h escapar para as 21h do dia anterior.
    if (c.hora_definida === false) {
      console.log(`[ReuniaoLembretes] Lead #${c.lead_id}: hora da reunião não foi preenchida no sistema (${c.reuniao_hora}) — lembrete ignorado`);
      continue;
    }
    const hReuniao = parseInt(String(c.reuniao_hora || '').slice(0, 2), 10);
    if (!Number.isFinite(hReuniao) || hReuniao < 6 || hReuniao >= 22) {
      console.log(`[ReuniaoLembretes] Lead #${c.lead_id}: reunião sem horário confiável (${c.reuniao_hora}) — lembrete ignorado`);
      continue;
    }

    const marcos: Marco[] = Array.isArray(c.cfg?.marcos) ? c.cfg.marcos : [];
    const minDesde = Number(c.min_desde); // >0 se a reunião já passou; <0 se ainda vai acontecer

    for (const m of marcos) {
      const tol = m.tolerancia_min ?? TOLERANCIA_PADRAO_MIN;
      const desde = m.base === 'criacao' ? Number(c.min_desde_criacao) : minDesde;
      // No-show: se o lead escreveu depois da reunião, o vendedor assume a conversa e a
      // régua de remarcação para (vale só para marcos depois da reunião).
      if (m.base !== 'criacao' && m.offset_min >= 0 && c.respondeu_apos_reuniao) continue;
      const dentroDaJanela = desde >= m.offset_min && desde < m.offset_min + tol;
      if (!dentroDaJanela) continue;

      // Sem contato de WhatsApp não há como enviar — não reivindica o marco (tenta de novo
      // num próximo ciclo, caso o contato seja vinculado).
      if (!c.contato_whatsapp_id) {
        console.log(`[ReuniaoLembretes] Lead #${c.lead_id} sem contato WhatsApp — marco ${m.marco} adiado`);
        break;
      }

      // Pediu para parar de receber: nenhum lembrete sai mais.
      if (await leadSaiu(c.lead_id)) break;

      // Reivindica o marco (idempotência). Se já foi enviado, rowCount = 0.
      const claim = await query(
        `INSERT INTO reuniao_lembretes_enviados (tarefa_id, lead_id, empresa_id, marco)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tarefa_id, marco) DO NOTHING
         RETURNING id`,
        [c.tarefa_id, c.lead_id, c.empresa_id, m.marco]
      );
      if (claim.rowCount === 0) continue; // já enviado antes

      const remetenteId = c.responsavel_id || c.tarefa_responsavel_id;
      const dados: DadosReuniao = {
        diaIso: c.reuniao_dia_iso, hora: c.reuniao_hora, data: c.reuniao_data, hojeIso: c.hoje_iso,
        titulo: c.tarefa_titulo, descricao: c.tarefa_descricao,
      };
      const lead = { ...(c.lead_json || {}), responsavel_nome: c.responsavel_nome };
      const resolver = (t: string) => aplicarVariaveisLead(aplicarVariaveisReuniao(t, dados), lead);
      const texto = resolver(m.mensagem || '');

      try {
        if (m.modelo_whatsapp?.nome && await precisaDeModelo(remetenteId, c.empresa_id, c.contato_whatsapp_id)) {
          const corpo = (m.modelo_whatsapp.variaveis || []).map((v) => resolver(String(v ?? '')).trim());
          const faltando = (m.modelo_whatsapp.variaveis || []).filter((_, i) => !corpo[i] || /\[[a-zA-ZÀ-ÿ_0-9]+\]/.test(corpo[i]));
          if (faltando.length) {
            // Dado que falta não aparece sozinho no minuto seguinte (link da reunião, campo do
            // card): o marco fica marcado como tratado e o motivo vai para o log.
            console.warn(`[ReuniaoLembretes] ${m.marco} → lead #${c.lead_id}: modelo ${m.modelo_whatsapp.nome} não enviado, falta ${faltando.join(', ')}`);
            break;
          }
          const envio = await contatosService.enviarModeloWhatsApp(
            remetenteId, c.empresa_id, c.contato_whatsapp_id,
            { nome: m.modelo_whatsapp.nome, idioma: m.modelo_whatsapp.idioma, valores: { corpo } },
            c.lead_id, 'lembrete'
          );
          if (!envio.success) throw new Error(envio.error || 'Falha ao enviar o modelo');
        } else {
          if (!texto.trim()) break;
          // Lança em falha de envio → cai no catch e o marco é liberado para retry.
          await contatosService.enviarMensagemOuFalhar(remetenteId, c.empresa_id, c.contato_whatsapp_id, texto, c.lead_id, 'lembrete');
        }
        console.log(`[ReuniaoLembretes] Enviado ${m.marco} → lead #${c.lead_id} (remetente user #${remetenteId})`);
        if (m.mover_apos && c.estagio_apos_envio_id) {
          await leadsService.moverPorAutomacao(
            c.lead_id, c.empresa_id, remetenteId, c.estagio_apos_envio_id,
            'Movido automaticamente após o último lembrete da reunião, sem resposta',
            { trigger: 'reuniao_lembrete', marco: m.marco }
          ).catch((e: any) => console.error(`[ReuniaoLembretes] lead #${c.lead_id}: não moveu — ${e.message}`));
        }
      } catch (err: any) {
        // Falhou o envio: libera o marco para nova tentativa no próximo ciclo.
        await query(`DELETE FROM reuniao_lembretes_enviados WHERE tarefa_id = $1 AND marco = $2`, [c.tarefa_id, m.marco]);
        console.error(`[ReuniaoLembretes] Erro ao enviar ${m.marco} p/ lead #${c.lead_id}:`, err.message);
      }

      // No máximo um marco por lead por ciclo (as janelas são disjuntas, então na prática
      // só um casa mesmo).
      break;
    }
  }
}

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    if (processando) {
      console.log('[ReuniaoLembretes] Ciclo anterior ainda em andamento — pulando.');
      return;
    }
    processando = true;
    try {
      await processar();
    } catch (err: any) {
      console.error('[ReuniaoLembretes] Erro no cron:', err.message);
    } finally {
      processando = false;
    }
  });
  console.log('[ReuniaoLembretes] Cron registrado (a cada 1 min).');
} else {
  console.log(`[ReuniaoLembretes] Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
