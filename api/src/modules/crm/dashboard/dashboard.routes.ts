import { Router } from 'express';
import { dashboardController } from './dashboard.controller';

const router = Router();

router.get('/dashboard', dashboardController.getMetricas);
router.get('/dashboard/funil', dashboardController.getFunilAnalytics);

export default router;
