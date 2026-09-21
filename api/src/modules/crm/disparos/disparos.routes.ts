import { Router } from 'express';
import { disparosController } from './disparos.controller';
import { exigirCapacidade } from '../../../middlewares/capacidade.middleware';

const router = Router();

/**
 * Disparo em massa por WhatsApp — capacidade `disparo_whatsapp` (Enterprise).
 *
 * O guard fica nas rotas que CRIAM e EDITAM, nunca nas de leitura: quem já
 * disparou continua vendo o histórico e o status do que mandou. Esconder o
 * passado de quem mudou de plano seria apagar registro, não aplicar regra.
 *
 * `preview` entra no bloqueio porque ele é o primeiro passo do disparo e já monta
 * a lista de destinatários — liberá-lo daria o trabalho pela metade e terminaria
 * num 403 depois de a pessoa escolher o público.
 */
const soComDisparo = exigirCapacidade('disparo_whatsapp');

// Leitura — sempre aberta a quem tem CRM
router.get('/disparos/leads', disparosController.listarLeads);
router.get('/disparos/agendados', disparosController.listarAgendados);
router.get('/disparos', disparosController.listar);
router.get('/disparos/:id', disparosController.getStatus);

// Escrita — só no plano que tem o canal oficial
router.post('/disparos/preview', soComDisparo, disparosController.preview);
router.post('/disparos', soComDisparo, disparosController.iniciar);
router.patch('/disparos/:id/agendado', soComDisparo, disparosController.editarAgendado);

// Cancelar um disparo agendado é o contrário de disparar: quem perdeu a
// capacidade precisa poder DESLIGAR o que já estava na fila.
router.delete('/disparos/:id/cancelar', disparosController.cancelarAgendado);

export default router;
