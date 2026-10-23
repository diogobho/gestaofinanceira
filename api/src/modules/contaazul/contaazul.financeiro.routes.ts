import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { podeUsarContaAzul } from '../../shared/roles';
import * as ca from './contaazul.conexao.service';

/**
 * Conta Azul em Receitas e Despesas (106/107), o par das rotas do Asaas (asaas-receitas.routes).
 * Tudo aqui é só da creator (a dona da conta) desde 20/10/2026 — antes conectar era de quem
 * administra e ver/conferir, de qualquer um da empresa. A volta do login do Conta Azul é o /contaazul/callback.
 */
const router = Router();

type Handler = (req: AuthRequest) => Promise<any>;
const rota = (fn: Handler) => async (req: AuthRequest, res: Response) => {
  try {
    if (!(req.user as any)?.empresa_id) return res.status(403).json({ message: 'Usuário sem empresa.' });
    if (!podeUsarContaAzul(req.user as any)) {
      return res.status(403).json({ message: 'Só a dona da conta pode usar a integração com o Conta Azul.' });
    }
    res.json(await fn(req));
  } catch (e: any) {
    if (e instanceof ca.ErroContaAzul) return res.status(e.status).json({ message: e.message });
    console.error('[ContaAzulImport]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const u = (req: AuthRequest) => req.user as any;

router.get('/status', authRequired, rota((req) => ca.status(u(req).empresa_id)));
router.post('/conectar', authRequired, rota((req) =>
  ca.iniciar(u(req).empresa_id, u(req).userId, req.body?.importar_desde,
    Number(req.body?.substituir) || null, req.body?.voltar_para)));
router.post('/conexao/:id/importar', authRequired, rota((req) =>
  ca.ligarImportacao(u(req).empresa_id, u(req).userId, Number(req.params.id), req.body?.importar_desde)));
router.post('/conferir', authRequired, rota((req) => ca.conferir(u(req).empresa_id)));
router.delete('/conexao/:id', authRequired, rota((req) => ca.desconectar(u(req).empresa_id, Number(req.params.id))));

export default router;
