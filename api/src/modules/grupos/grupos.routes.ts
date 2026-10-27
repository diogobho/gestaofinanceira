import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { exigirCapacidade } from '../../middlewares/capacidade.middleware';
import * as grupos from './grupos.service';
import * as campanhas from './campanhas.service';
import * as horarios from './horarios.service';
import { temCapacidade, recusa } from '../../shared/capacidades';

/**
 * Página de Grupos (migration 088). Capacidade `grupos_whatsapp` (Profissional e
 * Enterprise). Quem está no número oficial conecta aqui um chip por QR Code só para
 * os grupos (101, `/chip/*`) — sem ele, o 409 de `portaQrDo` é o que a tela mostra.
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
// Chip de Grupos (101): o QR de quem está no número oficial — só Enterprise tem o oficial.
router.post('/chip/ativar', rota(async (req) => {
  if (!(await temCapacidade(u(req).empresa_id, 'whatsapp_oficial'))) throw new grupos.ErroGrupos('Disponível no plano Enterprise.', 403);
  return grupos.ativarChipDeGrupos(u(req).userId);
}));
router.get('/chip/qr-image', async (req: AuthRequest, res: Response) => {
  const png = await grupos.qrDoChipDeGrupos(u(req).userId).catch(() => null);
  if (!png) return res.status(404).json({ message: 'QR Code ainda não gerado' });
  res.set('Content-Type', 'image/png').set('Cache-Control', 'no-store').send(png);
});
router.post('/chip/desconectar', rota((req) => grupos.desconectarChipDeGrupos(u(req).userId)));
router.get('/lista', rota((req) => grupos.listarGrupos(u(req).userId)));
// Quem está nos grupos escolhidos — o seletor de @ da mensagem. `grupos` = ids separados por vírgula.
router.get('/participantes', rota((req) => grupos.participantesDosGrupos(
  u(req), String(req.query.grupos || '').split(',').filter(Boolean), Number(req.query.campanha_id) || null)));

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
// Números da equipe no QR que podem dividir o envio da boas-vindas no privado (07/10/2026).
router.get('/boas-vindas/chips', rota((req) => grupos.chipsParaBoasVindas(u(req))));
const salvarBv = (req: AuthRequest, editarId?: number) => grupos.salvarBoasVindas(u(req), req.body, editarId);
router.post('/boas-vindas', rota((req) => salvarBv(req)));
router.put('/boas-vindas/:id', rota((req) => salvarBv(req, id(req))));
router.delete('/boas-vindas/:id', rota((req) => grupos.excluirBoasVindas(u(req), id(req))));

// Abrir e fechar grupo por horário (109, #420): fechar = só admins enviam.
router.get('/horarios', rota((req) => horarios.listarHorarios(u(req))));
router.post('/horarios', rota((req) => horarios.salvarHorario(u(req), req.body)));
router.put('/horarios/:id', rota((req) => horarios.salvarHorario(u(req), req.body, id(req))));
router.post('/horarios/:id/ativa', rota((req) => horarios.alternarHorario(u(req), id(req), !!req.body?.ativa)));
router.post('/horarios/:id/agora', rota((req) => horarios.executarAgora(u(req), id(req), req.body?.acao)));
router.get('/horarios/:id/execucoes', rota((req) => horarios.execucoesDo(u(req), id(req))));
router.delete('/horarios/:id', rota((req) => horarios.excluirHorario(u(req), id(req))));

// Levar para o CRM quem entra no grupo (093). `regra` null apaga. `dono_id`: regra do chip de
// outro usuário — só quem administra a empresa, que vê as de todos na lista.
router.get('/crm', rota((req) => campanhas.listarLevarParaCrm(u(req))));
router.put('/crm', rota((req) => campanhas.salvarLevarParaCrm(
  u(req), String(req.body?.grupo_id || ''), req.body?.grupo_nome ?? null, req.body?.regra ?? null, Number(req.body?.dono_id) || null)));

// ── Campanhas (089): só Enterprise ────────────────────────────────────────────
const soCampanhas = exigirCapacidade('grupos_campanhas');
const gid = (req: AuthRequest) => Number(req.params.gid);
router.get('/chips', soCampanhas, rota((req) => campanhas.chipsDaEmpresa(u(req).empresa_id)));
router.get('/campanhas', soCampanhas, rota((req) => campanhas.listarCampanhas(u(req))));
router.post('/campanhas', soCampanhas, rota((req) => campanhas.criarCampanha(u(req), req.body)));
router.get('/campanhas/:id', soCampanhas, rota((req) => campanhas.obterCampanha(u(req), id(req))));
router.put('/campanhas/:id', soCampanhas, rota((req) => campanhas.atualizarCampanha(u(req), id(req), req.body)));
router.delete('/campanhas/:id', soCampanhas, rota((req) => campanhas.excluirCampanha(u(req), id(req))));
router.get('/campanhas/:id/painel', soCampanhas, rota((req) => campanhas.painel(u(req), id(req), {
  inicio: req.query.inicio as string | undefined,
  fim: req.query.fim as string | undefined,
  dias: Number(req.query.dias) || undefined,
  grupo: req.query.grupo as string | undefined,
  utm: req.query.utm as string | undefined,
})));
router.post('/campanhas/:id/grupos', soCampanhas, rota((req) =>
  campanhas.adicionarGrupoExistente(u(req), id(req), Number(req.body?.chip_id), String(req.body?.grupo_id || ''))));
router.post('/campanhas/:id/grupos/criar', soCampanhas, rota((req) => campanhas.criarGrupoAgora(u(req), id(req))));
router.post('/campanhas/:id/grupos/:gid/ativo', soCampanhas, rota((req) => campanhas.alternarGrupo(u(req), id(req), gid(req), !!req.body?.ativo)));
router.delete('/campanhas/:id/grupos/:gid', soCampanhas, rota((req) => campanhas.removerGrupo(u(req), id(req), gid(req))));

export default router;
