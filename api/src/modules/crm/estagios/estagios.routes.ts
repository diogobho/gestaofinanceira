import { Router } from 'express';
import { estagiosController } from './estagios.controller';
import { authRequired } from '../../../middlewares/auth.middleware';

const router = Router();

// Leitura: todos os usuários autenticados
router.get('/funis/:funilId/estagios', estagiosController.listByFunil);
router.get('/estagios/:id', estagiosController.getById);

// Escrita: qualquer usuário autenticado com acesso ao CRM
router.post('/funis/:funilId/estagios', authRequired, estagiosController.create);
router.put('/funis/:funilId/estagios/reorder', authRequired, estagiosController.reorder);
router.put('/estagios/:id', authRequired, estagiosController.update);
router.delete('/estagios/:id', authRequired, estagiosController.delete);

export default router;
