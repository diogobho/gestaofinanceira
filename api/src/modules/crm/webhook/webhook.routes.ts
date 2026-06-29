import { Router, urlencoded } from 'express';
import { webhookController } from './webhook.controller';

const router = Router();

// Rota publica (sem auth JWT) - autenticada via X-Webhook-Secret header
router.post('/webhook/whatsapp', webhookController.receberMensagem);
router.post('/webhook/whatsapp/group-participant-add', webhookController.novoParticipanteGrupo);

// Webhook do formulário Leadership (WordPress/Elementor) → cria lead no funil Club.
// urlencoded escopado aqui pois o Elementor envia application/x-www-form-urlencoded
// (express.json global cobre o caso de envio em JSON).
router.post('/webhook/form-leadership', urlencoded({ extended: true }), webhookController.receberFormLeadership);

// Rota para obter o secret (protegida pelo auth do CRM index.ts)
// Sera montada separadamente com auth
router.get('/webhook/secret', webhookController.getSecret);

export default router;
