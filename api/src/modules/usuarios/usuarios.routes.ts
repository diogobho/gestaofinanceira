import { Router } from 'express';
import { usuariosController } from './usuarios.controller';
import { authRequired, masterOnly, adminOnly, empresaRequired } from '../../middlewares/auth.middleware';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authRequired);

// Admin e Master podem gerenciar usuários (com restrições no service)
router.get('/', masterOnly, usuariosController.list);
router.get('/empresas', adminOnly, usuariosController.listEmpresas); // Apenas admin
router.post('/empresas', adminOnly, usuariosController.createEmpresa); // Criar empresa
router.get('/empresa', empresaRequired, usuariosController.listByEmpresa); // Qualquer usuário da empresa (para seleção de responsáveis)
router.get('/:id', masterOnly, usuariosController.getById);
router.post('/', masterOnly, usuariosController.create);
router.put('/:id', masterOnly, usuariosController.update);
router.put('/:id/permissoes', masterOnly, usuariosController.updatePermissoes);
router.delete('/:id', masterOnly, usuariosController.delete);

export default router;
