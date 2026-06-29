import { Router } from 'express';
import { automacoesController } from './automacoes.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/',              authRequired, automacoesController.list);
router.get('/stats',         authRequired, automacoesController.stats);
router.get('/:id',           authRequired, automacoesController.getById);
router.get('/:id/execucoes', authRequired, automacoesController.listExecucoes);
router.post('/',             authRequired, automacoesController.create);
router.put('/:id',           authRequired, automacoesController.update);
router.patch('/:id/toggle',  authRequired, automacoesController.toggle);
router.delete('/:id',        authRequired, automacoesController.delete);

export default router;
