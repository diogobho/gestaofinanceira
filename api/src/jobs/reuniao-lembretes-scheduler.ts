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

const TOLERANCIA_PADRAO_MIN = 120;


// Impede que um ciclo lento se sobreponha ao próximo.
let processando = false;

interface Marco {
  marco: string;
  offset_min: number;
  tolerancia_min?: number;
  grupo?: string;
  mensagem: string;
}

async function processar(): Promise<void> {
  // Política da empresa: não enviar lembretes de reunião em sábado/domingo (fuso SP).
  // Um lembrete que cairia no fim de semana simplesmente não sai (a janela passa).
  const dowSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  if (dowSP === 0 || dowSP === 6) {
    return;
  }

  // Candidatos: 1 linha por lead (a reunião mais recente), já com a distância em minutos
  // entre agora e a reunião calculada pelo Postgres. data_vencimento guarda o horário de
  // PAREDE de São Paulo (naive) — por isso é interpretado AT TIME ZONE 'America/Sao_Paulo'
  // para virar o instante correto; a hora exibida (to_char) já é a parede SP.
  const { rows: candidatos } = await query(
    `SELECT DISTINCT ON (l.id)
        l.id  AS lead_id, l.nome, l.telefone, l.email, l.empresa, l.cargo, l.origem,
        l.temperatura, l.valor_potencial, l.moeda, l.cpf_cnpj,
        l.contato_whatsapp_id, l.responsavel_id, l.empresa_id,
        ur.nome AS responsavel_nome,
        t.id AS tarefa_id, t.responsavel_id AS tarefa_responsavel_id,
        to_char(t.data_vencimento, 'HH24:MI') AS reuniao_hora,
        to_char(t.data_vencimento, 'DD/MM')   AS reuniao_data,
        EXTRACT(EPOCH FROM (NOW() - (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo'))) / 60.0 AS min_desde,
        ef.reuniao_lembretes AS cfg
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
    // Guarda de horário: reunião sem hora real (meia-noite / madrugada) é quase sempre
    // "hora não preenchida". Não dispara lembrete — evita "conversa é amanhã às 00:00" e o
    // lembrete de 24h escapar para as 21h do dia anterior.
    const hReuniao = parseInt(String(c.reuniao_hora || '').slice(0, 2), 10);
    if (!Number.isFinite(hReuniao) || hReuniao < 6 || hReuniao >= 22) {
      console.log(`[ReuniaoLembretes] Lead #${c.lead_id}: reunião sem horário confiável (${c.reuniao_hora}) — lembrete ignorado`);
      continue;
    }

    const marcos: Marco[] = Array.isArray(c.cfg?.marcos) ? c.cfg.marcos : [];
    const minDesde = Number(c.min_desde); // >0 se a reunião já passou; <0 se ainda vai acontecer

    for (const m of marcos) {
      const tol = m.tolerancia_min ?? TOLERANCIA_PADRAO_MIN;
      const dentroDaJanela = minDesde >= m.offset_min && minDesde < m.offset_min + tol;
      if (!dentroDaJanela) continue;

      // Sem contato de WhatsApp não há como enviar — não reivindica o marco (tenta de novo
      // num próximo ciclo, caso o contato seja vinculado).
      if (!c.contato_whatsapp_id) {
        console.log(`[ReuniaoLembretes] Lead #${c.lead_id} sem contato WhatsApp — marco ${m.marco} adiado`);
        break;
      }

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
      const texto = aplicarVariaveisLead(
        (m.mensagem || '')
          .replace(/\[Horario\]/gi, c.reuniao_hora || '')
          .replace(/\[Data\]/gi, c.reuniao_data || ''),
        c
      );

      try {
        // Lança em falha de envio → cai no catch e o marco é liberado para retry.
        await contatosService.enviarMensagemOuFalhar(remetenteId, c.empresa_id, c.contato_whatsapp_id, texto, c.lead_id);
        console.log(`[ReuniaoLembretes] Enviado ${m.marco} → lead #${c.lead_id} (remetente user #${remetenteId})`);
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
