import { Router, Request, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import * as agenda from './agenda-externa.service';
import { Provedor } from './provedores';

/**
 * Agenda externa (103). Cada usuário conecta a PRÓPRIA agenda em Meu perfil. O callback é
 * aberto (é o navegador voltando do Google/Microsoft): quem diz de quem é a conexão é o
 * `state` assinado.
 */
const router = Router();

router.get('/callback/:provedor', async (req: Request, res: Response) => {
  const destino = await agenda.concluirConexao(
    req.params.provedor as Provedor, req.query.code as string, req.query.state as string, req.query.error as string
  );
  res.redirect(destino);
});

type Handler = (req: AuthRequest) => Promise<any> | any;
const rota = (fn: Handler) => async (req: AuthRequest, res: Response) => {
  try {
    res.json((await fn(req)) ?? { success: true });
  } catch (e: any) {
    if (e instanceof agenda.ErroAgenda) return res.status(e.status).json({ message: e.message });
    console.error('[agenda-externa]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const u = (req: AuthRequest) => req.user as any;

router.get('/status', authRequired, rota((req) => agenda.status(u(req).userId)));
router.post('/conectar/:provedor', authRequired, rota((req) => ({
  url: agenda.iniciarConexao(u(req).userId, u(req).empresa_id, req.params.provedor as Provedor),
})));
router.delete('/conta', authRequired, rota((req) => agenda.desconectar(u(req).userId)));

export default router;
