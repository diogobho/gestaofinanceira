import { Router } from 'express';
import { disparosController } from './disparos.controller';

const router = Router();

router.get('/disparos/leads', disparosController.listarLeads);
router.get('/disparos/agendados', disparosController.listarAgendados);
router.post('/disparos', disparosController.iniciar);
router.get('/disparos', disparosController.listar);
router.delete('/disparos/:id/cancelar', disparosController.cancelarAgendado);
router.patch('/disparos/:id/agendado', disparosController.editarAgendado);
router.get('/disparos/:id', disparosController.getStatus);

export default router;
