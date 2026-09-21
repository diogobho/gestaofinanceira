/**
 * Job: Follow-up Scheduler — apenas o agendamento.
 *
 * Toda a lógica está em `followup/motor.ts` (decisões, testável com dublês) e
 * `followup/despacho.ts` (envio real). Este arquivo só liga o cron às portas
 * reais: registrar `cron.schedule` no import é o que impedia testar o ciclo.
 */

import cron from 'node-cron';
import { executarCiclo, PortasMotor } from './followup/motor';
import { despachar, aposEnvio } from './followup/despacho';
import { followupsService } from '../modules/crm/followups/followups.service';
import { janelasPorEmpresa } from '../modules/crm/_shared/janela';
import { diagnosticarChip } from '../modules/crm/_shared/chip';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[FollowUp Scheduler]';

export const portasDeProducao: PortasMotor = {
  followups: followupsService,
  janelas: janelasPorEmpresa,
  despachar,
  aposEnvio,
  diagnosticarChip,
  agora: () => Date.now(),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  aleatorio: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  logger: {
    info: (m) => console.log(`${PREFIXO} ${m}`),
    warn: (m) => console.warn(`${PREFIXO} ${m}`),
    error: (m) => console.error(`${PREFIXO} ${m}`),
  },
};

// Impede que um ciclo lento se sobreponha ao próximo NESTA instância. A exclusão
// mútua de verdade é o claim atômico no banco — este sinalizador só evita trabalho
// redundante e uso desnecessário do pool.
let processando = false;

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    if (processando) {
      console.log(`${PREFIXO} Ciclo anterior ainda em andamento — pulando.`);
      return;
    }
    processando = true;
    try {
      const r = await executarCiclo(portasDeProducao);
      if (r.enviados || r.falhados || r.conflitos) {
        console.log(`${PREFIXO} Ciclo: ${r.enviados} enviado(s), ${r.adiados} adiado(s), ` +
          `${r.falhados} falhado(s), ${r.conflitos} conflito(s) de config, ${r.restantes} na fila.`);
      }
    } catch (err: any) {
      console.error(`${PREFIXO} Erro no cron:`, err.message);
    } finally {
      processando = false;
    }
  });
  console.log(`${PREFIXO} Cron registrado (a cada 1 min).`);
} else {
  console.log(`${PREFIXO} Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
