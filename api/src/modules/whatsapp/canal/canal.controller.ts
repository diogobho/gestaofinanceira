import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { contaAtivaDoUsuario } from './contas';
import { instancia } from './instancia';
import { estadoJanela } from './janela';
import { listarModelos } from './modelos';

/**
 * O que a tela precisa saber sobre o canal de WhatsApp de QUEM ESTÁ LOGADO: se é o
 * número oficial (e então: janela de 24h e modelos aprovados) ou o QR Code. Aberto a
 * qualquer usuário — cada um só enxerga a própria empresa.
 *
 * A pergunta é por USUÁRIO, não por empresa: desde a migration 084 a migração para a
 * Cloud API é um operador de cada vez, e no meio do caminho a mesma empresa tem gente
 * nos dois canais. Perguntar pela empresa faria o chat do operador que ainda está no
 * QR anunciar janela de 24h e exigir modelo — regras que não são dele.
 */
export const canalController = {
  async getCanal(req: Request, res: Response) {
    const empresaId = (req as any).user?.empresa_id;
    const conta = await contaAtivaDoUsuario((req as any).user?.userId, empresaId);
    if (!conta) return res.json({ provedor: 'baileys' });

    let status: any = null;
    try {
      status = (await instancia(conta.porta_virtual).get('/status')).data;
    } catch (err: any) {
      status = { status: 'disconnected', erro: err?.response?.data?.error || err.message };
    }
    return res.json({
      provedor: 'cloud_api',
      numero: conta.numero,
      nomeExibicao: status?.nomeVerificado || conta.nome_exibicao,
      conectado: status?.status === 'connected',
      qualidade: status?.qualidade ?? null,
      erro: status?.erro ?? null,
      ativadoEm: conta.ativado_em,
    });
  },

  async getModelos(req: Request, res: Response) {
    const empresaId = (req as any).user?.empresa_id;
    const conta = await contaAtivaDoUsuario((req as any).user?.userId, empresaId);
    if (!conta) return res.json({ modelos: [] });
    try {
      const modelos = await listarModelos(conta, req.query.forcar === '1');
      return res.json({ modelos });
    } catch (err: any) {
      return res.status(502).json({ message: `A Meta não devolveu os modelos: ${err.message}` });
    }
  },

  /** Estado da janela de 24h para o chat de um lead ou contato. */
  async getJanela(req: Request, res: Response) {
    const empresaId = (req as any).user?.empresa_id;
    const conta = await contaAtivaDoUsuario((req as any).user?.userId, empresaId);
    if (!conta) return res.json({ provedor: 'baileys', aberta: true });

    const leadId = Number(req.query.lead_id) || null;
    const contatoId = Number(req.query.contato_id) || null;
    let destino: string | null = null;
    if (contatoId) {
      const c = await query(`SELECT whatsapp_id, numero FROM contatos_whatsapp WHERE id = $1 AND empresa_id = $2`, [
        contatoId,
        empresaId,
      ]);
      destino = c.rows[0]?.whatsapp_id || c.rows[0]?.numero || null;
    } else if (leadId) {
      const l = await query(
        `SELECT cw.whatsapp_id, l.telefone
           FROM leads l LEFT JOIN contatos_whatsapp cw ON cw.id = l.contato_whatsapp_id
          WHERE l.id = $1 AND l.empresa_id = $2`,
        [leadId, empresaId]
      );
      destino = l.rows[0]?.whatsapp_id || l.rows[0]?.telefone || null;
    }
    if (!destino) return res.json({ provedor: 'cloud_api', aberta: false, ultimaEntrada: null, restaSegundos: 0 });
    return res.json({ provedor: 'cloud_api', ...(await estadoJanela(empresaId, destino)) });
  },
};
