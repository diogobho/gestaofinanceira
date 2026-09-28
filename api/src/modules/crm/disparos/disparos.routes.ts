import { Router } from 'express';
import { disparosController } from './disparos.controller';
import { Response, NextFunction } from 'express';
import { exigirCapacidade } from '../../../middlewares/capacidade.middleware';
import { AuthRequest } from '../../../middlewares/auth.middleware';
import { enviaPeloOficial, MSG_PRIMEIRO_CONTATO_SO_OFICIAL } from '../../whatsapp/canal/contas';

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

/**
 * O plano permite; falta o CANAL de quem dispara (28/09/2026). O envio sai pela
 * porta do usuário, e no Enterprise quem ainda está no QR não dispara: disparo em
 * massa é primeiro contato, o que a Meta pune num número comum. Os chips QR da
 * Panteras mandaram 413 disparos em 30 dias antes desta regra.
 *
 * Vale até para super_admin: o risco é do chip, não de quem clica.
 */
async function soPeloOficial(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (await enviaPeloOficial(req.user?.userId)) return next();
    return res.status(403).json({ code: 'SO_PELO_OFICIAL', message: MSG_PRIMEIRO_CONTATO_SO_OFICIAL });
  } catch (err: any) {
    console.error('[disparo] canal do remetente', err?.message);
    return res.status(503).json({ code: 'CANAL_INDISPONIVEL', message: 'Não foi possível conferir o seu canal de WhatsApp agora. Tente de novo.' });
  }
}

// Leitura — sempre aberta a quem tem CRM
router.get('/disparos/leads', disparosController.listarLeads);
router.get('/disparos/agendados', disparosController.listarAgendados);
router.get('/disparos', disparosController.listar);
router.get('/disparos/:id', disparosController.getStatus);

// Escrita — só no plano que tem o canal oficial
router.post('/disparos/preview', soComDisparo, soPeloOficial, disparosController.preview);
router.post('/disparos', soComDisparo, soPeloOficial, disparosController.iniciar);
router.patch('/disparos/:id/agendado', soComDisparo, soPeloOficial, disparosController.editarAgendado);

// Cancelar um disparo agendado é o contrário de disparar: quem perdeu a
// capacidade precisa poder DESLIGAR o que já estava na fila.
router.delete('/disparos/:id/cancelar', disparosController.cancelarAgendado);

export default router;
