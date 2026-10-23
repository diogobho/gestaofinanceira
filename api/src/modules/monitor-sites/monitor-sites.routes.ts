import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import * as monitor from './monitor-sites.service';

/** Monitoramento de sites (102). Só a conta master@gestao.com — ver `EMAILS_PERMITIDOS`. */
const router = Router();
router.use(authRequired);

type Handler = (req: AuthRequest) => Promise<any>;
const rota = (fn: Handler) => async (req: AuthRequest, res: Response) => {
  try {
    monitor.exigirPermitido((req.user as any)?.email);
    res.json((await fn(req)) ?? { success: true });
  } catch (e: any) {
    if (e instanceof monitor.ErroMonitor) return res.status(e.status).json({ message: e.message });
    console.error('[monitor-sites]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const id = (req: AuthRequest) => Number(req.params.id);

router.get('/', rota(() => monitor.listar()));
router.post('/', rota((req) => monitor.criar(req.body, (req.user as any).userId)));
router.put('/:id', rota((req) => monitor.atualizar(id(req), req.body)));
router.delete('/:id', rota((req) => monitor.excluir(id(req))));
router.post('/:id/verificar', rota((req) => monitor.verificarAgora(id(req))));
router.post('/:id/testar-aviso', rota((req) => monitor.testarAviso(id(req))));

export default router;
