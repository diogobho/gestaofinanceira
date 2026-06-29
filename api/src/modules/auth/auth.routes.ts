import { Router } from 'express';
import { authController } from './auth.controller';
import { authRequired } from '../../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login de usuário
 *     description: Autentica um usuário e retorna um token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', authController.login);
router.post('/registrar', authController.registrar);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Dados do usuário logado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Token inválido
 */
router.get('/me', authRequired, authController.me);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado
 */
router.post('/logout', authRequired, authController.logout);
router.put('/perfil', authRequired, authController.updatePerfil);
router.put('/senha', authRequired, authController.updateSenha);

export default router;
