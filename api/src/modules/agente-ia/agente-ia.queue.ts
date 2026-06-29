import { Queue, Worker, Job } from 'bullmq';
import { query } from '../../config/database';
import { agenteIaService } from './agente-ia.service';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = { host: REDIS_HOST, port: REDIS_PORT };

interface AgenteIAJobData {
  contatoId: number;
  leadId: number;
  mensagemTexto: string;
  usuarioId: number;
  empresaId: number;
  triggerAt: string; // ISO string
}

const agenteIAQueue = new Queue<AgenteIAJobData>('agente-ia', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 1,
  },
});

export async function adicionarJobAgente(
  contatoId: number,
  leadId: number,
  mensagemTexto: string,
  usuarioId: number,
  empresaId: number
): Promise<void> {
  // Buscar delay da configuração do agente
  let delayMs = 0;
  try {
    const configResult = await query(
      `SELECT delay_segundos FROM agente_ia_config WHERE empresa_id = $1 AND ativo = true LIMIT 1`,
      [empresaId]
    );
    if (configResult.rows[0]?.delay_segundos) {
      delayMs = configResult.rows[0].delay_segundos * 1000;
    }
  } catch (err: any) {
    console.warn('[AgenteIA] Erro ao buscar delay da config:', err.message);
  }

  // triggerAt é definido no momento da chegada da mensagem (antes do delay)
  // O worker usará este timestamp para coletar todas as mensagens desde então
  const triggerAt = new Date(Date.now() - 1000).toISOString();

  const jobId = `lead-${leadId}`;

  const existing = await agenteIAQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'delayed' || state === 'waiting') {
      console.log(`[AgenteIA] Lead #${leadId} já tem job ${state} — mensagem será agregada automaticamente`);
      return;
    }
    // Job já concluído/falhou mas ainda no Redis — remover para permitir novo job
    if (state === 'completed' || state === 'failed') {
      await existing.remove();
    }
  }

  await agenteIAQueue.add(
    'processar-mensagem',
    { contatoId, leadId, mensagemTexto, usuarioId, empresaId, triggerAt },
    { jobId, delay: delayMs }
  );

  if (delayMs > 0) {
    console.log(`[AgenteIA] Job enfileirado para lead #${leadId} com delay de ${delayMs / 1000}s`);
  } else {
    console.log(`[AgenteIA] Job enfileirado para lead #${leadId} (sem delay)`);
  }
}

export function iniciarWorkerAgente(): Worker {
  const worker = new Worker<AgenteIAJobData>(
    'agente-ia',
    async (job: Job<AgenteIAJobData>) => {
      const { contatoId, leadId, mensagemTexto, usuarioId, empresaId, triggerAt } = job.data;
      console.log(`[AgenteIA] Worker processando lead #${leadId}`);
      await agenteIaService.processarMensagemSeAtivo(
        contatoId,
        leadId,
        mensagemTexto,
        usuarioId,
        empresaId,
        new Date(triggerAt)
      );
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AgenteIA] Job ${job.id} concluído para lead #${job.data.leadId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AgenteIA] Job ${job?.id} falhou para lead #${job?.data?.leadId}:`, err.message);
  });

  console.log('[AgenteIA] Worker BullMQ iniciado (concurrency: 3)');
  return worker;
}
