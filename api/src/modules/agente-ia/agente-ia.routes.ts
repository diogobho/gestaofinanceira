import { Router } from 'express';
import { agenteIaController } from './agente-ia.controller';

const router = Router();

// Configuração global (leitura para todos, escrita só super_admin — verificado no controller)
router.get('/agente-ia/config', agenteIaController.getConfig);
router.put('/agente-ia/config', agenteIaController.updateConfig);

// Toggle por estágio
router.put('/agente-ia/estagios/:estagioId', agenteIaController.toggleEstagio);

// Toggle e status por lead
router.put('/agente-ia/leads/:leadId', agenteIaController.toggleLead);
router.get('/agente-ia/leads/:leadId/status', agenteIaController.getLeadStatus);

export default router;
