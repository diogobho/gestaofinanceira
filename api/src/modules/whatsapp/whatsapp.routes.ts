import { Router } from 'express';
import { authMiddleware, masterOnly } from '../../middlewares/auth.middleware';
import whatsappController from './whatsapp.controller';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

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

// Rotas para gestão de todos os usuários da empresa (apenas master)
router.get('/empresa/usuarios', masterOnly, whatsappController.getEmpresaUsuarios);
router.get('/empresa/usuarios/:userId/status', masterOnly, whatsappController.getUsuarioStatus);
router.get('/empresa/usuarios/:userId/qr-image', masterOnly, whatsappController.getUsuarioQRImage);
router.post('/empresa/usuarios/:userId/disconnect', masterOnly, whatsappController.disconnectUsuario);

export default router;
