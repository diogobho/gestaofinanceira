import { Router, urlencoded } from 'express';
import { webhookController } from './webhook.controller';

const router = Router();

// Rota publica (sem auth JWT) - autenticada via X-Webhook-Secret header
router.post('/webhook/whatsapp', webhookController.receberMensagem);
router.post('/webhook/whatsapp/group-participant-add', webhookController.novoParticipanteGrupo);
// Telemetria de conexão (logout/ban/rede) empurrada pela instância Baileys
router.post('/webhook/whatsapp-conexao', webhookController.registrarConexao);

// Webhook do formulário Leadership (WordPress/Elementor) → cria lead no funil Club.
// urlencoded escopado aqui pois o Elementor envia application/x-www-form-urlencoded
// (express.json global cobre o caso de envio em JSON).
router.post('/webhook/form-leadership', urlencoded({ extended: true }), webhookController.receberFormLeadership);

// Webhook de formulário do site → cria lead no funil "Escola Empreendedorismo" (Nome + Telefone).
// urlencoded escopado (Elementor/HTML enviam x-www-form-urlencoded; express.json global cobre JSON).
router.post('/webhook/form-escola', urlencoded({ extended: true }), webhookController.receberFormEscola);

// Webhook do formulário "Caixa Rápido" (WordPress/Elementor) → lead qualificado no funil
// "Escola Empreendedorismo", com a Débora como proprietária e origem "Caixa Rápido".
router.post('/webhook/form-caixa-rapido', urlencoded({ extended: true }), webhookController.receberFormCaixaRapido);

// Webhook do app de Diagnóstico → cria o lead no "Funil Principal" da conta DuoFuturo.
// Payload JSON gerado pela própria app (express.json global cobre).
router.post('/webhook/form-diagnostico', webhookController.receberFormDiagnostico);

// Webhook de eventos do SendFlow → lead da campanha "Desafio 52 Semanas" no funil
// "Escola Empreendedorismo", com a Débora como proprietária.
// urlencoded escopado porque não se sabe em que Content-Type a plataforma posta
// (express.json global cobre o JSON). O GET só responde "estou no ar".
router.post('/webhook/sendflow', urlencoded({ extended: true }), webhookController.receberSendflow);
router.get('/webhook/sendflow', webhookController.statusSendflow);

// Webhook de compra da Hotmart (evento PURCHASE_APPROVED) → cria lead no funil "Boas vindas".
// Hotmart envia application/json; autenticado pelo hottok no header X-HOTMART-HOTTOK.
router.post('/webhook/hotmart', webhookController.receberCompraHotmart);

// Rota para obter o secret (protegida pelo auth do CRM index.ts)
// Sera montada separadamente com auth
router.get('/webhook/secret', webhookController.getSecret);

export default router;
