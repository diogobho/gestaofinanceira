import { query } from '../../config/database';
import axios from 'axios';

const LIMITE_POR_GRUPO = 15;

export interface AutomacaoGrupo {
  id: number;
  empresa_id: number;
  usuario_id: number;
  nome: string;
  grupo_whatsapp_id: string;
  grupo_nome: string | null;
  mensagem: string;
  ativa: boolean;
  trigger_tipo: string;
  delay_segundos: number;
  enviar_para: 'dm_participante' | 'grupo';
  total_disparos: number;
  ultimo_disparo_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAutomacaoInput {
  nome: string;
  grupo_whatsapp_id: string;
  grupo_nome?: string;
  mensagem: string;
  ativa?: boolean;
  delay_segundos?: number;
  enviar_para?: 'dm_participante' | 'grupo';
}

export interface UpdateAutomacaoInput {
  nome?: string;
  mensagem?: string;
  ativa?: boolean;
  delay_segundos?: number;
  enviar_para?: 'dm_participante' | 'grupo';
}

export const automacoesGrupoService = {
  async list(empresaId: number): Promise<AutomacaoGrupo[]> {
    const result = await query(
      `SELECT * FROM automacoes_grupo
       WHERE empresa_id = $1
       ORDER BY ativa DESC, created_at DESC`,
      [empresaId]
    );
    return result.rows;
  },

  async listByGrupo(empresaId: number, grupoId: string): Promise<AutomacaoGrupo[]> {
    const result = await query(
      `SELECT * FROM automacoes_grupo
       WHERE empresa_id = $1 AND grupo_whatsapp_id = $2
       ORDER BY created_at DESC`,
      [empresaId, grupoId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<AutomacaoGrupo | null> {
    const result = await query(
      `SELECT * FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async countAtivasByGrupo(empresaId: number, grupoId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as total FROM automacoes_grupo
       WHERE empresa_id = $1 AND grupo_whatsapp_id = $2 AND ativa = true`,
      [empresaId, grupoId]
    );
    return parseInt(result.rows[0].total);
  },

  async create(
    usuarioId: number,
    empresaId: number,
    input: CreateAutomacaoInput
  ): Promise<AutomacaoGrupo> {
    if (input.ativa !== false) {
      const total = await this.countAtivasByGrupo(empresaId, input.grupo_whatsapp_id);
      if (total >= LIMITE_POR_GRUPO) {
        throw new Error(`Limite de ${LIMITE_POR_GRUPO} automações ativas por grupo atingido`);
      }
    }

    const result = await query(
      `INSERT INTO automacoes_grupo (
        empresa_id, usuario_id, nome, grupo_whatsapp_id, grupo_nome,
        mensagem, ativa, delay_segundos, enviar_para
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        empresaId,
        usuarioId,
        input.nome,
        input.grupo_whatsapp_id,
        input.grupo_nome || null,
        input.mensagem,
        input.ativa !== false,
        input.delay_segundos ?? 30,
        input.enviar_para || 'dm_participante'
      ]
    );
    return result.rows[0];
  },

  async update(
    id: number,
    empresaId: number,
    input: UpdateAutomacaoInput
  ): Promise<AutomacaoGrupo | null> {
    const atual = await this.getById(id, empresaId);
    if (!atual) return null;

    if (input.ativa === true && !atual.ativa) {
      const total = await this.countAtivasByGrupo(empresaId, atual.grupo_whatsapp_id);
      if (total >= LIMITE_POR_GRUPO) {
        throw new Error(`Limite de ${LIMITE_POR_GRUPO} automações ativas por grupo atingido`);
      }
    }

    const campos: string[] = [];
    const valores: any[] = [];
    let idx = 1;

    if (input.nome !== undefined) { campos.push(`nome = $${idx++}`); valores.push(input.nome); }
    if (input.mensagem !== undefined) { campos.push(`mensagem = $${idx++}`); valores.push(input.mensagem); }
    if (input.ativa !== undefined) { campos.push(`ativa = $${idx++}`); valores.push(input.ativa); }
    if (input.delay_segundos !== undefined) { campos.push(`delay_segundos = $${idx++}`); valores.push(input.delay_segundos); }
    if (input.enviar_para !== undefined) { campos.push(`enviar_para = $${idx++}`); valores.push(input.enviar_para); }

    if (campos.length === 0) return atual;

    campos.push(`updated_at = CURRENT_TIMESTAMP`);
    valores.push(id, empresaId);

    const result = await query(
      `UPDATE automacoes_grupo SET ${campos.join(', ')}
       WHERE id = $${idx++} AND empresa_id = $${idx}
       RETURNING *`,
      valores
    );
    return result.rows[0] || null;
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM automacoes_grupo WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return (result.rowCount || 0) > 0;
  },

  async registrarDisparo(
    automacaoId: number,
    participanteNumero: string,
    participanteNome: string | null,
    mensagem: string,
    sucesso: boolean,
    erro?: string
  ): Promise<void> {
    await query(
      `INSERT INTO automacoes_grupo_historico (
        automacao_id, participante_numero, participante_nome, mensagem_enviada, sucesso, erro
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [automacaoId, participanteNumero, participanteNome, mensagem, sucesso, erro || null]
    );

    if (sucesso) {
      await query(
        `UPDATE automacoes_grupo
         SET total_disparos = total_disparos + 1, ultimo_disparo_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [automacaoId]
      );
    }
  },

  async processarNovoParticipante(
    grupoId: string,
    participanteJid: string,
    participanteNome: string | null,
    empresaId: number
  ): Promise<void> {
    const automacoes = await query(
      `SELECT ag.*, u.whatsapp_porta
       FROM automacoes_grupo ag
       INNER JOIN usuarios u ON u.id = ag.usuario_id
       WHERE ag.empresa_id = $1
         AND ag.grupo_whatsapp_id = $2
         AND ag.ativa = true`,
      [empresaId, grupoId]
    );

    if (automacoes.rows.length === 0) return;

    const numero = participanteJid.replace(/@.*$/, '');
    const primeiroNome = participanteNome?.split(' ')[0] || 'pessoal';

    for (const auto of automacoes.rows) {
      const delay = (auto.delay_segundos || 0) * 1000;

      setTimeout(async () => {
        try {
          const mensagemFinal = auto.mensagem
            .replace(/\{\{nome\}\}/gi, participanteNome || 'pessoal')
            .replace(/\{\{primeiro_nome\}\}/gi, primeiroNome)
            .replace(/\{\{nome_grupo\}\}/gi, auto.grupo_nome || 'grupo');

          const destino = auto.enviar_para === 'grupo' ? grupoId : participanteJid;

          await axios.post(
            `http://localhost:${auto.whatsapp_porta}/send-message`,
            { to: destino, message: mensagemFinal },
            { timeout: 15000 }
          );

          await this.registrarDisparo(auto.id, numero, participanteNome, mensagemFinal, true);
          console.log(`[Automacao #${auto.id}] Mensagem enviada para ${numero}`);
        } catch (err: any) {
          console.error(`[Automacao #${auto.id}] Falha no envio:`, err.message);
          await this.registrarDisparo(auto.id, numero, participanteNome, auto.mensagem, false, err.message);
        }
      }, delay);
    }
  }
};

export const LIMITE_AUTOMACOES_POR_GRUPO = LIMITE_POR_GRUPO;
