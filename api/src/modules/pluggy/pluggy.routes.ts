import { Router } from 'express';
import { authRequired } from '../../middlewares/auth.middleware';
import { pluggyController } from './pluggy.controller';

const router = Router();

router.get('/connect-token', authRequired, pluggyController.getConnectToken);
router.post('/items', authRequired, pluggyController.registrarItem);
router.get('/conexoes', authRequired, pluggyController.listarConexoes);
router.post('/conexoes/:id/sync', authRequired, pluggyController.syncManual);
router.patch('/conexoes/:id', authRequired, pluggyController.atualizarConexao);
router.delete('/conexoes/:id', authRequired, pluggyController.desativarConexao);

export default router;
