import { Router } from 'express';
import controller from './meta-whatsapp.controller';

const router = Router();

// Rota pública — Meta precisa acessar sem JWT
router.get('/webhook', (req, res) => controller.verifyWebhook(req, res));
router.post('/webhook', (req, res) => controller.receiveWebhook(req, res));

export default router;
