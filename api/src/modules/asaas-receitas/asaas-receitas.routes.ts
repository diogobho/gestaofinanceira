import { Router, Request, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { isAdminEmpresa } from '../../shared/roles';
import * as asaas from './asaas-receitas.service';

/**
 * Receitas do Asaas (105). Conectar e desconectar é de quem administra a empresa; o webhook é
 * aberto (chega do Asaas) e se autentica pelo `asaas-access-token` que a conexão registrou.
 */
const router = Router();

router.post('/webhook/:conexaoId', async (req: Request, res: Response) => {
  try {
    const ok = await asaas.receberWebhook(Number(req.params.conexaoId),
      req.headers['asaas-access-token'] as string | undefined, req.body);
    if (!ok) return res.status(401).json({ message: 'Token inválido' });
    res.json({ received: true });
  } catch (e: any) {
    // 200 mesmo assim: erro devolvido para o Asaas pausa a fila inteira do webhook. O job de 6h repõe.
    console.error('[AsaasReceitas] webhook', req.params.conexaoId, e?.message || e);
    res.json({ received: true });
  }
});

type Handler = (req: AuthRequest) => Promise<any>;
const rota = (fn: Handler, soAdmin = false) => async (req: AuthRequest, res: Response) => {
  try {
    if (!(req.user as any)?.empresa_id) return res.status(403).json({ message: 'Usuário sem empresa.' });
    if (soAdmin && !isAdminEmpresa(req.user as any)) {
      return res.status(403).json({ message: 'Só quem administra a conta pode conectar ou desconectar o Asaas.' });
    }
    res.json(await fn(req));
  } catch (e: any) {
    if (e instanceof asaas.ErroAsaas) return res.status(e.status).json({ message: e.message });
    console.error('[AsaasReceitas]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const u = (req: AuthRequest) => req.user as any;

router.get('/status', authRequired, rota((req) => asaas.status(u(req).empresa_id)));
router.post('/conectar', authRequired, rota((req) =>
  asaas.conectar(u(req).empresa_id, u(req).userId, req.body?.api_key, req.body?.importar_desde), true));
router.post('/sincronizar', authRequired, rota((req) => asaas.sincronizarDaEmpresa(u(req).empresa_id)));
router.delete('/conexao', authRequired, rota((req) => asaas.desconectar(u(req).empresa_id), true));

export default router;
