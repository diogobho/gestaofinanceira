import { Router } from 'express';
import { tarefasController } from './tarefas.controller';

const router = Router();

// Listar todas as tarefas da empresa
router.get('/tarefas', tarefasController.listByEmpresa);

// Listar tarefas de um lead específico
router.get('/leads/:leadId/tarefas', tarefasController.listByLead);

// Obter tarefa por ID
router.get('/tarefas/:id', tarefasController.getById);

// Criar nova tarefa
router.post('/tarefas', tarefasController.create);

// Atualizar tarefa
router.put('/tarefas/:id', tarefasController.update);

// Concluir tarefa
router.post('/tarefas/:id/concluir', tarefasController.concluir);

// Deletar tarefa
router.delete('/tarefas/:id', tarefasController.delete);

export default router;
