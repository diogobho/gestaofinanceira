import { Router } from 'express';
import { anotacoesController } from './anotacoes.controller';

const router = Router();

// Listar anotações de um lead
router.get('/leads/:leadId/anotacoes', anotacoesController.listByLead);

// Obter anotação por ID
router.get('/anotacoes/:id', anotacoesController.getById);

// Criar nova anotação
router.post('/anotacoes', anotacoesController.create);

// Atualizar anotação
router.put('/anotacoes/:id', anotacoesController.update);

// Deletar anotação
router.delete('/anotacoes/:id', anotacoesController.delete);

export default router;
