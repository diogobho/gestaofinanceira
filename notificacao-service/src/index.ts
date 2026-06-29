import cron from 'node-cron';
import dotenv from 'dotenv';
import { verificarENotificarVencimentos } from './services/notification.service';
import pool from './config/database';

dotenv.config();

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *'; // Padrão: 9h da manhã todos os dias

console.log('='.repeat(70));
console.log('🚀 SERVIÇO DE NOTIFICAÇÕES - DUOFUTURO GESTÃO FINANCEIRA');
console.log('='.repeat(70));
console.log(`📅 Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
console.log(`⏰ Agendamento: ${CRON_SCHEDULE} (cron)`);
console.log(`📧 SMTP: ${process.env.SMTP_USER ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`💾 Database: ${process.env.DATABASE_URL ? '✅ Conectado' : '❌ Não configurado'}`);
console.log('='.repeat(70));
console.log('');

// Executar imediatamente ao iniciar (para testes)
const executarImediatamente = process.argv.includes('--now');

if (executarImediatamente) {
  console.log('▶️  Modo de execução imediata ativado (--now)');
  console.log('');
  verificarENotificarVencimentos()
    .then(() => {
      console.log('\n✅ Execução imediata concluída.');
      console.log('⏰ Próxima execução agendada para:', CRON_SCHEDULE);
    })
    .catch((error) => {
      console.error('\n❌ Erro na execução imediata:', error);
    });
}

// Agendar execução periódica
cron.schedule(CRON_SCHEDULE, async () => {
  console.log('\n' + '='.repeat(70));
  console.log(`⏰ CRON DISPARADO - ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(70) + '\n');

  try {
    await verificarENotificarVencimentos();
    console.log('✅ Execução do cron concluída com sucesso.\n');
  } catch (error) {
    console.error('❌ Erro na execução do cron:', error);
  }
});

console.log('✅ Serviço de notificações iniciado com sucesso!');
console.log(`⏰ Próxima execução agendada para: ${CRON_SCHEDULE}\n`);

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM recebido. Encerrando serviço...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT recebido. Encerrando serviço...');
  await pool.end();
  process.exit(0);
});

// Manter o processo ativo
process.stdin.resume();
