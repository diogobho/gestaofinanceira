import { Router, Response } from 'express';
import { AuthRequest } from '../../../middlewares/auth.middleware';
import { listar, salvar, ErroRespostas } from './respostas-botao.service';

/** Respostas por botão de um estágio (094). Montado no router do CRM (auth + plano). */
const router = Router();

const tratar = (fn: (req: AuthRequest) => Promise<any>) => async (req: AuthRequest, res: Response) => {
  try {
    res.json(await fn(req));
  } catch (e: any) {
    if (e instanceof ErroRespostas) return res.status(e.status).json({ message: e.message });
    console.error('[RespostaBotao]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora.' });
  }
};

router.get('/estagios/:id/respostas-botao', tratar((req) => listar((req.user as any).empresa_id, Number(req.params.id))));
router.put('/estagios/:id/respostas-botao', tratar((req) => salvar((req.user as any).empresa_id, Number(req.params.id), req.body?.regras)));

export default router;
