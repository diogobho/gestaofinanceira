import dotenv from 'dotenv';
import path from 'path';

// Carrega o .env de forma determinística (relativo a este arquivo, em dist/config),
// independente do cwd com que o PM2 inicia o processo. Sem isso, variáveis presentes
// apenas no api/.env (ex.: PLUGGY_*) não eram carregadas quando o cwd era a pasta pai.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: parseInt(process.env.PORT || '4100'),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  JWT_ACCESS_EXPIRY: (process.env.JWT_ACCESS_EXPIRY || '2h') as string,
  JWT_REFRESH_EXPIRY: (process.env.JWT_REFRESH_EXPIRY || '7d') as string,
  CORS_ORIGINS: JSON.parse(process.env.CORS_ORIGINS || '["http://localhost:3100"]'),
  PLUGGY_CLIENT_ID: process.env.PLUGGY_CLIENT_ID || '',
  PLUGGY_CLIENT_SECRET: process.env.PLUGGY_CLIENT_SECRET || '',
  PLUGGY_WEBHOOK_SECRET: process.env.PLUGGY_WEBHOOK_SECRET || '',
  PLUGGY_SANDBOX: process.env.PLUGGY_SANDBOX === 'true',
};
