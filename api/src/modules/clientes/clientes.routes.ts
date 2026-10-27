import { Router } from 'express';
import { clientesController } from './clientes.controller';
import { authRequired } from '../../middlewares/auth.middleware';
import multer from 'multer';

const router = Router();

// Importar clientes de planilha: mesmo upload da importação de leads (CSV/Excel, 10 MB).
const upload = multer({
  dest: '/tmp/crm-imports/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname) || ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido. Use CSV ou Excel (.xlsx, .xls)'));
  },
});
router.post('/importacao/preview', authRequired, upload.single('file'), clientesController.importacaoPreview);
router.post('/importacao/importar', authRequired, upload.single('file'), clientesController.importar);

/**
 * @swagger
 * /clientes:
 *   get:
 *     tags: [Clientes]
 *     summary: Listar clientes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ATIVO, PAUSADO, CONCLUIDO]
 *       - in: query
 *         name: mentor_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Busca por nome ou email
 *     responses:
 *       200:
 *         description: Lista de clientes paginada
 */
router.get('/', authRequired, clientesController.list);

/**
 * @swagger
 * /clientes/{id}:
 *   get:
 *     tags: [Clientes]
 *     summary: Buscar cliente por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cliente encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cliente'
 *       404:
 *         description: Cliente não encontrado
 */
router.get('/:id', authRequired, clientesController.getById);

/**
 * @swagger
 * /clientes:
 *   post:
 *     tags: [Clientes]
 *     summary: Criar novo cliente
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Cliente'
 *     responses:
 *       201:
 *         description: Cliente criado
 */
router.post('/', authRequired, clientesController.create);

/**
 * @swagger
 * /clientes/{id}:
 *   put:
 *     tags: [Clientes]
 *     summary: Atualizar cliente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cliente atualizado
 */
router.put('/:id', authRequired, clientesController.update);

/**
 * @swagger
 * /clientes/{id}:
 *   delete:
 *     tags: [Clientes]
 *     summary: Deletar cliente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Cliente deletado
 */
router.delete('/:id', authRequired, clientesController.delete);

/**
 * @swagger
 * /clientes/{id}/notificar-whatsapp:
 *   post:
 *     tags: [Clientes]
 *     summary: Enviar notificação de pagamento via WhatsApp
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do cliente
 *     responses:
 *       200:
 *         description: Notificação enviada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 whatsapp_to:
 *                   type: string
 *       400:
 *         description: Erro ao enviar notificação
 */
router.post('/:id/notificar-whatsapp', authRequired, clientesController.notificarWhatsApp);

router.post('/enviar-email', authRequired, clientesController.enviarEmailClientes);

export default router;
