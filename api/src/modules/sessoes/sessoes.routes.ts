import { Router } from 'express';
import { sessoesController } from './sessoes.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /sessoes:
 *   get:
 *     tags: [Sessões]
 *     summary: Listar sessões
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
 *         name: cliente_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: mentor_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: modalidade
 *         schema:
 *           type: string
 *           enum: [ONLINE, PRESENCIAL]
 *       - in: query
 *         name: data_ini
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: data_fim
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Lista de sessões paginada
 */
router.get('/', authRequired, sessoesController.list);

/**
 * @swagger
 * /sessoes/{id}:
 *   get:
 *     tags: [Sessões]
 *     summary: Buscar sessão por ID
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
 *         description: Sessão encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sessao'
 *       404:
 *         description: Sessão não encontrada
 */
router.get('/:id', authRequired, sessoesController.getById);

/**
 * @swagger
 * /sessoes:
 *   post:
 *     tags: [Sessões]
 *     summary: Criar nova sessão
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Sessao'
 *     responses:
 *       201:
 *         description: Sessão criada
 */
router.post('/', authRequired, sessoesController.create);

/**
 * @swagger
 * /sessoes/{id}:
 *   put:
 *     tags: [Sessões]
 *     summary: Atualizar sessão
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
 *         description: Sessão atualizada
 */
router.put('/:id', authRequired, sessoesController.update);

/**
 * @swagger
 * /sessoes/{id}:
 *   delete:
 *     tags: [Sessões]
 *     summary: Deletar sessão
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
 *         description: Sessão deletada
 */
router.delete('/:id', authRequired, sessoesController.delete);

export default router;
