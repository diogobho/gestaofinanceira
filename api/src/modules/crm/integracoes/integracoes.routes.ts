import { Router } from 'express';
import { integracoesController } from './integracoes.controller';

const router = Router();

router.get('/integracoes/dashboard', integracoesController.getDashboard);

export default router;
