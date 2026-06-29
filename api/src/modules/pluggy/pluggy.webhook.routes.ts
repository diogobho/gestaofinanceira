import { Router, Request, Response } from 'express';
import { enqueueSync } from './pluggy.queue';
import { env } from '../../config/env';

const router = Router();

const SYNC_EVENTS = new Set(['item/updated', 'transactions/created', 'transactions/updated']);

router.post('/webhook', (req: Request, res: Response) => {
  const secret = req.headers['x-pluggy-secret'];
  if (env.PLUGGY_WEBHOOK_SECRET && secret !== env.PLUGGY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Responder 2XX antes de processar — requisito Pluggy (<5s)
  res.json({ received: true });

  const { event, itemId } = req.body ?? {};
  if (itemId && SYNC_EVENTS.has(event)) {
    setImmediate(() => {
      enqueueSync(itemId).catch((err: any) =>
        console.error(`[Pluggy Webhook] Erro ao enfileirar sync ${itemId}:`, err.message)
      );
    });
  }
  return;
});

export default router;
