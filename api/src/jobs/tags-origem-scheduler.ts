/**
 * Job: tags de origem nos leads (30/09/2026) — hoje só a Panteras.
 *
 * A cada minuto, só na instância 0, olha os leads alterados nos últimos 15 minutos
 * (folga para restart). Ao subir, varre as últimas 24h: cobre o que entrou com a API
 * fora do ar. Regras e motivo em `modules/crm/tags/tags-origem.ts`.
 */

import cron from 'node-cron';
import { aplicarTagsDeOrigem, EMPRESAS_COM_TAGS_DE_ORIGEM } from '../modules/crm/tags/tags-origem';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[TagsOrigem]';

async function rodada(minutos: number) {
  for (const empresaId of EMPRESAS_COM_TAGS_DE_ORIGEM) {
    try {
      const r = await aplicarTagsDeOrigem(empresaId, minutos);
      if (r.aplicadas) console.log(`${PREFIXO} empresa ${empresaId}: ${r.aplicadas} tag(s) em ${r.leadsLidos} lead(s) alterado(s)`);
    } catch (err: any) {
      console.error(`${PREFIXO} empresa ${empresaId}:`, err?.message || err);
    }
  }
}

if (isMainInstance) {
  cron.schedule('* * * * *', () => rodada(15));
  setTimeout(() => rodada(24 * 60), 30_000);
  console.log(`${PREFIXO} Cron registrado (a cada minuto).`);
}
