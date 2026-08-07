import fs from 'fs';
import path from 'path';
import { query } from '../../../config/database';
import { calcularAgendadoPara, ModoAgendamento, UnidadeAtraso } from '../_shared/agendamento';

const UPLOADS_DIR = '/var/www/apps/gestao_financeira/uploads/whatsapp';

export interface CriarFollowupInput {
  leadId: number;
  usuarioId: number;
  empresaId: number;
  tipo: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucaoIa?: string;
  // Mídia opcional (só tipo 'manual'): arquivo já armazenado em /uploads/whatsapp/{empresa}/.
  // No envio vai por /send-media e `mensagem` vira a legenda.
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  origem?: 'lead' | 'estagio';
  // Padrão único de agendamento
  modo?: ModoAgendamento;        // 'dias' (após X unidade) | 'data' (data fixa)
  atrasoDias?: number | null;    // quantidade (X) do atraso
  atrasoUnidade?: UnidadeAtraso | null; // 'minuto' | 'hora' | 'dia' (default 'dia')
  dataFixa?: string | null;      // 'YYYY-MM-DD'
  horaEnvio?: string | null;     // 'HH:MM'
  diasSemana?: number[] | null;  // 0=Dom..6=Sáb
  base?: Date;                   // base do cálculo (entrada no estágio); default now
  agendadoPara?: string;         // override: instante já calculado
  // Cadência (origem 'estagio'): posição do passo e se move o lead ao enviar.
  passoOrdem?: number | null;    // 0 = primeiro passo da cadência
  moverAposEnvio?: boolean;      // true só no último passo (default true p/ passo único)
}

export const followupsService = {
  async criar(input: CriarFollowupInput) {
    const {
      leadId, usuarioId, empresaId, tipo, mensagem, instrucaoIa,
      mediaUrl, mediaMimetype, mediaFilename,
      origem = 'lead', modo = 'dias', atrasoDias, atrasoUnidade, dataFixa, horaEnvio,
      diasSemana, base, agendadoPara, passoOrdem, moverAposEnvio,
    } = input;

    const quando = agendadoPara || calcularAgendadoPara(
      { modo, atrasoDias, atrasoUnidade, dataFixa, horaEnvio, diasSemana },
      base || new Date()
    );

    const result = await query(
      `INSERT INTO followups_agendados
         (lead_id, usuario_id, empresa_id, agendado_para, tipo, mensagem, instrucao_ia,
          media_url, media_mimetype, media_filename,
          origem, modo, atraso_dias, atraso_unidade, data_fixa, hora_envio, dias_semana,
          passo_ordem, mover_apos_envio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        leadId, usuarioId, empresaId, quando, tipo,
        mensagem || null, instrucaoIa || null,
        mediaUrl || null, mediaMimetype || null, mediaFilename || null,
        origem, modo, atrasoDias ?? null, atrasoUnidade || 'dia', dataFixa || null, horaEnvio || null,
        diasSemana?.length ? diasSemana : null,
        passoOrdem ?? null, moverAposEnvio ?? true,
      ]
    );
    return result.rows[0];
  },

  // Move o arquivo temporário (multer) para /uploads/whatsapp/{empresa}/ e devolve a
  // referência que fica salva na config/no follow-up. Não guarda binário no banco.
  async salvarMidiaUpload(
    empresaId: number,
    filePath: string,
    originalFilename: string,
    mimetype: string
  ): Promise<{ media_url: string; media_mimetype: string; media_filename: string }> {
    const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
    if (!fs.existsSync(empresaDir)) {
      fs.mkdirSync(empresaDir, { recursive: true });
    }
    const ext = path.extname(originalFilename) || '';
    const safeFilename = `followup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destPath = path.join(empresaDir, safeFilename);
    fs.copyFileSync(filePath, destPath);
    return {
      media_url: `/uploads/whatsapp/${empresaId}/${safeFilename}`,
      media_mimetype: mimetype,
      media_filename: originalFilename,
    };
  },

  async listarPorLead(leadId: number, empresaId: number) {
    const result = await query(
      `SELECT f.*, u.nome as usuario_nome
       FROM followups_agendados f
       JOIN usuarios u ON u.id = f.usuario_id
       WHERE f.lead_id = $1 AND f.empresa_id = $2
       ORDER BY f.agendado_para ASC`,
      [leadId, empresaId]
    );
    return result.rows;
  },

  /** Lista todos os follow-ups da empresa com filtros opcionais */
  async listarTodos(
    empresaId: number,
    filtro?: 'hoje' | 'semana' | 'atrasados' | 'todos',
    status?: string,
    funilTipo?: 'aquisicao' | 'cx'
  ) {
    const statusFiltro = status || 'pendente';
    let dateFiltro = '';

    if (filtro === 'hoje') {
      dateFiltro = `AND DATE(f.agendado_para AT TIME ZONE 'America/Sao_Paulo')
                     = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'`;
    } else if (filtro === 'semana') {
      dateFiltro = `AND f.agendado_para AT TIME ZONE 'America/Sao_Paulo'
                     >= DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Sao_Paulo')
                    AND f.agendado_para AT TIME ZONE 'America/Sao_Paulo'
                     <  DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '7 days'`;
    } else if (filtro === 'atrasados') {
      dateFiltro = `AND f.agendado_para < NOW() AND f.status = 'pendente'`;
    }

    const params: unknown[] = [empresaId, filtro === 'atrasados' ? 'pendente' : statusFiltro];
    const funilFiltro = funilTipo ? `AND fn.tipo = $3` : '';
    if (funilTipo) params.push(funilTipo);

    const result = await query(
      `SELECT f.*,
              l.nome  AS lead_nome,
              l.telefone AS lead_telefone,
              u.nome  AS usuario_nome,
              ef.nome AS estagio_nome,
              ef.cor  AS estagio_cor,
              fn.tipo AS funil_tipo
       FROM followups_agendados f
       JOIN leads l      ON l.id  = f.lead_id
       JOIN usuarios u   ON u.id  = f.usuario_id
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       LEFT JOIN funis fn ON fn.id = l.funil_id
       WHERE f.empresa_id = $1
         AND ($2::text = 'todos' OR f.status = $2::text)
         ${dateFiltro}
         ${funilFiltro}
       ORDER BY f.agendado_para ASC
       LIMIT 200`,
      params
    );
    return result.rows;
  },

  async cancelar(id: number, empresaId: number) {
    const result = await query(
      `UPDATE followups_agendados SET status = 'cancelado', updated_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status = 'pendente'
       RETURNING *`,
      [id, empresaId]
    );
    return result.rows[0];
  },

  /** Reagenda um follow-up falho ou cancelado */
  async reagendar(id: number, empresaId: number, agendadoPara: string) {
    const result = await query(
      `UPDATE followups_agendados
       SET agendado_para = $3, status = 'pendente', erro = NULL, updated_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status IN ('falhou', 'cancelado')
       RETURNING *`,
      [id, empresaId, agendadoPara]
    );
    return result.rows[0];
  },

  /** Cancela todos os follow-ups pendentes de estágio para um lead */
  async cancelarEstagiosPorLead(leadId: number) {
    await query(
      `UPDATE followups_agendados SET status = 'cancelado', updated_at = NOW()
       WHERE lead_id = $1 AND origem = 'estagio' AND status = 'pendente'`,
      [leadId]
    );
  },

  async buscarPendentes() {
    const result = await query(
      `SELECT f.*, l.nome as lead_nome, l.telefone as lead_telefone,
              l.email as lead_email, l.notas as lead_notas,
              l.temperatura as lead_temperatura, l.empresa_id,
              l.contato_whatsapp_id, l.funil_id, l.estagio_id, l.cargo,
              l.empresa as lead_empresa,
              ef.nome as estagio_nome
       FROM followups_agendados f
       JOIN leads l ON l.id = f.lead_id
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       WHERE f.status = 'pendente'
         AND f.agendado_para <= NOW()
         AND l.arquivado = false
       ORDER BY f.agendado_para ASC`,
      []
    );
    return result.rows;
  },

  /**
   * Um passo de cadência de ESTÁGIO só pode ser enviado agora se:
   *  (a) não há nenhum passo ANTERIOR (passo_ordem menor) ainda pendente para o mesmo lead
   *      — garante a ordem, mesmo que o adiar/anti-ban tenha reordenado os horários;
   *  (b) nenhum passo de estágio já foi ENVIADO hoje (fuso SP) para o lead — no máximo
   *      um toque de cadência por dia, evitando duas mensagens empilhadas na mesma manhã.
   * Follow-ups avulsos (origem 'lead', passo_ordem null) não passam por aqui.
   */
  async podeEnviarPassoEstagio(leadId: number, passoOrdem: number | null): Promise<boolean> {
    if (passoOrdem == null) return true;
    const r = await query(
      `SELECT
         (SELECT COUNT(*) FROM followups_agendados
           WHERE lead_id = $1 AND origem = 'estagio' AND status = 'pendente'
             AND passo_ordem IS NOT NULL AND passo_ordem < $2) AS anteriores_pendentes,
         (SELECT COUNT(*) FROM followups_agendados
           WHERE lead_id = $1 AND origem = 'estagio' AND status = 'enviado'
             AND enviado_at IS NOT NULL
             AND (enviado_at AT TIME ZONE 'America/Sao_Paulo')::date
               = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS enviados_hoje`,
      [leadId, passoOrdem]
    );
    const row = r.rows[0];
    return Number(row.anteriores_pendentes) === 0 && Number(row.enviados_hoje) === 0;
  },

  /** Intervalo anti-ban (mín/máx em segundos) de follow-up de uma empresa. Default 45/90. */
  async getConfigIntervalo(empresaId: number): Promise<{ min: number; max: number }> {
    const result = await query(
      `SELECT
         COALESCE((config->>'followup_intervalo_min_seg')::int, 45) AS min,
         COALESCE((config->>'followup_intervalo_max_seg')::int, 90) AS max
       FROM empresas WHERE id = $1`,
      [empresaId]
    );
    const r = result.rows[0];
    return { min: r?.min ?? 45, max: r?.max ?? 90 };
  },

  /** Atualiza o intervalo anti-ban (mín/máx em segundos) em empresas.config. */
  async setConfigIntervalo(empresaId: number, minSeg: number, maxSeg: number) {
    let min = Math.max(10, Math.min(3600, Math.round(minSeg)));
    let max = Math.max(10, Math.min(3600, Math.round(maxSeg)));
    if (max < min) max = min;
    await query(
      `UPDATE empresas
         SET config = COALESCE(config, '{}'::jsonb)
                      || jsonb_build_object('followup_intervalo_min_seg', $2::int,
                                            'followup_intervalo_max_seg', $3::int),
             updated_at = NOW()
       WHERE id = $1`,
      [empresaId, min, max]
    );
    return { min, max };
  },

  /** Intervalo anti-ban (mín/máx em segundos) de follow-up, por empresa (para o scheduler). */
  async intervalosFollowupPorEmpresa(): Promise<Record<number, { min: number; max: number }>> {
    const result = await query(
      `SELECT id,
         COALESCE((config->>'followup_intervalo_min_seg')::int, 45) AS min,
         COALESCE((config->>'followup_intervalo_max_seg')::int, 90) AS max
       FROM empresas`,
      []
    );
    const map: Record<number, { min: number; max: number }> = {};
    for (const r of result.rows) {
      map[r.id] = { min: r.min ?? 45, max: r.max ?? 90 };
    }
    return map;
  },

  /**
   * Instante da última mensagem ENVIADA por empresa (para espaçar os próximos follow-ups).
   * Considera QUALQUER saída no WhatsApp (follow-up, disparo em massa, lembrete de reunião,
   * agente IA, chat manual) — não só follow-ups —, senão o anti-ban seria parcial.
   * Janela de 1h: o intervalo máximo configurável é 3600s e o filtro usa idx_historico_enviado.
   */
  async ultimoEnvioPorEmpresa(): Promise<Record<number, number>> {
    const result = await query(
      `SELECT empresa_id, MAX(enviado_at) AS ultimo
       FROM historico_mensagens
       WHERE direcao = 'saida' AND erro IS NULL
         AND enviado_at > NOW() - INTERVAL '1 hour'
       GROUP BY empresa_id`,
      []
    );
    const map: Record<number, number> = {};
    for (const r of result.rows) {
      if (r.empresa_id != null && r.ultimo) map[r.empresa_id] = new Date(r.ultimo).getTime();
    }
    return map;
  },

  async marcarEnviado(id: number) {
    await query(
      `UPDATE followups_agendados
       SET status = 'enviado', enviado_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  },

  /**
   * Empurra um follow-up pendente para daqui a N minutos (conversa viva / adiado),
   * evitando que o scheduler re-tente a cada 1 minuto.
   */
  async adiar(id: number, minutos: number) {
    await query(
      `UPDATE followups_agendados
       SET agendado_para = NOW() + ($2 || ' minutes')::interval, updated_at = NOW()
       WHERE id = $1 AND status = 'pendente'`,
      [id, String(Math.max(1, Math.round(minutos)))]
    );
  },

  async marcarFalhou(id: number, erro: string) {
    await query(
      `UPDATE followups_agendados
       SET status = 'falhou', erro = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, erro]
    );
  },

  /** Métricas de follow-ups para o dashboard */
  async metricas(empresaId: number) {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pendente')                                  AS total_pendentes,
         COUNT(*) FILTER (WHERE status = 'pendente' AND agendado_para < NOW())        AS total_atrasados,
         COUNT(*) FILTER (WHERE status = 'pendente'
                            AND DATE(agendado_para AT TIME ZONE 'America/Sao_Paulo')
                             = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')         AS pendentes_hoje,
         COUNT(*) FILTER (WHERE status = 'enviado'
                            AND DATE(enviado_at AT TIME ZONE 'America/Sao_Paulo')
                             = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')         AS enviados_hoje,
         COUNT(*) FILTER (WHERE status = 'falhou')                                    AS total_falhados
       FROM followups_agendados
       WHERE empresa_id = $1`,
      [empresaId]
    );
    return result.rows[0];
  },
};
