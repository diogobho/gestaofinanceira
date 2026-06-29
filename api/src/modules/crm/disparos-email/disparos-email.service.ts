import fs from 'fs';
import { query } from '../../../config/database';
import { enviarEmail, EmailAnexo } from '../../../services/email.service';
import { configuracoesSmtpService } from '../../configuracoes-smtp/configuracoes-smtp.service';
import { leadsService } from '../leads/leads.service';

export interface IniciarDisparoEmailDto {
  lead_ids?: number[];
  todos?: boolean;
  funil_id?: number;
  assunto: string;
  template: string; // HTML com variáveis [Nome], [PrimeiroNome], [Empresa], [Origem], [Email]
  anexos?: EmailAnexo[];
  estagio_pos_disparo_id?: number;
  agendado_para?: string; // ISO datetime — se no futuro, agenda em vez de disparar agora
  // Filtros adicionais aplicados ao modo 'todos'
  estagio_id?: number;
  responsavel_id?: number;
  temperatura?: string;
  origem?: string;
}

function aplicarVariaveis(template: string, lead: Record<string, any>): string {
  const primeiroNome = lead.nome?.split(' ')[0] || lead.nome || '';
  return template
    .replace(/\[Nome\]/gi, lead.nome || '')
    .replace(/\[PrimeiroNome\]/gi, primeiroNome)
    .replace(/\[Empresa\]/gi, lead.empresa || '')
    .replace(/\[Origem\]/gi, lead.origem || '')
    .replace(/\[Email\]/gi, lead.email || '')
    .replace(/\[Telefone\]/gi, lead.telefone || '');
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function _buscarLeadsPorConfig(
  empresaId: number,
  config: {
    todos?: boolean; funil_id?: number; lead_ids?: number[];
    estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string;
  }
): Promise<any[]> {
  if (config.todos && config.funil_id) {
    const params: any[] = [empresaId, config.funil_id];
    let extraWhere = '';

    if (config.estagio_id) {
      params.push(config.estagio_id);
      extraWhere += ` AND l.estagio_id = $${params.length}`;
    }
    if (config.responsavel_id) {
      params.push(config.responsavel_id);
      extraWhere += ` AND l.responsavel_id = $${params.length}`;
    }
    if (config.temperatura) {
      params.push(config.temperatura);
      extraWhere += ` AND l.temperatura = $${params.length}`;
    }
    if (config.origem) {
      params.push(config.origem);
      extraWhere += ` AND l.origem = $${params.length}`;
    }

    const r = await query(
      `SELECT l.id, l.nome, l.email, l.empresa, l.origem
       FROM leads l
       WHERE l.empresa_id = $1 AND l.funil_id = $2 AND l.arquivado = false
         AND l.email IS NOT NULL AND l.email != ''
         ${extraWhere}
       ORDER BY l.nome`,
      params
    );
    return r.rows;
  } else if (config.lead_ids?.length) {
    const r = await query(
      `SELECT l.id, l.nome, l.email, l.empresa, l.origem
       FROM leads l
       WHERE l.id = ANY($1::int[]) AND l.empresa_id = $2 AND l.arquivado = false
         AND l.email IS NOT NULL AND l.email != ''`,
      [config.lead_ids, empresaId]
    );
    return r.rows;
  }
  return [];
}

async function _processarEnviosEmail(
  disparoId: number,
  empresaId: number,
  usuarioId: number,
  leads: any[],
  assunto: string,
  template: string,
  estagioPosDeparoId: number | undefined,
  smtp: any,
  anexos?: EmailAnexo[]
): Promise<void> {
  let enviados = 0;
  let falhas = 0;
  const erros: Array<{ lead_id: number; nome: string; erro: string }> = [];

  for (let i = 0; i < leads.length; i++) {
    const statusCheck = await query(
      `SELECT status FROM disparos_crm WHERE id = $1`, [disparoId]
    );
    if (statusCheck.rows[0]?.status === 'cancelado') {
      console.log(`[DisparoEmail] #${disparoId} cancelado após ${enviados} envios.`);
      break;
    }

    const lead = leads[i];
    try {
      const assuntoFinal = aplicarVariaveis(assunto, lead);
      const htmlFinal = aplicarVariaveis(template, lead);

      await enviarEmail(
        lead.email,
        assuntoFinal,
        htmlFinal,
        smtp ? {
          smtp_host: smtp.smtp_host,
          smtp_port: smtp.smtp_port,
          smtp_user: smtp.smtp_user,
          smtp_pass: smtp.smtp_pass!,
          email_from: smtp.email_from,
          email_from_name: smtp.email_from_name,
        } : undefined,
        anexos
      );

      await query(
        `INSERT INTO disparo_leads (disparo_id, lead_id, empresa_id, status, enviado_at)
         VALUES ($1, $2, $3, 'enviado', NOW())`,
        [disparoId, lead.id, empresaId]
      );

      // Transferir propriedade do lead se o executor for diferente do dono atual
      await leadsService.transferirPropriedadeSeDiferente(
        lead.id,
        usuarioId,
        empresaId,
        'disparo_email'
      );

      if (estagioPosDeparoId) {
        await query(
          `UPDATE leads SET estagio_id = $1, data_ultimo_contato = NOW() WHERE id = $2`,
          [estagioPosDeparoId, lead.id]
        );
        await query(
          `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
           VALUES ($1, $2, $3, 'mudanca_estagio', $4, $5::jsonb)`,
          [
            lead.id, usuarioId, empresaId,
            `Movido automaticamente após disparo de e-mail`,
            JSON.stringify({
              automatico: true,
              trigger: 'pos_disparo_email',
              disparo_id: disparoId,
              novo_estagio_id: estagioPosDeparoId,
            }),
          ]
        );
      }

      enviados++;
    } catch (err: any) {
      falhas++;
      erros.push({ lead_id: lead.id, nome: lead.nome, erro: err.message });
      await query(
        `INSERT INTO disparo_leads (disparo_id, lead_id, empresa_id, status, erro, enviado_at)
         VALUES ($1, $2, $3, 'falha', $4, NOW())`,
        [disparoId, lead.id, empresaId, err.message]
      );
    }

    if (i % 5 === 4 || i === leads.length - 1) {
      await query(
        `UPDATE disparos_crm SET enviados=$1, falhas=$2, erros=$3::jsonb WHERE id=$4`,
        [enviados, falhas, JSON.stringify(erros), disparoId]
      );
    }

    // Pequeno delay entre emails para evitar bloqueio SMTP
    if (i < leads.length - 1) {
      await sleep(2000);
    }
  }

  await query(
    `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
    [disparoId]
  );

  // Limpar arquivos temporários dos anexos
  if (anexos?.length) {
    for (const anexo of anexos) {
      try { fs.unlinkSync(anexo.path); } catch { /* ignorar */ }
    }
  }
}

export const disparosEmailService = {
  async listarLeads(
    empresaId: number,
    funilId: number,
    search?: string,
    page = 1,
    perPage = 50,
    filtros?: { estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string }
  ) {
    const offset = (page - 1) * perPage;
    const params: any[] = [empresaId, funilId];
    let whereExtra = '';

    if (search?.trim()) {
      params.push(`%${search.toLowerCase().trim()}%`);
      whereExtra += ` AND (LOWER(l.nome) LIKE $${params.length} OR LOWER(l.email) LIKE $${params.length})`;
    }
    if (filtros?.estagio_id) {
      params.push(filtros.estagio_id);
      whereExtra += ` AND l.estagio_id = $${params.length}`;
    }
    if (filtros?.responsavel_id) {
      params.push(filtros.responsavel_id);
      whereExtra += ` AND l.responsavel_id = $${params.length}`;
    }
    if (filtros?.temperatura) {
      params.push(filtros.temperatura);
      whereExtra += ` AND l.temperatura = $${params.length}`;
    }
    if (filtros?.origem) {
      params.push(filtros.origem);
      whereExtra += ` AND l.origem = $${params.length}`;
    }

    const baseWhere = `WHERE l.empresa_id = $1 AND l.funil_id = $2 AND l.arquivado = false
      AND l.email IS NOT NULL AND l.email != ''${whereExtra}`;

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT l.id, l.nome, l.email, l.empresa, l.origem
         FROM leads l ${baseWhere} ORDER BY l.nome LIMIT ${perPage} OFFSET ${offset}`,
        params
      ),
      query(`SELECT COUNT(*) as total FROM leads l ${baseWhere}`, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    return {
      leads: dataResult.rows,
      total,
      paginas: Math.ceil(total / perPage) || 1,
    };
  },

  async iniciar(
    empresaId: number,
    usuarioId: number,
    dto: IniciarDisparoEmailDto
  ): Promise<number> {
    let leads = await _buscarLeadsPorConfig(empresaId, {
      todos: dto.todos,
      funil_id: dto.funil_id,
      lead_ids: dto.lead_ids,
    });

    const agendado = dto.agendado_para && new Date(dto.agendado_para) > new Date();

    const total = leads.length;

    const configuracaoJson = {
      todos: dto.todos || false,
      funil_id: dto.funil_id || null,
      lead_ids: dto.todos ? null : (dto.lead_ids || null),
    };

    const status = agendado ? 'agendado' : 'processando';

    const res = await query(
      `INSERT INTO disparos_crm
         (empresa_id, usuario_id, funil_id, template, assunto, total, status, tipo,
          estagio_pos_disparo_id, agendado_para, configuracao_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'email', $8, $9, $10::jsonb)
       RETURNING id`,
      [
        empresaId, usuarioId, dto.funil_id || null,
        dto.template, dto.assunto, total, status,
        dto.estagio_pos_disparo_id || null,
        dto.agendado_para || null,
        JSON.stringify(configuracaoJson),
      ]
    );
    const disparoId: number = res.rows[0].id;

    if (agendado) {
      return disparoId;
    }

    if (total === 0) {
      await query(
        `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
        [disparoId]
      );
      return disparoId;
    }

    const smtp = await configuracoesSmtpService.getDecrypted(empresaId);

    setImmediate(async () => {
      await _processarEnviosEmail(
        disparoId, empresaId, usuarioId, leads,
        dto.assunto, dto.template,
        dto.estagio_pos_disparo_id,
        smtp, dto.anexos
      );
    });

    return disparoId;
  },

  async executarAgendado(disparoId: number, empresaId: number, usuarioId: number): Promise<void> {
    const disparoResult = await query(
      `SELECT template, assunto, estagio_pos_disparo_id, configuracao_json
       FROM disparos_crm WHERE id = $1 AND empresa_id = $2 AND status = 'processando'`,
      [disparoId, empresaId]
    );

    const disparo = disparoResult.rows[0];
    if (!disparo) return;

    const config = disparo.configuracao_json || {};
    const leads = await _buscarLeadsPorConfig(empresaId, config);

    const total = leads.length;
    await query(
      `UPDATE disparos_crm SET total = $1 WHERE id = $2`,
      [total, disparoId]
    );

    if (total === 0) {
      await query(
        `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
        [disparoId]
      );
      return;
    }

    const smtp = await configuracoesSmtpService.getDecrypted(empresaId);

    await _processarEnviosEmail(
      disparoId, empresaId, usuarioId, leads,
      disparo.assunto, disparo.template,
      disparo.estagio_pos_disparo_id,
      smtp
    );
  },

  async getStatus(disparoId: number, empresaId: number) {
    const res = await query(
      `SELECT id, total, enviados, falhas, status, erros, assunto, created_at, finished_at, agendado_para
       FROM disparos_crm WHERE id=$1 AND empresa_id=$2 AND tipo='email'`,
      [disparoId, empresaId]
    );
    return res.rows[0] || null;
  },

  async listar(empresaId: number, limit = 10) {
    const res = await query(
      `SELECT id, total, enviados, falhas, status, assunto, template, created_at, finished_at, agendado_para
       FROM disparos_crm WHERE empresa_id=$1 AND tipo='email'
       ORDER BY created_at DESC LIMIT $2`,
      [empresaId, limit]
    );
    return res.rows;
  },
};
