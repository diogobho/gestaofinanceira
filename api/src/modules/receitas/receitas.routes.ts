import { Router } from 'express';
import { receitasController } from './receitas.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/', authRequired, receitasController.list);
// NOVO: Rota para listar receitas sem cliente (antes de /:id para não conflitar)
router.get('/sem-cliente/list', authRequired, receitasController.listSemCliente);
router.get('/:id', authRequired, receitasController.getById);
router.post('/', authRequired, receitasController.create);
router.put('/:id', authRequired, receitasController.update);
// NOVO: Rota para vincular cliente a receita
router.patch('/:id/vincular-cliente', authRequired, receitasController.vincularCliente);
router.delete('/:id', authRequired, receitasController.delete);

export default router;
