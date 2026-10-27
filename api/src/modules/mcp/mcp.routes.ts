import { Router, Request, Response } from 'express';
import { query } from '../../config/database';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { carregarContexto, ferramentasDe, executarAcao } from '../chat-financeiro/acoes';
import { bloqueioDaEmpresa } from '../assinaturas/assinaturas.service';
import { usuarioDoToken, URL_MCP, ORIGEM } from './oauth';

/**
 * Servidor MCP do Duo (112, 23/10/2026) — Streamable HTTP, sem sessão e sem SSE:
 * cada POST é um JSON-RPC respondido em JSON. As ferramentas são o cardápio do chat
 * do Duo (`acoes.ts`) com o MESMO contexto: escopo da pessoa, permissões por módulo,
 * CRM só no plano que tem, e gravação sempre proposta antes e confirmada depois.
 *
 * Não gasta crédito do Duo: quem pensa é o Claude da própria pessoa.
 */
const VERSOES = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCOES = `Você está conectado à conta da pessoa no Duo (CRM e Financeiro).
Regras:
- Consultas respondem na hora.
- Toda ferramenta que grava devolve "aguardando_confirmacao" com um resumo e um acao_id. Nada foi gravado ainda.
- Mostre o resumo à pessoa e pergunte se pode fazer. Só chame confirmar_acao com o acao_id depois que ela disser que sim, numa resposta dela. Se ela disser que não, chame cancelar_acao.
- O Duo nunca exclui nada.
- Mensagem de WhatsApp sai para pessoas reais: antes de propor enviar_whatsapp ou disparar_whatsapp, mostre o texto (no disparo, todas as mensagens ou uma amostra e o critério) e só confirme com um "sim" explícito para o envio.
- Disparo personalizado: ler_conversas (até 30 leads por vez) → uma mensagem curta e natural por lead, baseada no que ele falou → disparar_whatsapp com a lista. Quem pediu para sair fica de fora.
- Datas no formato AAAA-MM-DD; horários em Brasília.`;

const router = Router();

function negar(res: Response, status: number, msg: string) {
  res.setHeader('WWW-Authenticate',
    `Bearer realm="duo", resource_metadata="${ORIGEM}/.well-known/oauth-protected-resource/api/gestao/mcp"`);
  return res.status(status).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: msg } });
}

const resultado = (id: any, result: any) => ({ jsonrpc: '2.0', id, result });
const erroRpc = (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

router.post('/mcp', async (req: Request, res: Response) => {
  const dono = await usuarioDoToken(req.headers.authorization).catch(() => null);
  if (!dono) return negar(res, 401, 'Conecte a sua conta do Duo.');

  const ctx = await carregarContexto(dono.usuarioId, dono.empresaId);
  if (!ctx) return negar(res, 401, 'Usuário inativo ou fora desta conta. Conecte de novo.');

  const lote = Array.isArray(req.body) ? req.body : [req.body];
  const respostas: any[] = [];
  for (const msg of lote) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      respostas.push(erroRpc(msg?.id ?? null, -32600, 'Requisição inválida'));
      continue;
    }
    const temId = msg.id !== undefined && msg.id !== null;
    try {
      switch (msg.method) {
        case 'initialize': {
          const pedida = msg.params?.protocolVersion;
          respostas.push(resultado(msg.id, {
            protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'duo', title: 'Duo — CRM e Financeiro', version: '1.0.0' },
            instructions: INSTRUCOES,
          }));
          break;
        }
        case 'ping':
          respostas.push(resultado(msg.id, {}));
          break;
        case 'tools/list':
          respostas.push(resultado(msg.id, {
            tools: ferramentasDe(ctx).map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
          }));
          break;
        case 'tools/call': {
          // Conta suspensa ou teste encerrado: mesma regra das telas.
          const bloqueio = ctx.nivel === 'super_admin' ? null : await bloqueioDaEmpresa(ctx.empresaId);
          if (bloqueio) {
            respostas.push(resultado(msg.id, {
              content: [{ type: 'text', text: 'O acesso desta conta ao Duo está pausado. A pessoa precisa regularizar a assinatura em duofuturo.tech/gestao/minha-conta.' }],
              isError: true,
            }));
            break;
          }
          const nome = String(msg.params?.name || '');
          if (!ferramentasDe(ctx).some(t => t.name === nome)) {
            respostas.push(erroRpc(msg.id, -32602, `Ferramenta desconhecida: ${nome}`));
            break;
          }
          // `inicio` por chamada: a proposta feita numa chamada anterior pode ser
          // confirmada nesta; a desta mesma chamada, não.
          ctx.inicio = new Date();
          const r = await executarAcao(ctx, nome, msg.params?.arguments || {});
          respostas.push(resultado(msg.id, {
            content: [{ type: 'text', text: JSON.stringify(r) }],
            structuredContent: r && typeof r === 'object' && !Array.isArray(r) ? r : { resultado: r },
            isError: !!(r && typeof r === 'object' && 'erro' in r),
          }));
          break;
        }
        default:
          // Notificações (sem id) não têm resposta; método desconhecido com id, sim.
          if (temId) respostas.push(erroRpc(msg.id, -32601, `Método não suportado: ${msg.method}`));
      }
    } catch (err: any) {
      console.error(`[MCP] ${msg.method}`, err?.message || err);
      if (temId) respostas.push(erroRpc(msg.id, -32603, 'Erro interno'));
    }
  }

  if (respostas.length === 0) return res.status(202).end();
  res.json(Array.isArray(req.body) ? respostas : respostas[0]);
});

// Sem SSE nem sessão: GET e DELETE não se aplicam a este servidor.
router.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
router.delete('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());

// ─── Conexões da pessoa (tela "Duo no Claude") ───────────────────────────────
router.get('/mcp-conexoes', authRequired, async (req: AuthRequest, res: Response) => {
  const r = await query(
    `SELECT t.id, c.nome AS aplicativo, t.created_at, t.ultimo_uso_em
       FROM mcp_oauth_tokens t JOIN mcp_oauth_clientes c ON c.client_id = t.client_id
      WHERE t.usuario_id = $1 AND t.revogado_em IS NULL AND t.refresh_expira_em > now()
      ORDER BY t.created_at DESC`,
    [req.user!.userId]
  );
  res.json({ url: URL_MCP, conexoes: r.rows });
});

router.delete('/mcp-conexoes/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const r = await query(
    `UPDATE mcp_oauth_tokens SET revogado_em = now() WHERE id = $1 AND usuario_id = $2 AND revogado_em IS NULL RETURNING id`,
    [Number(req.params.id), req.user!.userId]
  );
  if (!r.rowCount) return res.status(404).json({ message: 'Conexão não encontrada' });
  res.json({ success: true });
});

export default router;
