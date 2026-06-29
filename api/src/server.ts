import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middlewares/error.middleware';
import authRoutes from './modules/auth/auth.routes';
import clientesRoutes from './modules/clientes/clientes.routes';
import sessoesRoutes from './modules/sessoes/sessoes.routes';
import receitasRoutes from './modules/receitas/receitas.routes';
import despesasRoutes from './modules/despesas/despesas.routes';
import usuariosRoutes from './modules/usuarios/usuarios.routes';
import categoriasRoutes from './modules/categorias/categorias.routes';
import parcelasRoutes from './modules/parcelas/parcelas.routes';
import notificacoesRoutes from './modules/notificacoes/notificacoes.routes';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import whatsappInstanciasRoutes from './modules/whatsapp/instancias/instancias.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import crmRoutes from './modules/crm';
import webhookRoutes from './modules/crm/webhook/webhook.routes';
import chatFinanceiroRoutes from './modules/chat-financeiro/chat-financeiro.routes';
import configuracoesSmtpRoutes from './modules/configuracoes-smtp/configuracoes-smtp.routes';
import assinaturasRoutes from './modules/assinaturas/assinaturas.routes';
import automacoesRoutes from './modules/automacoes/automacoes.routes';
import pluggyRoutes from './modules/pluggy/pluggy.routes';
import pluggyWebhookRoutes from './modules/pluggy/pluggy.webhook.routes';
import metaWhatsappRoutes from './modules/whatsapp/meta/meta-whatsapp.routes';
import { iniciarWorkerPluggy } from './modules/pluggy/pluggy.queue';
import { checkSubscription } from './middlewares/subscription.middleware';
import path from 'path';

// Atualizar parcelas atrasadas (diário)
import './jobs/atualizar-parcelas-atrasadas';

// Follow-up scheduler
import './jobs/followup-scheduler';

// Disparo scheduler (WhatsApp + e-mail agendados)
import './jobs/disparo-scheduler';

// Agente IA — worker BullMQ
import { iniciarWorkerAgente } from './modules/agente-ia/agente-ia.queue';

const app = express();

app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(checkSubscription);

// Servir arquivos de midia do WhatsApp
app.use('/uploads', express.static(path.join('/var/www/apps/gestao_financeira/uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Duofuturo API - Documentação',
  customfavIcon: 'https://swagger.io/favicon.ico'
}));

// Webhook WhatsApp - rota publica (sem JWT, autenticada via X-Webhook-Secret)
// IMPORTANTE: deve ficar ANTES das rotas CRM que aplicam authMiddleware
app.use('/api/crm', webhookRoutes);
app.use('/api/gestao/crm', webhookRoutes);

// Webhook Pluggy Open Finance - rota pública (valida X-Pluggy-Secret)
app.use('/api/pluggy', pluggyWebhookRoutes);
app.use('/api/gestao/pluggy', pluggyWebhookRoutes);

// Webhook Meta WhatsApp Cloud API - rota pública (validada via verify_token)
// /api/whatsapp/meta = path que o Nginx passa (strip de /api/gestao/ → /api/)
app.use('/api/whatsapp/meta', metaWhatsappRoutes);
app.use('/api/gestao/whatsapp/meta', metaWhatsappRoutes);

// Rotas em /api (legado)
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/sessoes', sessoesRoutes);
app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/parcelas', parcelasRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp/instancias', whatsappInstanciasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/crm', crmRoutes);

// Rotas em /api/gestao (frontend atual)
app.use('/api/gestao/auth', authRoutes);
app.use('/api/gestao/clientes', clientesRoutes);
app.use('/api/gestao/sessoes', sessoesRoutes);
app.use('/api/gestao/receitas', receitasRoutes);
app.use('/api/gestao/despesas', despesasRoutes);
app.use('/api/gestao/usuarios', usuariosRoutes);
app.use('/api/gestao/categorias', categoriasRoutes);
app.use('/api/gestao/parcelas', parcelasRoutes);
app.use('/api/gestao/notificacoes', notificacoesRoutes);
app.use('/api/gestao/whatsapp', whatsappRoutes);
app.use('/api/gestao/whatsapp/instancias', whatsappInstanciasRoutes);
app.use('/api/gestao/dashboard', dashboardRoutes);
app.use('/api/gestao/crm', crmRoutes);
app.use('/api', chatFinanceiroRoutes);
app.use('/api/gestao', chatFinanceiroRoutes);
app.use('/api/configuracoes-smtp', configuracoesSmtpRoutes);
app.use('/api/gestao/configuracoes-smtp', configuracoesSmtpRoutes);
app.use('/api', assinaturasRoutes);
app.use('/api/gestao', assinaturasRoutes);
app.use('/api/automacoes', automacoesRoutes);
app.use('/api/gestao/automacoes', automacoesRoutes);
app.use('/api/pluggy', pluggyRoutes);
app.use('/api/gestao/pluggy', pluggyRoutes);

app.use(errorHandler);

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🚀 API Duofuturo rodando em http://0.0.0.0:${env.PORT}`);
  console.log(`📊 Health check: http://localhost:${env.PORT}/api/health`);
  console.log(`📚 Documentação Swagger: http://localhost:${env.PORT}/api/docs`);
  iniciarWorkerAgente();
  iniciarWorkerPluggy();
});
