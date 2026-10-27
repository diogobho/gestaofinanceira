import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { afiliadosService, ErroRecompensa } from './afiliados.service';
import { isAdminEmpresa } from '../../shared/roles';

const router = Router();

// Painel "Indique o Duo": qualquer usuário da conta vê o link da conta.
router.get('/afiliados/meu', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });
    res.json(await afiliadosService.painel(empresaId, req.user!.userId));
  } catch (err: any) {
    console.error('[Afiliados] painel', err.message);
    res.status(500).json({ message: 'Erro ao carregar as indicações' });
  }
});

// Destino de uma recompensa (113): crédito do Duo ou abater na próxima cobrança.
// Mexe no dinheiro da conta, então só quem administra escolhe.
router.post('/afiliados/recompensas/:id/escolher', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });
    if (!isAdminEmpresa(req.user)) return res.status(403).json({ message: 'Só quem administra a conta escolhe o destino da recompensa.' });
    res.json(await afiliadosService.escolher(empresaId, req.user!.userId, Number(req.params.id), req.body?.destino));
  } catch (err: any) {
    if (err instanceof ErroRecompensa) return res.status(err.status).json({ message: err.message });
    console.error('[Afiliados] escolher', err.message);
    res.status(500).json({ message: 'Não foi possível usar a recompensa agora' });
  }
});

export default router;
