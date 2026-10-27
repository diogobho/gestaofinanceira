import { Router } from 'express';
import { dashboardController } from './dashboard.controller';

const router = Router();

router.get('/dashboard', dashboardController.getMetricas);
router.get('/dashboard/funil', dashboardController.getFunilAnalytics);
router.get('/dashboard/produtividade', dashboardController.getProdutividade);

export default router;
