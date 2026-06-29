import { Router } from 'express';
import { tagsController } from './tags.controller';

const router = Router();

router.get('/tags', tagsController.list);
router.get('/tags/:id', tagsController.getById);
router.post('/tags', tagsController.create);
router.put('/tags/:id', tagsController.update);
router.delete('/tags/:id', tagsController.delete);

export default router;
