import { Router } from 'express';
import { origensController } from './origens.controller';

const router = Router();

router.get('/origens', origensController.list);
router.post('/origens', origensController.create);
router.put('/origens/:id', origensController.update);
router.delete('/origens/:id', origensController.delete);

export default router;
