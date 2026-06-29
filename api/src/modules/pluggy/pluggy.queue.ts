import { Queue, Worker, Job } from 'bullmq';
import { pluggyService } from './pluggy.service';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

interface PluggySyncJobData {
  itemId: string;
}

const pluggySyncQueue = new Queue<PluggySyncJobData>('pluggy-sync', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

export async function enqueueSync(itemId: string): Promise<void> {
  const jobId = `pluggy-sync-${itemId}`;
  const existing = await pluggySyncQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') return;
  }
  await pluggySyncQueue.add('sync', { itemId }, { jobId });
}

export function iniciarWorkerPluggy(): void {
  const worker = new Worker<PluggySyncJobData>(
    'pluggy-sync',
    async (job: Job<PluggySyncJobData>) => {
      console.log(`[Pluggy] Iniciando sync itemId=${job.data.itemId}`);
      await pluggyService.sincronizarTransacoes(job.data.itemId);
    },
    { connection, concurrency: 2 }
  );

  worker.on('completed', (job) => {
    console.log(`[Pluggy] Sync ok: ${job.data.itemId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Pluggy] Sync falhou: ${job?.data?.itemId}`, err.message);
  });
}
