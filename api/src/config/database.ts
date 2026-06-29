import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Erro em client ocioso do pool: logar e seguir. O pg descarta o client com
// problema e cria outro sob demanda — não há motivo para derrubar o processo
// inteiro (que afetaria todas as requisições em andamento nesta instância).
pool.on('error', (err) => {
  console.error('Erro no pool PostgreSQL (client ocioso):', err.message);
});

export const query = async (text: string, params?: any[]) => {
  const res = await pool.query(text, params);
  return res;
};
