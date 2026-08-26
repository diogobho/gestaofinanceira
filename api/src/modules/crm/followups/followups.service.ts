import fs from 'fs';
import path from 'path';
import { query } from '../../../config/database';
import { calcularAgendadoPara, ModoAgendamento, UnidadeAtraso } from '../_shared/agendamento';

const UPLOADS_DIR = '/var/www/apps/gestao_financeira/uploads/whatsapp';

/**
 * Teto da janela em que uma saída no histórico ainda pode ser prova de que ESTE
 * follow-up foi enviado (ver `resolverClaimsOrfaos`).
 *
 * É o orçamento de execução de um follow-up (`ORCAMENTO_FOLLOWUP_MS`, 90s) mais uma
 * folga para o clock skew entre o processo e o Postgres. Uma mensagem que aparece
 * depois disso não pode ser deste follow-up: o envio dele já teria estourado o
 * orçamento e sido abandonado. Não importa `ORCAMENTO_FOLLOWUP_MS` de `motor.ts` de
 * propósito — o service não deve depender do job.
 */
export const JANELA_EVIDENCIA_MS = 120_000;

/**
 * Predicado de EVIDÊNCIA DE ENVIO de um follow-up, exportado para que o service e os
 * testes de banco usem exatamente a mesma regra. Os testes rodam numa transação
 * própria (pool separado do service), então sem isto eles reimplementariam a
 * condição — e uma cópia divergente daria teste verde sobre regra errada, que foi
 * como a falha do reaper passou batido.
 *
 * Parâmetros: $1 lead_id, $2 contato_whatsapp_id (nullable), $3 claim_at,
 *             $4 janela em milissegundos (texto).
 */
export const SQL_EVIDENCIA_ENVIO_FOLLOWUP = `
  SELECT 1 FROM historico_mensagens
   WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
     AND direcao = 'saida' AND erro IS NULL
     AND grupo_whatsapp_id IS NULL
     AND origem = 'followup'
     AND enviado_at >= $3
     AND enviado_at <= $3::timestamptz + ($4 || ' milliseconds')::interval
   LIMIT 1`;

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

    // Lead arquivado não entra em régua nenhuma. Sem este guard nascia um registro
    // que `buscarPendentes` nunca enxergaria (ela filtra `arquivado = false`): um
    // 'pendente' eterno, contado no dashboard e sem explicação na tela. Vale para os
    // dois caminhos — a cadência do estágio e o follow-up avulso do card.
    const alvo = await query(`SELECT arquivado FROM leads WHERE id = $1 AND empresa_id = $2`,
      [leadId, empresaId]);
    if (!alvo.rows[0]) {
      throw new Error('Lead não encontrado para agendar follow-up');
    }
    if (alvo.rows[0].arquivado === true) {
      throw new Error('Lead arquivado não recebe follow-up — reative o lead antes de agendar');
    }

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

  /**
   * Reagenda um follow-up falho ou cancelado.
   *
   * Limpa `erro` E `erro_categoria` juntos. Antes só `erro` era zerado, e o
   * registro voltava para a fila carregando a categoria da falha anterior — um
   * 'pendente' com `erro_categoria = 'canal_bloqueado'` no banco. Não quebrava
   * nada porque a tela só lê a categoria quando o status é 'falhou', mas era dado
   * obsoleto esperando para enganar a próxima consulta que o lesse.
   *
   * `tentativas` NÃO é zerado, de propósito: é o histórico de quantas vezes este
   * follow-up já falhou, e é ele que impede um registro problemático de circular
   * para sempre a cada reagendamento manual. Quem reagenda um follow-up que já
   * gastou 8 tentativas precisa ter corrigido a causa — o teto continua valendo.
   */
  async reagendar(id: number, empresaId: number, agendadoPara: string) {
    const result = await query(
      `UPDATE followups_agendados
       SET agendado_para = $3, status = 'pendente',
           erro = NULL, erro_categoria = NULL, claim_at = NULL, updated_at = NOW()
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

  /**
   * Encerra explicitamente os follow-ups pendentes de leads ARQUIVADOS.
   *
   * `buscarPendentes` já filtra `l.arquivado = false` — nenhuma mensagem sai para lead
   * arquivado. O problema era o oposto: o registro nunca RESOLVIA. Ficava 'pendente'
   * para sempre, contando no card de follow-ups do dashboard e sem nada que explicasse
   * por que não saía. Havia 23 assim, o mais antigo desde 05/08/2026.
   *
   * `leadsService.arquivar()` já cancela a cadência do estágio, mas arquivamento em
   * massa por SQL cru (foi como 1.058 cards duplicados foram arquivados) não passa por
   * lá — daí esta limpeza rodar no ciclo, corrigindo o estado independente de COMO o
   * lead foi arquivado. Cobre as duas origens: a cadência do estágio e o follow-up
   * avulso criado no card, que o `arquivar()` deixava de fora.
   *
   * Encerra como 'cancelado' (não 'falhou'): não houve falha, a régua deixou de valer.
   * O motivo fica em `erro`/`erro_categoria` para a tela poder explicar, e o registro
   * continua no histórico — nada é apagado.
   */
  async cancelarPorLeadArquivado(): Promise<number> {
    const r = await query(
      `UPDATE followups_agendados f
          SET status = 'cancelado',
              erro_categoria = 'lead_arquivado',
              erro = 'Lead arquivado — a régua de follow-up deixou de valer. Reative o lead e reagende se quiser retomar.',
              claim_at = NULL,
              updated_at = NOW()
        FROM leads l
       WHERE l.id = f.lead_id
         AND l.arquivado = true
         AND f.status = 'pendente'`,
      []
    );
    return r.rowCount ?? 0;
  },

  /**
   * Fila do ciclo. Só status 'pendente': um registro reclamado por outro ciclo está
   * em 'processando' e não aparece aqui — é o que impede dois ciclos de pegarem o
   * mesmo follow-up.
   *
   * `remetente_id` é o dono do CHIP que vai enviar (responsável do lead, com
   * fallback para o usuário do registro). Vem já resolvido porque é a chave do
   * espaçamento anti-ban e do agrupamento da fila — resolver depois obrigaria a uma
   * consulta por follow-up só para saber em qual fila ele entra.
   */
  async buscarPendentes(limite = 500) {
    const result = await query(
      `SELECT f.*, l.nome as lead_nome, l.telefone as lead_telefone,
              l.email as lead_email, l.notas as lead_notas,
              l.temperatura as lead_temperatura, l.empresa_id,
              l.contato_whatsapp_id, l.funil_id, l.estagio_id, l.cargo,
              l.empresa as lead_empresa,
              COALESCE(l.responsavel_id, f.usuario_id) AS remetente_id,
              ef.nome as estagio_nome
       FROM followups_agendados f
       JOIN leads l ON l.id = f.lead_id
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       WHERE f.status = 'pendente'
         AND f.agendado_para <= NOW()
         AND l.arquivado = false
       ORDER BY f.agendado_para ASC
       LIMIT $1`,
      [limite]
    );
    return result.rows;
  },

  // ─── Exclusão mútua ────────────────────────────────────────────────────────

  /**
   * RECLAMA o follow-up para este ciclo. Devolve true só para quem venceu.
   *
   * `WHERE status = 'pendente'` dentro do próprio UPDATE é o que dá exclusão mútua:
   * o Postgres serializa as escritas na linha, então de dois ciclos concorrentes um
   * atualiza e o outro vê `rowCount = 0`. O `continuaPendente()` anterior era
   * check-then-act — dois processos podiam ler "ainda pendente" e ambos enviar.
   *
   * Não incrementa `tentativas`: reclamar não é falhar. Um follow-up adiado por
   * conversa viva passa por aqui várias vezes e não pode gastar o teto de retry.
   */
  async reclamar(id: number): Promise<boolean> {
    const r = await query(
      `UPDATE followups_agendados
          SET status = 'processando', claim_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pendente'`,
      [id]
    );
    return (r.rowCount ?? 0) > 0;
  },

  /** Devolve um follow-up reclamado à fila, opcionalmente com novo horário. */
  async liberarClaim(id: number, novoInstante?: Date) {
    await query(
      `UPDATE followups_agendados
          SET status = 'pendente', claim_at = NULL, updated_at = NOW(),
              agendado_para = COALESCE($2, agendado_para)
        WHERE id = $1 AND status = 'processando'`,
      [id, novoInstante ? novoInstante.toISOString() : null]
    );
  },

  /**
   * Resolve claims órfãos — registros que ficaram em 'processando' porque o processo
   * morreu (restart do PM2, OOM) ou porque o orçamento de execução estourou.
   *
   * O desempate NÃO é por tempo, é por EVIDÊNCIA: se existe no histórico uma saída
   * COMPATÍVEL com este follow-up depois do claim, a mensagem saiu — marcar enviado.
   * Senão, volta para a fila. Chutar "provavelmente não enviou" duplicaria mensagem
   * para o lead, que é o pior desfecho possível.
   *
   * ── O que conta como evidência (e por quê) ─────────────────────────────────
   * Três filtros, e cada um fecha um jeito de a conclusão sair errada:
   *
   * 1. `origem = 'followup'`. Antes bastava QUALQUER saída sem erro. Bastava o
   *    operador responder no card no mesmo minuto do claim para o reaper concluir
   *    que o follow-up tinha saído — e ele nunca saía, ficava 'enviado' mentindo.
   *    Mensagem manual, agente reativo, disparo e lembrete NÃO são prova: cada um
   *    tem a sua origem (migration 070) e nenhuma delas é este follow-up.
   * 2. Janela de tempo fechada em `JANELA_EVIDENCIA_MS` a partir do claim. Sem teto
   *    superior, o envio BEM-SUCEDIDO de um passo POSTERIOR da cadência (que sai
   *    normalmente, porque um órfão em 'processando' não é 'pendente') virava prova
   *    do passo órfão. O envio real cabe no orçamento do follow-up; o que aparece
   *    muito depois é outra mensagem.
   * 3. `grupo_whatsapp_id IS NULL`: conversa de grupo não é envio 1:1 para o lead.
   *
   * ── Risco residual, explícito ──────────────────────────────────────────────
   * `enviarMensagem` faz POST na instância e SÓ DEPOIS grava o histórico. Se o
   * processo morrer entre as duas coisas, o WhatsApp aceitou a mensagem e não existe
   * nenhum registro dela no banco: o reaper devolve o follow-up à fila e o lead
   * recebe a mensagem DUAS vezes. A janela é de milissegundos e não há como fechá-la
   * aqui — fechar exigiria outbox transacional ou chave de idempotência enviada à
   * instância (ela não aceita nenhuma hoje). Escolha consciente: preferimos a
   * duplicidade rara nessa janela mínima a marcar como enviado um follow-up que não
   * saiu, que é silencioso e o lead nunca recebe nada.
   */
  async resolverClaimsOrfaos(idadeMinutos = 10): Promise<{ enviados: number; devolvidos: number }> {
    const orfaos = await query(
      `SELECT f.id, f.lead_id, f.claim_at, l.contato_whatsapp_id
         FROM followups_agendados f
         JOIN leads l ON l.id = f.lead_id
        WHERE f.status = 'processando'
          AND f.claim_at < NOW() - ($1 || ' minutes')::interval`,
      [String(Math.max(1, Math.round(idadeMinutos)))]
    );
    let enviados = 0, devolvidos = 0;
    for (const o of orfaos.rows) {
      const saiu = await query(
        SQL_EVIDENCIA_ENVIO_FOLLOWUP,
        [o.lead_id, o.contato_whatsapp_id ?? null, o.claim_at, String(JANELA_EVIDENCIA_MS)]
      );
      if (saiu.rows.length > 0) {
        await query(
          `UPDATE followups_agendados
              SET status = 'enviado', enviado_at = COALESCE(enviado_at, claim_at),
                  claim_at = NULL, updated_at = NOW()
            WHERE id = $1 AND status = 'processando'`,
          [o.id]
        );
        enviados++;
      } else {
        await this.liberarClaim(o.id);
        devolvidos++;
      }
    }
    if (enviados || devolvidos) {
      console.log(`[FollowUp] Claims órfãos resolvidos: ${enviados} confirmados como enviados, ${devolvidos} devolvidos à fila`);
    }
    return { enviados, devolvidos };
  },

  /** Registra a falha de uma tentativa e devolve quantas já aconteceram. */
  async registrarTentativa(id: number, categoria: string, erro: string): Promise<number> {
    const r = await query(
      `UPDATE followups_agendados
          SET tentativas = tentativas + 1, erro_categoria = $2, erro = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING tentativas`,
      [id, categoria.slice(0, 32), (erro || '').slice(0, 2000)]
    );
    return Number(r.rows[0]?.tentativas ?? 0);
  },

  /**
   * Um passo de cadência de ESTÁGIO só pode ser enviado agora se não há nenhum passo
   * ANTERIOR (passo_ordem menor) ainda pendente para o mesmo lead — garantia de ORDEM,
   * mesmo que um adiamento (conversa viva, chip fora do ar) tenha reordenado os horários.
   * Follow-ups avulsos (origem 'lead', passo_ordem null) não passam por aqui.
   *
   * NÃO existe mais o limite de "um toque de cadência por dia". Ele era um segundo
   * bloqueio, por cima do horário desenhado na cadência, e inviabilizava justamente o
   * caso que a interface sugere por padrão: `passoNovo()` propõe o passo seguinte em
   * 10 MINUTOS, e o guard adiava esse passo para o dia seguinte — em horário nenhum,
   * porque o scheduler só pulava o registro (sem reagendar) e reavaliava a cada minuto.
   * Quem decide o espaçamento é a cadência (data/hora de cada passo) somada ao intervalo
   * anti-ban da empresa e à janela operacional.
   */
  async podeEnviarPassoEstagio(leadId: number, passoOrdem: number | null): Promise<boolean> {
    if (passoOrdem == null) return true;
    const r = await query(
      // 'processando' conta junto com 'pendente': um passo anterior EM VOO (reclamado
      // por este ciclo ou órfão de um processo que morreu) não é 'pendente', e sem
      // ele nesta lista o passo seguinte passava na frente — invertendo a ordem da
      // cadência justamente quando algo deu errado no passo anterior. Órfão fica em
      // 'processando' por até 10 min (idade do reaper): esperar é o desfecho certo,
      // porque a alternativa é falar com o lead fora de ordem.
      `SELECT COUNT(*)::int AS anteriores_em_aberto
         FROM followups_agendados
        WHERE lead_id = $1 AND origem = 'estagio'
          AND status IN ('pendente', 'processando')
          AND passo_ordem IS NOT NULL AND passo_ordem < $2`,
      [leadId, passoOrdem]
    );
    return Number(r.rows[0]?.anteriores_em_aberto ?? 0) === 0;
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
   * Instante da última mensagem AUTOMÁTICA enviada por CHIP.
   *
   * Este é o **único** mecanismo de anti-ban do sistema. Duas decisões nele:
   *
   * 1. **Por chip (`usuario_id`), não por empresa.** O risco de bloqueio é do NÚMERO
   *    que envia. Medir por empresa acoplava chips independentes: o chip da Débora
   *    enviando segurava o follow-up que sairia pelo chip da Jéssica, sem que isso
   *    reduzisse risco nenhum. Também é o que mantém o isolamento entre chips.
   *
   * 2. **Só automação** (`origem IS NOT NULL`, migration 070). Antes contava
   *    QUALQUER saída, inclusive a conversa manual do operador — e aí um operador
   *    ativo o dia inteiro empurrava a fila de follow-up indefinidamente, sem erro,
   *    sem alerta e sem nada na tela. Conversa humana não é rajada de robô: ela não
   *    entra no espaçamento.
   *
   * Linhas anteriores à 070 têm `origem NULL` e ficam de fora de propósito — a
   * janela é de 1 hora, então elas saem de cena sozinhas logo após o deploy.
   */
  async ultimoEnvioAutomaticoPorChip(): Promise<Record<number, number>> {
    const result = await query(
      `SELECT usuario_id, MAX(enviado_at) AS ultimo
       FROM historico_mensagens
       WHERE direcao = 'saida' AND erro IS NULL
         AND origem IS NOT NULL AND origem <> 'manual'
         AND enviado_at > NOW() - INTERVAL '1 hour'
       GROUP BY usuario_id`,
      []
    );
    const map: Record<number, number> = {};
    for (const r of result.rows) {
      if (r.usuario_id != null && r.ultimo) map[r.usuario_id] = new Date(r.ultimo).getTime();
    }
    return map;
  },

  /**
   * Fecha o follow-up como enviado. Só sai de 'processando': se algo devolveu o
   * registro à fila no meio do caminho, esta escrita não acontece e o estado não
   * mente sobre o que foi feito.
   */
  async marcarEnviado(id: number): Promise<boolean> {
    const r = await query(
      `UPDATE followups_agendados
       SET status = 'enviado', enviado_at = NOW(), claim_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('processando', 'pendente')`,
      [id]
    );
    return (r.rowCount ?? 0) > 0;
  },

  /**
   * Empurra um follow-up pendente para um INSTANTE explícito (conversa viva, erro
   * transitório, fora da janela operacional).
   *
   * Era `adiar(id, minutos)` = NOW() + N minutos. O problema: nada olhava a janela de
   * envio, então um follow-up adiado várias vezes escorregava para as 22h ou para o
   * domingo. Quem chama calcula o instante com `proximaJanelaValida`, e por isso o
   * destino do adiamento é sempre uma hora em que se pode enviar.
   */
  async adiarPara(id: number, instante: Date) {
    await query(
      `UPDATE followups_agendados
       SET agendado_para = $2, status = 'pendente', claim_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('pendente', 'processando')`,
      [id, instante.toISOString()]
    );
  },

  async marcarFalhou(id: number, erro: string, categoria?: string) {
    await query(
      `UPDATE followups_agendados
       SET status = 'falhou', erro = $2, erro_categoria = COALESCE($3, erro_categoria),
           claim_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id, (erro || '').slice(0, 2000), categoria ? categoria.slice(0, 32) : null]
    );
  },

  /**
   * Métricas de follow-ups do dashboard do CRM.
   *
   * Aceita os MESMOS filtros da tela. Até 25/08/2026 esta consulta filtrava só
   * por `empresa_id`: os cinco números ignoravam funil, responsável e período, e
   * mostravam a empresa inteira mesmo com um funil selecionado.
   *
   * Cada contador tem a sua própria data de referência, porque medem coisas
   * diferentes: pendente/atrasado é `agendado_para` (quando VAI acontecer),
   * enviado é `enviado_at` e falhado é `updated_at` (quando aconteceu).
   *
   * Sem período, "para hoje" e "enviados hoje" continuam sendo o dia de hoje.
   * COM período, os dois passam a contar o período — senão o número seria a
   * interseção de "hoje" com um intervalo que pode nem conter hoje, e daria
   * zero sem explicação. O retorno traz `periodo_ativo` para a tela trocar os
   * rótulos e não prometer "hoje" quando não é hoje.
   */
  async metricas(
    empresaId: number,
    filtros: { funilId?: number; responsavelId?: number; dataInicio?: string; dataFim?: string } = {}
  ) {
    const params: any[] = [empresaId];
    let escopo = '';

    if (filtros.funilId) {
      params.push(filtros.funilId);
      escopo += ` AND l.funil_id = $${params.length}`;
    }
    if (filtros.responsavelId) {
      params.push(filtros.responsavelId);
      escopo += ` AND l.responsavel_id = $${params.length}`;
    }

    const periodoAtivo = Boolean(filtros.dataInicio || filtros.dataFim);
    /** Recorte de período sobre a coluna de data que aquele contador usa. */
    const janela = (coluna: string) => {
      let sql = '';
      if (filtros.dataInicio) {
        params.push(filtros.dataInicio);
        sql += ` AND ${coluna} >= $${params.length}::date`;
      }
      if (filtros.dataFim) {
        params.push(filtros.dataFim);
        sql += ` AND ${coluna} < ($${params.length}::date + 1)`;
      }
      return sql;
    };

    const hoje = (coluna: string) =>
      ` AND DATE(${coluna} AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'`;

    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE f.status = 'pendente' ${janela('f.agendado_para')})   AS total_pendentes,
         COUNT(*) FILTER (WHERE f.status = 'pendente' AND f.agendado_para < NOW()
                                ${janela('f.agendado_para')})                        AS total_atrasados,
         COUNT(*) FILTER (WHERE f.status = 'pendente'
                                ${periodoAtivo ? janela('f.agendado_para') : hoje('f.agendado_para')})
                                                                                     AS pendentes_hoje,
         COUNT(*) FILTER (WHERE f.status = 'enviado'
                                ${periodoAtivo ? janela('f.enviado_at') : hoje('f.enviado_at')})
                                                                                     AS enviados_hoje,
         COUNT(*) FILTER (WHERE f.status = 'falhou' ${janela('f.updated_at')})        AS total_falhados
       FROM followups_agendados f
       JOIN leads l ON l.id = f.lead_id
       WHERE f.empresa_id = $1 ${escopo}`,
      params
    );
    return { ...result.rows[0], periodo_ativo: periodoAtivo };
  },
};
