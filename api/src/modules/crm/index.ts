import { Router, Request, Response } from 'express';
import { authMiddleware, empresaRequired } from '../../middlewares/auth.middleware';
import { query } from '../../config/database';

import funisRoutes from './funis/funis.routes';
import estagiosRoutes from './estagios/estagios.routes';
import leadsRoutes from './leads/leads.routes';
import contatosRoutes from './contatos/contatos.routes';
import tagsRoutes from './tags/tags.routes';
import tarefasRoutes from './tarefas/tarefas.routes';
import anotacoesRoutes from './anotacoes/anotacoes.routes';
import importacaoRoutes from './importacao/importacao.routes';
import disparosRoutes from './disparos/disparos.routes';
import disparosEmailRoutes from './disparos-email/disparos-email.routes';
import dashboardRoutes from './dashboard/dashboard.routes';
import agenteIaRoutes from '../agente-ia/agente-ia.routes';
import followupsRoutes from './followups/followups.routes';
import { webhookController } from './webhook/webhook.controller';

const router = Router();

// Todas as rotas do CRM requerem autenticação e empresa vinculada
router.use(authMiddleware);
router.use(empresaRequired);

// Montar rotas com prefixos
router.use('/funis', funisRoutes);
router.use(estagiosRoutes);  // Já tem /funis/:funilId/estagios
router.use(leadsRoutes);     // Já tem /funis/:funilId/leads e /leads
router.use(contatosRoutes);  // Já tem /contatos
router.use(tagsRoutes);      // Já tem /tags
router.use(tarefasRoutes);   // /tarefas e /leads/:leadId/tarefas
router.use(anotacoesRoutes); // /anotacoes e /leads/:leadId/anotacoes
router.use(importacaoRoutes); // /importacao/preview e /importacao/importar
router.use(disparosRoutes);   // /disparos
router.use(disparosEmailRoutes); // /disparos-email
router.use(dashboardRoutes);  // /dashboard
router.use(agenteIaRoutes);  // /agente-ia/*
router.use(followupsRoutes); // /leads/:leadId/followups e /followups/:id

// Listar usuários da empresa (acessível por todos os usuários da empresa)
router.get('/usuarios', async (req: Request, res: Response) => {
  try {
    const empresaId = (req as any).user?.empresa_id;
    const result = await query(
      'SELECT id, nome, email FROM usuarios WHERE empresa_id = $1 AND ativo = true ORDER BY nome',
      [empresaId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao listar usuários da empresa:', error);
    return res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Webhook secret (protegido por auth)
router.get('/webhook/secret', webhookController.getSecret);

export default router;
