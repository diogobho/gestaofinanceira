import { Router } from 'express';
import { configuracoesSmtpController } from './configuracoes-smtp.controller';
import { authRequired, masterOnly } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authRequired, masterOnly);

router.get('/', configuracoesSmtpController.get);
router.put('/', configuracoesSmtpController.upsert);
router.delete('/', configuracoesSmtpController.delete);
router.post('/testar', configuracoesSmtpController.testar);

export default router;
