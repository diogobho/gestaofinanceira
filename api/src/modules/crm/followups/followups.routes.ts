import { Router } from 'express';
import { followupsController } from './followups.controller';

const router = Router();

// Por lead
router.post('/leads/:leadId/followups', followupsController.criar);
router.get('/leads/:leadId/followups', followupsController.listar);

// Empresa-wide
router.get('/followups', followupsController.listarTodos);
router.get('/followups/metricas', followupsController.metricas);

// Por ID
router.delete('/followups/:id', followupsController.cancelar);
router.patch('/followups/:id/reagendar', followupsController.reagendar);

export default router;
