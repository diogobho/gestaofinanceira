import { Queue, Worker, Job } from 'bullmq';
import { query } from '../../config/database';
import { agenteIaService } from './agente-ia.service';
import {
  dentroDaJanela, proximaJanelaValida, JanelaOperacional, JANELA_PADRAO,
} from '../crm/_shared/agendamento';
import { getJanelaEmpresa } from '../crm/_shared/janela';

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
    // O worker só relança em falha TRANSITÓRIA e anterior a qualquer ferramenta
    // (ver processarMensagemSeAtivo) — erro permanente e falha de envio terminam o job
    // normalmente, sem retry. Por isso 3 tentativas aqui não duplicam ação nem mensagem.
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  },
});

// Janela de atendimento do agente reativo (horário de Brasília). Mensagens que
// chegam fora dela não são respondidas na hora: o job fica adiado até a abertura
// da janela (com jitter para não sair rajada às 8h). Mensagens da madrugada se
// agregam no mesmo job (dedup por jobId) e a IA responde tudo de uma vez na abertura.
//
// A janela deixou de ser 08h–20h chumbada aqui: agora é a JANELA OPERACIONAL da
// empresa (empresas.config), a mesma que o follow-up agendado respeita — inclusive os
// dias da semana. Empresa que não configurou nada recebe JANELA_PADRAO (08:00–20:00,
// todos os dias), que é exatamente o comportamento anterior.

// Atraso mínimo da "continuação" — mensagem que chega com o turno anterior ainda rodando.
// Dá tempo do turno em andamento terminar e gravar a resposta, para o guard
// anti-duplicação decidir com o histórico já completo.
const CONTINUACAO_DELAY_MS = 45_000;

async function delayAteJanelaMs(empresaId: number): Promise<{ ms: number; janela: JanelaOperacional }> {
  let janela: JanelaOperacional = JANELA_PADRAO;
  try {
    janela = await getJanelaEmpresa(empresaId);
  } catch (err: any) {
    console.warn('[AgenteIA] Erro ao ler janela da empresa — usando padrão:', err.message);
  }
  const agora = new Date();
  if (dentroDaJanela(agora, janela)) return { ms: 0, janela };
  // jitter de até 10min na abertura, para a fila represada não sair em rajada.
  const alvo = proximaJanelaValida(agora, janela, null, 10);
  return { ms: Math.max(0, alvo.getTime() - agora.getTime()), janela };
}

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

  // Fora da janela operacional da empresa: adia a resposta para a próxima abertura
  const { ms: delayJanela, janela } = await delayAteJanelaMs(empresaId);
  if (delayJanela > 0) {
    delayMs = Math.max(delayMs, delayJanela);
    console.log(`[AgenteIA] Lead #${leadId}: fora da janela ${janela.inicio}-${janela.fim} — resposta adiada ${Math.round(delayJanela / 60000)}min`);
  }

  // triggerAt é definido no momento da chegada da mensagem (antes do delay)
  // O worker usará este timestamp para coletar todas as mensagens desde então
  const triggerAt = new Date(Date.now() - 1000).toISOString();

  const jobId = `lead-${leadId}`;
  let jobIdFinal = jobId;

  const existing = await agenteIAQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'delayed' || state === 'waiting') {
      console.log(`[AgenteIA] Lead #${leadId} já tem job ${state} — mensagem será agregada automaticamente`);
      return;
    }
    if (state === 'active') {
      // Job EM EXECUÇÃO. Um `add` com o mesmo jobId é ignorado pelo BullMQ, então a
      // mensagem sumia em silêncio (a agregação do worker só pega o que chegou até o
      // passo de coleta — o que vem durante a chamada ao modelo ficava de fora).
      // Enfileira numa segunda faixa: se o turno em andamento não produzir resposta
      // (falha, texto vazio, agente abortado), esta responde; se produzir, o guard
      // anti-duplicação encerra e fica registrado como skip — nunca mais em silêncio.
      jobIdFinal = `${jobId}-cont`;
      const cont = await agenteIAQueue.getJob(jobIdFinal);
      if (cont) {
        const contState = await cont.getState();
        if (contState === 'delayed' || contState === 'waiting') {
          console.log(`[AgenteIA] Lead #${leadId}: job em execução e continuação já ${contState} — mensagem agregada nela`);
          return;
        }
        if (contState === 'active') {
          console.warn(`[AgenteIA] Lead #${leadId}: job e continuação ambos em execução — mensagem não enfileirada`);
          return;
        }
        await cont.remove();
      }
      delayMs = Math.max(delayMs, CONTINUACAO_DELAY_MS);
      console.log(`[AgenteIA] Lead #${leadId}: mensagem chegou com o job em execução — continuação agendada em ${Math.round(delayMs / 1000)}s`);
    } else if (state === 'completed' || state === 'failed') {
      // Job já concluído/falhou mas ainda no Redis — remover para permitir novo job
      await existing.remove();
    }
  }

  await agenteIAQueue.add(
    'processar-mensagem',
    { contatoId, leadId, mensagemTexto, usuarioId, empresaId, triggerAt },
    { jobId: jobIdFinal, delay: delayMs }
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
