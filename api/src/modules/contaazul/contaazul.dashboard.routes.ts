import { Router, Response } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import { contaazulDashboardService, dataValida } from './contaazul.dashboard.service';
import { contaazulService } from './contaazul.service';
import { isAdminEmpresa, isSuperAdmin } from '../../shared/roles';

const router = Router();

/**
 * Dashboard financeiro do Conta Azul.
 *
 * Acesso restrito de propósito: os dados são o financeiro da Panteras, então
 * quem entra é master DA Panteras ou o super_admin (conta global). `master`
 * sozinho NÃO basta — no banco há masters de várias empresas, e liberar pelo
 * tipo_usuario exporia o financeiro de uma empresa às outras.
 */

const EMPRESA_CONTAAZUL = Number(process.env.CONTAAZUL_EMPRESA_ID) || 5; // 5 = Panteras

function podeVer(user: AuthRequest['user']): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  // master OU creator (o dono, que fica acima do master) — a Débora virou creator na
  // migration 065 e checar só 'master' a deixaria de fora do próprio dashboard.
  return Number(user.empresa_id) === EMPRESA_CONTAAZUL && isAdminEmpresa(user);
}

const somenteAutorizados = (req: AuthRequest, res: Response, next: () => void) => {
  if (!podeVer(req.user)) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Este dashboard é restrito à Panteras.',
    });
  }
  next();
};

router.use(authRequired, somenteAutorizados);

/** Diz ao frontend se a aba deve aparecer, sem vazar dado nenhum. */
router.get('/acesso', async (req: AuthRequest, res: Response) => {
  try {
    const status = await contaazulService.status(EMPRESA_CONTAAZUL);
    return res.json({
      liberado: true,
      empresa_id: EMPRESA_CONTAAZUL,
      integracao: { configurado: status.configurado, autorizado: status.autorizado },
      // Conexões (produtos) que o dashboard consolida. Só id/nome/situação — nada
      // de client_id ou token, isto é resposta para o navegador.
      conexoes: status.conexoes.map((c) => ({
        id: c.conexao_id,
        nome: c.nome,
        ativo: c.ativo,
        autorizado: c.autorizado,
      })),
    });
  } catch {
    return res.json({ liberado: true, empresa_id: EMPRESA_CONTAAZUL, integracao: null, conexoes: [] });
  }
});

/** Lançamentos normalizados do período — o frontend filtra e agrega em cima disto. */
router.get('/dados', async (req: AuthRequest, res: Response) => {
  const { data_de, data_ate, forcar } = req.query as Record<string, string>;

  if (!dataValida(data_de) || !dataValida(data_ate)) {
    return res.status(400).json({
      code: 'PERIODO_INVALIDO',
      message: 'Informe data_de e data_ate no formato YYYY-MM-DD.',
    });
  }
  if (data_de > data_ate) {
    return res.status(400).json({
      code: 'PERIODO_INVALIDO',
      message: 'A data inicial não pode ser posterior à final.',
    });
  }

  try {
    const dados = await contaazulDashboardService.obterDados(
      EMPRESA_CONTAAZUL,
      data_de,
      data_ate,
      forcar === '1' || forcar === 'true'
    );
    return res.json({ ...dados, hoje: contaazulDashboardService.hojeSP() });
  } catch (err: any) {
    console.error('[ContaAzul/dashboard] Falha ao buscar dados:', err.message);
    const semAutorizacao = /não autorizado|autorizar de novo/i.test(String(err.message));
    return res.status(semAutorizacao ? 409 : 502).json({
      code: semAutorizacao ? 'NAO_AUTORIZADO' : 'CONTAAZUL_INDISPONIVEL',
      message: err.message,
    });
  }
});

export default router;
