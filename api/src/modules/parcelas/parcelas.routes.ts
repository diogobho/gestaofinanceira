import { Router } from 'express';
import { parcelasController } from './parcelas.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authRequired);

// Listar parcelas de receitas
router.get('/receitas', parcelasController.listReceitas);

// Listar parcelas de despesas
router.get('/despesas', parcelasController.listDespesas);

// Atualizar parcela de receita
router.patch('/receitas/:id', parcelasController.updateParcelaReceita);

// Atualizar parcela de despesa
router.patch('/despesas/:id', parcelasController.updateParcelaDespesa);

// Excluir uma parcela (as demais são renumeradas; sem nenhuma, o lançamento sai)
router.delete('/:tipo(receitas|despesas)/:id', parcelasController.excluirParcela);

// Enviar e-mails de cobrança manualmente
router.post('/enviar-emails-cobranca', parcelasController.enviarEmailsCobranca);

// Enviar WhatsApp de cobrança manualmente
router.post('/enviar-whatsapp-cobranca', parcelasController.enviarWhatsAppCobranca);

export default router;
