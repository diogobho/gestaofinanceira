import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { exigirCapacidade } from '../../middlewares/capacidade.middleware';
import * as grupos from './grupos.service';

/**
 * Página de Grupos (migration 088). Capacidade `grupos_whatsapp` (Profissional e
 * Enterprise). Quem está no número oficial chega aqui e recebe o aviso da Meta —
 * o 409 com `ERRO_OFICIAL` é o texto que a tela mostra.
 */
const router = Router();
router.use(authRequired, exigirCapacidade('grupos_whatsapp'));

type Handler = (req: AuthRequest) => Promise<any>;
const rota = (fn: Handler) => async (req: AuthRequest, res: Response) => {
  try {
    const r = await fn(req);
    res.json(r ?? { success: true });
  } catch (e: any) {
    if (e instanceof grupos.ErroGrupos) return res.status(e.status).json({ message: e.message });
    console.error('[grupos]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const u = (req: AuthRequest) => req.user as any;
const id = (req: AuthRequest) => Number(req.params.id);

router.get('/canal', rota((req) => grupos.canal(u(req).userId)));
router.get('/lista', rota((req) => grupos.listarGrupos(u(req).userId)));

router.get('/mensagens', rota((req) => grupos.listarMensagens(u(req))));
router.post('/mensagens', rota((req) => grupos.criarMensagem(u(req), req.body)));
router.put('/mensagens/:id', rota((req) => grupos.atualizarMensagem(u(req), id(req), req.body)));
router.post('/mensagens/:id/ativa', rota((req) => grupos.alternarMensagem(u(req), id(req), !!req.body?.ativa)));
router.post('/mensagens/:id/enviar-agora', rota((req) => grupos.enviarAgora(u(req), id(req))));
router.get('/mensagens/:id/envios', rota((req) => grupos.enviosDa(u(req), id(req))));
router.delete('/mensagens/:id', rota((req) => grupos.excluirMensagem(u(req), id(req))));

router.get('/boas-vindas', rota((req) => grupos.listarBoasVindas(u(req))));
router.post('/boas-vindas', rota((req) => grupos.salvarBoasVindas(u(req), req.body)));
router.put('/boas-vindas/:id', rota((req) => grupos.salvarBoasVindas(u(req), req.body, id(req))));
router.delete('/boas-vindas/:id', rota((req) => grupos.excluirBoasVindas(u(req), id(req))));

export default router;
