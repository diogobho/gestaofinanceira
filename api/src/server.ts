import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { asaasService } from './services/asaas.service';
import { isMainInstance } from './shared/utils';
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
import suporteRoutes from './modules/suporte/suporte.routes';
import midiaRoutes from './modules/midia/midia.routes';
import automacoesRoutes from './modules/automacoes/automacoes.routes';
import gruposRoutes from './modules/grupos/grupos.routes';
import pluggyRoutes from './modules/pluggy/pluggy.routes';
import pluggyWebhookRoutes from './modules/pluggy/pluggy.webhook.routes';
import contaazulRoutes from './modules/contaazul/contaazul.routes';
import contaazulDashboardRoutes from './modules/contaazul/contaazul.dashboard.routes';
import metaWhatsappRoutes from './modules/whatsapp/meta/meta-whatsapp.routes';
import onboardingRoutes from './modules/onboarding/onboarding.routes';
import { iniciarWorkerPluggy } from './modules/pluggy/pluggy.queue';
import { checkSubscription } from './middlewares/subscription.middleware';
import path from 'path';

// Atualizar parcelas atrasadas (diário)
import './jobs/atualizar-parcelas-atrasadas';

// Follow-up scheduler
import './jobs/followup-scheduler';

// Disparo scheduler (WhatsApp + e-mail agendados)
import './jobs/disparo-scheduler';

// Lembretes de reunião agendada (-24h/-1h + no-show)
import './jobs/reuniao-lembretes-scheduler';
import './jobs/suporte-limpeza-scheduler';

// Cota de mídia do WhatsApp por empresa (1 GB, o arquivo mais antigo sai primeiro)
import './jobs/midia-retencao-scheduler';

// Aviso de fim do teste grátis (1 dia antes, 09:00 de Brasília)
import './jobs/trial-aviso-scheduler';
import './jobs/trial-suspensao-scheduler';
import './jobs/grupos-scheduler';

// Agente IA — worker BullMQ
import { iniciarWorkerAgente } from './modules/agente-ia/agente-ia.queue';

const app = express();

// Os webhooks públicos de captação (`/crm/webhook/form-*`) são chamados de fora, e não
// só pelo servidor do WordPress: a página do cliente pode postar direto do JavaScript.
// Nesse caso o POST urlencoded é "simple request" — ele CHEGA e o lead é criado —, mas
// sem `Access-Control-Allow-Origin` o navegador proíbe a página de LER a resposta: o
// fetch estoura, o formulário mostra "não conseguimos enviar" e a pessoa reenvia. Foi o
// que aconteceu com escolapanthers.com.br em 31/08/2026: 3 envios, 1 lead + 2 anexos.
//
// Nessas rotas a origem é livre; em todo o resto valem as origens do .env. É um
// middleware só, com origem decidida por requisição, porque dois `cors` empilhados
// mandariam DOIS `Access-Control-Allow-Origin` quando a origem também estivesse na lista
// (o caso de `/crm/webhook/secret`, que a app chama autenticada) — e navegador nenhum
// aceita o header duplicado.
//
// Liberar aqui não afrouxa nada: a rota é autenticada por secret na URL ou no header, o
// corpo vem do próprio visitante e a resposta não passa de `{success, lead_id}`. Sem
// `credentials`, que é justamente o que não se combina com origem curinga.
const EH_WEBHOOK_PUBLICO = /^\/api\/(?:gestao\/)?crm\/webhook\/form-[a-z-]+\/?$/;

app.use(cors((req, callback) => {
  if (EH_WEBHOOK_PUBLICO.test(req.path)) {
    callback(null, { origin: '*', methods: ['POST', 'OPTIONS'] });
    return;
  }
  callback(null, { origin: env.CORS_ORIGINS, credentials: true });
}));
app.use(express.json({
  limit: '50mb',
  // O webhook da Meta é validado pela assinatura X-Hub-Signature-256, calculada sobre
  // o corpo CRU — o JSON re-serializado não bate byte a byte. Guardado só nessa rota.
  verify: (req: any, _res, buf) => {
    if (req.originalUrl?.includes('/whatsapp/meta/webhook')) req.rawBody = buf;
  },
}));
app.use(checkSubscription);

// Mídia de conversa (áudio/imagem/vídeo/PDF do WhatsApp) — SEMPRE autenticada.
//
// Era `express.static` aberto em `/uploads`, espelhando o alias estático que o nginx
// mantinha em `/api/gestao/uploads/`: 23 GB de mídia de 10 empresas acessíveis sem
// token. Agora quem serve é `midia.routes`, que autentica e confere no banco de qual
// empresa é o arquivo antes de entregá-lo. Ver o cabeçalho de `midia.routes.ts`.
//
// Montado em `/api` porque o nginx reescreve `/api/gestao/` → `/api/` no proxy, e
// também na raiz porque `media_url` é gravado como `/uploads/...` (acesso direto à
// porta 4100 e qualquer consumidor interno).
app.use('/api', midiaRoutes);
app.use('/', midiaRoutes);

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

// Conta Azul — OAuth2. O /callback é público (chega o navegador vindo do Conta Azul,
// sem header); a proteção é o `state` de uso único.
app.use('/api/contaazul', contaazulRoutes);
app.use('/api/gestao/contaazul', contaazulRoutes);

// Dashboard financeiro do Conta Azul — exige JWT e é restrito à Panteras/super_admin.
// Vem depois do bloco OAuth porque só monta em /dashboard, sem conflitar com ele.
app.use('/api/contaazul/dashboard', contaazulDashboardRoutes);
app.use('/api/gestao/contaazul/dashboard', contaazulDashboardRoutes);

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
app.use('/api', suporteRoutes);
app.use('/api/gestao', suporteRoutes);
app.use('/api/automacoes', automacoesRoutes);
app.use('/api/gestao/automacoes', automacoesRoutes);
app.use('/api/grupos', gruposRoutes);
app.use('/api/gestao/grupos', gruposRoutes);
app.use('/api/pluggy', pluggyRoutes);
app.use('/api/gestao/pluggy', pluggyRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/gestao/onboarding', onboardingRoutes);

app.use(errorHandler);

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🚀 API Duofuturo rodando em http://0.0.0.0:${env.PORT}`);
  console.log(`📊 Health check: http://localhost:${env.PORT}/api/health`);
  console.log(`📚 Documentação Swagger: http://localhost:${env.PORT}/api/docs`);
  iniciarWorkerAgente();
  iniciarWorkerPluggy();
  conferirContaAsaas();
});

/**
 * Diz nos logs, a cada boot, qual conta do Asaas a chave em uso representa.
 * A trava de verdade está em asaasService.garantirContaCorreta(), no momento de
 * assinar; isto aqui só evita descobrir a chave errada pela primeira venda.
 */
function conferirContaAsaas() {
  if (!isMainInstance || !process.env.ASAAS_API_KEY) return;
  asaasService.getConta()
    .then(conta => console.log(`💳 Asaas: cobranças na conta ${conta.nome} (CNPJ ${conta.cnpj})`))
    .catch(err => console.error('💳 Asaas: não deu para identificar a conta da chave —', err?.message || err));
}
