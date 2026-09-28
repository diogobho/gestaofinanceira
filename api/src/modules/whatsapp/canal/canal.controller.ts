import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { contaAtivaDoUsuario } from './contas';
import { instancia } from './instancia';
import { estadoJanela } from './janela';
import { listarModelos, invalidarCacheModelos } from './modelos';
import { credenciaisDa } from './contas';
import { criarTemplate, contarVariaveis, excluirTemplate, BotaoTemplate } from '../meta/meta-whatsapp.service';

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

  /**
   * Cria um modelo na WABA DO CLIENTE e o manda para aprovação da Meta.
   *
   * Existe porque modelo não atravessa conta: os nossos não valem na WABA dele, e
   * sem nenhum aprovado ele não fala primeiro com ninguém fora da janela de 24h.
   * Antes disso o único caminho era o WhatsApp Manager da Meta, fora do produto.
   *
   * Quem não tem número oficial recebe 409 e não 403: não é plano, é canal — e a
   * frase que resolve cada um dos dois é diferente.
   */
  async criarModelo(req: Request, res: Response) {
    const empresaId = (req as any).user?.empresa_id;
    const conta = await contaAtivaDoUsuario((req as any).user?.userId, empresaId);
    if (!conta) {
      return res.status(409).json({
        message: 'Conecte o seu número oficial da Meta antes de criar modelos — eles são aprovados na sua conta, não na nossa.',
      });
    }

    const nome = String(req.body?.nome || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const corpo = String(req.body?.corpo || '').trim();
    const categoria = String(req.body?.categoria || 'MARKETING').toUpperCase();
    if (!nome || !corpo) return res.status(400).json({ message: 'Nome e corpo são obrigatórios' });
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(categoria)) {
      return res.status(400).json({ message: 'Categoria inválida' });
    }

    const exemplos = Array.isArray(req.body?.exemplos) ? req.body.exemplos.map((e: any) => String(e)) : [];
    const variaveis = contarVariaveis(corpo);
    if (variaveis > 0 && exemplos.filter((e: string) => e.trim()).length !== variaveis) {
      return res.status(400).json({
        message: `O corpo tem ${variaveis} variável(is) {{n}} e a Meta exige um exemplo para cada uma.`,
      });
    }

    try {
      const botoes: BotaoTemplate[] = (Array.isArray(req.body?.botoes) ? req.body.botoes : []).map((b: any) => ({
        tipo: ['URL', 'PHONE_NUMBER'].includes(String(b?.tipo)) ? b.tipo : 'QUICK_REPLY',
        texto: String(b?.texto ?? ''),
        url: b?.url ? String(b.url).trim() : undefined,
        telefone: b?.telefone ? String(b.telefone).replace(/[^\d+]/g, '') : undefined,
      }));
      const criado = await criarTemplate(
        {
          nome,
          corpo,
          categoria: categoria as any,
          idioma: String(req.body?.idioma || 'pt_BR'),
          exemplos,
          cabecalho: req.body?.cabecalho ? String(req.body.cabecalho) : undefined,
          exemploCabecalho: req.body?.exemploCabecalho ? String(req.body.exemploCabecalho) : undefined,
          rodape: req.body?.rodape ? String(req.body.rodape) : undefined,
          botoes,
        },
        credenciaisDa(conta)
      );
      invalidarCacheModelos(conta);
      // A Meta devolve PENDING quase sempre: aprovação é dela e pode levar horas.
      return res.status(201).json({ modelo: criado, status: criado?.status ?? 'PENDING' });
    } catch (err: any) {
      return res.status(422).json({ message: err?.message || 'A Meta recusou o modelo' });
    }
  },

  /**
   * Exclui um modelo da WABA do usuário. Cadência e disparo que o usem passam a
   * falhar com "modelo não existe" — a tela avisa antes de confirmar.
   */
  async excluirModelo(req: Request, res: Response) {
    const empresaId = (req as any).user?.empresa_id;
    const conta = await contaAtivaDoUsuario((req as any).user?.userId, empresaId);
    if (!conta) return res.status(409).json({ message: 'Você não tem número oficial conectado.' });
    const nome = String(req.params.nome || '').trim();
    if (!/^[a-z0-9_]+$/.test(nome)) return res.status(400).json({ message: 'Nome de modelo inválido' });
    try {
      await excluirTemplate(nome, req.query.id ? String(req.query.id) : undefined, credenciaisDa(conta));
      invalidarCacheModelos(conta);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(422).json({ message: err?.message || 'A Meta não excluiu o modelo' });
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
