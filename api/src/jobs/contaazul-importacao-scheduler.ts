/**
 * Job: lançamentos do Conta Azul em Receitas e Despesas (106). Só na instância 0.
 * O Conta Azul não tem webhook: a cada 15 min busca o que mudou (data_alteracao); a cada
 * 6 h repassa tudo desde `importar_desde`, o que também acha as parcelas excluídas.
 */
import cron from 'node-cron';
import { sincronizarTodas } from '../modules/contaazul/contaazul.importacao.service';
import { isMainInstance } from '../shared/utils';

let rodando = false;
async function rodar(completa: boolean) {
  if (rodando) return;
  rodando = true;
  try { await sincronizarTodas(completa); }
  catch (e: any) { console.error('[ContaAzulImport] Erro:', e?.message || e); }
  finally { rodando = false; }
}

if (isMainInstance) {
  cron.schedule('*/15 * * * *', () => rodar(false), { timezone: 'America/Sao_Paulo' });
  cron.schedule('41 */6 * * *', () => rodar(true), { timezone: 'America/Sao_Paulo' });
  console.log('[ContaAzulImport] Cron registrado (alterações a cada 15 min, completo a cada 6 h).');
}
