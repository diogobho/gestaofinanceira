import { Router } from 'express';
import { authMiddleware, masterOnly } from '../../middlewares/auth.middleware';
import { exigirCapacidade } from '../../middlewares/capacidade.middleware';
import whatsappController from './whatsapp.controller';
import { canalController } from './canal/canal.controller';
import { oficialController } from './canal/oficial.controller';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

/**
 * Canal oficial do CLIENTE (Embedded Signup) — guard próprio, e montado ANTES do
 * `whatsapp_qr`. Quem tem direito ao número oficial não pode depender da chave do
 * QR Code para conectá-lo: são capacidades diferentes, e um dia o Enterprise pode
 * deixar de ter a do QR sem que isso lhe tire o canal que ele paga.
 */
const soComOficial = exigirCapacidade('whatsapp_oficial');
router.get('/canal/oficial', soComOficial, (req, res) => oficialController.get(req, res));
router.get('/canal/oficial/contas', soComOficial, (req, res) => oficialController.listar(req, res));
router.post('/canal/oficial/conectar', soComOficial, (req, res) => oficialController.conectar(req, res));
router.post('/canal/oficial/desconectar', soComOficial, (req, res) => oficialController.desconectar(req, res));

// ...e o resto do módulo exige WhatsApp no plano. `whatsapp_qr` é a chave certa
// mesmo para quem está no número oficial: o Enterprise tem as DUAS capacidades de
// propósito — a migração para a Cloud API é por usuário, e um operador pode ficar
// no QR Code (grupos e sincronização de contatos só existem lá). Quem isto barra é
// o Starter, que não tem WhatsApp nenhum.
router.use(exigirCapacidade('whatsapp_qr'));

// Canal da empresa: número oficial (Cloud API) ou QR Code — janela de 24h e modelos
router.get('/canal', (req, res) => canalController.getCanal(req, res).catch((e) => res.status(500).json({ error: e.message })));
router.post(
  '/canal/modelos',
  exigirCapacidade('modelos_meta'),
  (req, res) => canalController.criarModelo(req, res).catch((e) => res.status(500).json({ error: e.message }))
);
router.get('/canal/modelos', (req, res) => canalController.getModelos(req, res).catch((e) => res.status(500).json({ error: e.message })));
router.get('/canal/janela', (req, res) => canalController.getJanela(req, res).catch((e) => res.status(500).json({ error: e.message })));

/**
 * @swagger
 * /api/whatsapp/config:
 *   get:
 *     summary: Obter configuração WhatsApp do usuário
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuração obtida com sucesso
 */
router.get('/config', whatsappController.getConfig);

/**
 * Pedir o QR Code explicitamente. Existe porque conta com direito ao número
 * oficial NÃO ganha mais instância Baileys sozinha: subir um processo de 400 MB e
 * mostrar um QR para quem comprou o canal oficial é entregar o produto errado.
 * Quem quiser o QR assim mesmo (grupos, agenda do celular) clica e recebe.
 */
router.post('/qr/ativar', whatsappController.ativarQr);

/**
 * @swagger
 * /api/whatsapp/config:
 *   post:
 *     summary: Configurar porta WhatsApp
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               porta:
 *                 type: number
 *     responses:
 *       200:
 *         description: Porta configurada com sucesso
 */
router.post('/config', masterOnly, whatsappController.setConfig);

/**
 * @swagger
 * /api/whatsapp/status:
 *   get:
 *     summary: Obter status da conexão WhatsApp
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status obtido com sucesso
 */
router.get('/status', whatsappController.getStatus);

/**
 * @swagger
 * /api/whatsapp/qr:
 *   get:
 *     summary: Obter QR Code para conexão
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR Code obtido com sucesso
 */
router.get('/qr', whatsappController.getQRCode);

/**
 * @swagger
 * /api/whatsapp/qr-image:
 *   get:
 *     summary: Obter QR Code como imagem PNG
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Imagem do QR Code
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/qr-image', whatsappController.getQRImage);

/**
 * @swagger
 * /api/whatsapp/test:
 *   post:
 *     summary: Enviar mensagem de teste
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numero:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mensagem enviada com sucesso
 */
router.post('/test', whatsappController.sendTest);

/**
 * @swagger
 * /api/whatsapp/disconnect:
 *   post:
 *     summary: Desconectar WhatsApp
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Desconectado com sucesso
 */
router.post('/disconnect', whatsappController.disconnect);

/**
 * @swagger
 * /api/whatsapp/reconectar:
 *   post:
 *     summary: Reconectar agora (body { novo: true } apaga a sessão e gera QR novo)
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconexão iniciada
 */
router.post('/reconectar', whatsappController.reconectar);

// Rotas para gestão de todos os usuários da empresa (apenas master)
router.get('/empresa/usuarios', masterOnly, whatsappController.getEmpresaUsuarios);
router.get('/empresa/usuarios/:userId/status', masterOnly, whatsappController.getUsuarioStatus);
router.get('/empresa/usuarios/:userId/qr-image', masterOnly, whatsappController.getUsuarioQRImage);
router.post('/empresa/usuarios/:userId/disconnect', masterOnly, whatsappController.disconnectUsuario);
router.post('/empresa/usuarios/:userId/reconectar', masterOnly, whatsappController.reconectarUsuario);
router.post('/empresa/usuarios/:userId/qr/ativar', masterOnly, whatsappController.ativarQrUsuario);

export default router;
