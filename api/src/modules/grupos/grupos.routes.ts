import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { exigirCapacidade } from '../../middlewares/capacidade.middleware';
import * as grupos from './grupos.service';
import * as campanhas from './campanhas.service';
import { temCapacidade, recusa } from '../../shared/capacidades';

/**
 * Página de Grupos (migration 088). Capacidade `grupos_whatsapp` (Profissional e
 * Enterprise). Quem está no número oficial chega aqui e recebe o aviso da Meta —
 * o 409 com `ERRO_OFICIAL` é o texto que a tela mostra.
 */
const router = Router();
router.use(authRequired, exigirCapacidade('grupos_whatsapp'));

type Handler = (req: AuthRequest) => Promise<any>;
const rota = (fn: Handler) => async (req: AuthRequest, res: Response) => {
  try {
    const r = await fn(req);
    res.json(r ?? { success: true });
  } catch (e: any) {
    if (e instanceof grupos.ErroGrupos) return res.status(e.status).json({ message: e.message });
    console.error('[grupos]', e?.message || e);
    res.status(500).json({ message: 'Não foi possível concluir agora. Tente de novo.' });
  }
};
const u = (req: AuthRequest) => req.user as any;
const id = (req: AuthRequest) => Number(req.params.id);

router.get('/canal', rota((req) => grupos.canal(u(req).userId)));
router.get('/lista', rota((req) => grupos.listarGrupos(u(req).userId)));

router.get('/mensagens', rota((req) => grupos.listarMensagens(u(req))));
// Mensagem de campanha é das campanhas (Enterprise), mesmo entrando pela rota comum.
router.post('/mensagens', async (req: AuthRequest, res: Response, next) => {
  if (req.body?.campanha_id && u(req).nivel !== 'super_admin' && !(await temCapacidade(u(req).empresa_id, 'grupos_campanhas').catch(() => true))) {
    return res.status(403).json(recusa('grupos_campanhas'));
  }
  next();
}, rota((req) => grupos.criarMensagem(u(req), req.body)));
router.put('/mensagens/:id', rota((req) => grupos.atualizarMensagem(u(req), id(req), req.body)));
router.post('/mensagens/:id/ativa', rota((req) => grupos.alternarMensagem(u(req), id(req), !!req.body?.ativa)));
router.post('/mensagens/:id/enviar-agora', rota((req) => grupos.enviarAgora(u(req), id(req))));
router.get('/mensagens/:id/envios', rota((req) => grupos.enviosDa(u(req), id(req))));
router.delete('/mensagens/:id', rota((req) => grupos.excluirMensagem(u(req), id(req))));

router.get('/boas-vindas', rota((req) => grupos.listarBoasVindas(u(req))));
router.post('/boas-vindas', rota((req) => grupos.salvarBoasVindas(u(req), req.body)));
router.put('/boas-vindas/:id', rota((req) => grupos.salvarBoasVindas(u(req), req.body, id(req))));
router.delete('/boas-vindas/:id', rota((req) => grupos.excluirBoasVindas(u(req), id(req))));

// ── Campanhas (089): só Enterprise ────────────────────────────────────────────
const soCampanhas = exigirCapacidade('grupos_campanhas');
const gid = (req: AuthRequest) => Number(req.params.gid);
router.get('/chips', soCampanhas, rota((req) => campanhas.chipsDaEmpresa(u(req).empresa_id)));
router.get('/campanhas', soCampanhas, rota((req) => campanhas.listarCampanhas(u(req))));
router.post('/campanhas', soCampanhas, rota((req) => campanhas.criarCampanha(u(req), req.body)));
router.get('/campanhas/:id', soCampanhas, rota((req) => campanhas.obterCampanha(u(req), id(req))));
router.put('/campanhas/:id', soCampanhas, rota((req) => campanhas.atualizarCampanha(u(req), id(req), req.body)));
router.delete('/campanhas/:id', soCampanhas, rota((req) => campanhas.excluirCampanha(u(req), id(req))));
router.get('/campanhas/:id/painel', soCampanhas, rota((req) => campanhas.painel(u(req), id(req), Number(req.query.dias) || 30)));
router.post('/campanhas/:id/grupos', soCampanhas, rota((req) =>
  campanhas.adicionarGrupoExistente(u(req), id(req), Number(req.body?.chip_id), String(req.body?.grupo_id || ''))));
router.post('/campanhas/:id/grupos/criar', soCampanhas, rota((req) => campanhas.criarGrupoAgora(u(req), id(req))));
router.post('/campanhas/:id/grupos/:gid/ativo', soCampanhas, rota((req) => campanhas.alternarGrupo(u(req), id(req), gid(req), !!req.body?.ativo)));
router.delete('/campanhas/:id/grupos/:gid', soCampanhas, rota((req) => campanhas.removerGrupo(u(req), id(req), gid(req))));

export default router;
