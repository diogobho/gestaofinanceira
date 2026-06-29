import { Router } from 'express';
import { despesasController } from './despesas.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/', authRequired, despesasController.list);
router.get('/:id', authRequired, despesasController.getById);
router.post('/', authRequired, despesasController.create);
router.put('/:id', authRequired, despesasController.update);
router.delete('/:id', authRequired, despesasController.delete);

export default router;
