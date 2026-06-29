import { Router } from 'express';
import { categoriasController } from './categorias.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

// ============================================================================
// ROTAS DE CATEGORIAS RECEITAS
// ============================================================================
router.get('/receitas', authRequired, categoriasController.listCategoriasReceitas);
router.get('/receitas/:id', authRequired, categoriasController.getCategoriaReceita);
router.post('/receitas', authRequired, categoriasController.createCategoriaReceita);
router.put('/receitas/:id', authRequired, categoriasController.updateCategoriaReceita);
router.delete('/receitas/:id', authRequired, categoriasController.deleteCategoriaReceita);

// ============================================================================
// ROTAS DE CATEGORIAS DESPESAS
// ============================================================================
router.get('/despesas', authRequired, categoriasController.listCategoriasDespesas);
router.get('/despesas/:id', authRequired, categoriasController.getCategoriaDespesa);
router.post('/despesas', authRequired, categoriasController.createCategoriaDespesa);
router.put('/despesas/:id', authRequired, categoriasController.updateCategoriaDespesa);
router.delete('/despesas/:id', authRequired, categoriasController.deleteCategoriaDespesa);

export default router;
