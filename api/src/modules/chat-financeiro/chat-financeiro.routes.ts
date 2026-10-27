import { Router } from 'express';
import { authRequired } from '../../middlewares/auth.middleware';
import { chatFinanceiroController } from './chat-financeiro.controller';

const router = Router();

// Rotas do usuário (requerem autenticação)
router.post('/chat-financeiro/mensagem', authRequired, chatFinanceiroController.enviarMensagem);
router.get('/chat-financeiro/historico', authRequired, chatFinanceiroController.getHistorico);
router.delete('/chat-financeiro/historico', authRequired, chatFinanceiroController.limparHistorico);

// Crédito do Duo (111): saldo para todos, compra só para quem administra (no controller)
router.get('/chat-financeiro/creditos', authRequired, chatFinanceiroController.getCreditos);
router.post('/chat-financeiro/creditos/comprar', authRequired, chatFinanceiroController.comprarCreditos);

// Config (verificação de admin feita no controller)
router.get('/chat-financeiro/config', authRequired, chatFinanceiroController.getConfig);
router.put('/chat-financeiro/config', authRequired, chatFinanceiroController.updateConfig);

export default router;
