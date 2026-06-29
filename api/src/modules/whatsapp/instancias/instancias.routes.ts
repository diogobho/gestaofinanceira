import { Router } from 'express';
import { instanciasController } from './instancias.controller';
import { authRequired, masterOnly } from '../../../middlewares/auth.middleware';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authRequired);

// Leitura: todos os usuários autenticados
router.get('/', instanciasController.list);
router.get('/:id', instanciasController.getById);
router.get('/:id/status', instanciasController.getStatus);
router.get('/:id/qrcode', instanciasController.getQRCode);

// Escrita: apenas Master/Admin
router.post('/', masterOnly, instanciasController.create);
router.put('/:id', masterOnly, instanciasController.update);
router.post('/:id/disconnect', masterOnly, instanciasController.disconnect);
router.delete('/:id', masterOnly, instanciasController.delete);

export default router;
