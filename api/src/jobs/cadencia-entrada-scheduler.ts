/**
 * Job: cadência de entrada por origem (06/10/2026) — Clube do Livro e Desafio 52 semanas
 * no funil Escola da Panteras. A cada 5 minutos, só na instância 0. Regras e motivo em
 * `modules/crm/cadencia-entrada/cadencia-entrada.ts`.
 */

import cron from 'node-cron';
import { aplicarCadenciaEntrada, REGRAS_ENTRADA } from '../modules/crm/cadencia-entrada/cadencia-entrada';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[CadenciaEntrada]';

async function rodada() {
  for (const regra of REGRAS_ENTRADA) {
    try {
      const r = await aplicarCadenciaEntrada(regra);
      if (r.transferidos || r.movidos || r.tarefas || r.vinculados || r.nomeados) {
        console.log(`${PREFIXO} funil ${regra.funilId}: ${r.transferidos} card(s) passado(s) a quem abordou, ${r.movidos} movido(s), ${r.tarefas} tarefa(s), ${r.vinculados} contato(s) vinculado(s), ${r.nomeados} nome(s) — ${r.lidos} lead(s) lidos`);
      }
    } catch (err: any) {
      console.error(`${PREFIXO} funil ${regra.funilId}:`, err?.message || err);
    }
  }
}

if (isMainInstance) {
  cron.schedule('*/5 * * * *', rodada);
  console.log(`${PREFIXO} Cron registrado (a cada 5 minutos).`);
}
