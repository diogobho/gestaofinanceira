import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { pool, query } from '../config/database';
import { instancia } from '../modules/whatsapp/canal/instancia';
import { ehPortaVirtual, portaParaUsuarioNovo, contaAtivaDoUsuario } from '../modules/whatsapp/canal/contas';
import { temCapacidade } from '../shared/capacidades';

const execAsync = promisify(exec);

const PORTA_INICIAL = 3013;
const PORTA_MAXIMA = 3200;
const DIR_INSTANCIAS = '/var/www/apps/whatsapp-integration';
const CREATE_SCRIPT = path.join(DIR_INSTANCIAS, 'create-instance.sh');

// O mesmo destino e o mesmo secret que o webhook.controller confere.
const WEBHOOK_URL = 'http://localhost:4100/api/crm/webhook/whatsapp';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024';

// Serializa a escolha de porta entre as 3 instâncias do cluster.
const LOCK_PORTA = 730_130_13;

// Conta cancelada, suspensa ou sem assinatura não ganha instância: cada uma é um
// processo de 150–400 MB no ar.
const STATUS_ELEGIVEIS = ['trial', 'ativa', 'aguardando_pagamento'];

// A tela chama a cada carregamento; religar/registrar mais que isso é ruído.
const INTERVALO_GARANTIA_MS = 5 * 60_000;

/**
 * Primeira porta da faixa fora de `ocupadas`. Pura, para teste.
 */
export function escolherPorta(ocupadas: Set<number>, inicial = PORTA_INICIAL, maxima = PORTA_MAXIMA): number | null {
  for (let porta = inicial; porta <= maxima; porta++) {
    if (!ocupadas.has(porta)) return porta;
  }
  return null;
}

/**
 * Portas que deixaram rastro em disco: sessão, contatos, mapa de @lid, webhook,
 * status ou ecosystem. Porta sem dono no banco mas com sessão guardada NÃO está
 * livre — a instância subiria logada no número de quem usou a porta antes
 * (caso da 3016, parada desde 11/08 com a sessão de outra pessoa).
 */
export function portasComRastro(nomes: string[]): Set<number> {
  const portas = new Set<number>();
  const padrao = /(?:^|[-.])whatsapp-(\d{4,5})(?:\.json)?$|^ecosystem\.porta-(\d{4,5})\.config\.js$/;
  for (const nome of nomes) {
    const m = nome.match(padrao);
    const p = Number(m?.[1] ?? m?.[2]);
    if (p) portas.add(p);
  }
  return portas;
}

function lerRastroEmDisco(): Set<number> {
  const nomes: string[] = [];
  for (const dir of [DIR_INSTANCIAS, path.join(DIR_INSTANCIAS, '.baileys_auth')]) {
    try { nomes.push(...fs.readdirSync(dir)); } catch { /* diretório ausente */ }
  }
  return portasComRastro(nomes);
}

async function portasNoPm2(): Promise<Set<number>> {
  const { stdout } = await execAsync('pm2 jlist', { maxBuffer: 20 * 1024 * 1024, timeout: 20_000 });
  const portas = new Set<number>();
  for (const p of JSON.parse(stdout)) {
    const m = String(p.name).match(/^whatsapp-(\d+)$/);
    if (m) portas.add(Number(m[1]));
    const env = Number(p.pm2_env?.env?.PORT ?? p.pm2_env?.PORT);
    if (env) portas.add(env);
  }
  return portas;
}

function portaLivreNoSistema(porta: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(porta);
  });
}

async function reservarPorta(usuarioId: number): Promise<{ porta: number; nova: boolean }> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock($1)', [LOCK_PORTA]);

    // Outra chamada pode ter reservado enquanto esta esperava o lock.
    const atual = await cliente.query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [usuarioId]);
    if (atual.rows[0]?.whatsapp_porta) {
      await cliente.query('COMMIT');
      return { porta: atual.rows[0].whatsapp_porta, nova: false };
    }

    const noBanco = await cliente.query(`SELECT DISTINCT whatsapp_porta FROM usuarios WHERE whatsapp_porta IS NOT NULL`);
    const ocupadas = new Set<number>([
      ...noBanco.rows.map((r: any) => Number(r.whatsapp_porta)),
      ...(await portasNoPm2()),
      ...lerRastroEmDisco(),
    ]);

    let porta: number | null = null;
    while ((porta = escolherPorta(ocupadas)) !== null) {
      if (await portaLivreNoSistema(porta)) break;
      ocupadas.add(porta); // outro serviço escutando nela
    }
    if (porta === null) throw new Error('Nenhuma porta WhatsApp disponível');

    await cliente.query(`UPDATE usuarios SET whatsapp_porta = $1 WHERE id = $2`, [porta, usuarioId]);
    await cliente.query('COMMIT');
    return { porta, nova: true };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function subirInstancia(porta: number): Promise<string> {
  // Ambiente mínimo: o `pm2 start` repassa o env de quem chama para o processo novo,
  // e o da API carrega credenciais que a instância não tem por que ver.
  const { stdout } = await execAsync(`${CREATE_SCRIPT} ${porta}`, {
    timeout: 90_000,
    env: {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME || '/root',
      ...(process.env.PM2_HOME ? { PM2_HOME: process.env.PM2_HOME } : {}),
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    },
  });
  return stdout.trim().split('\n').pop() || '';
}

/**
 * Registra o webhook do CRM pela própria instância, esperando ela responder.
 * O script já grava o arquivo antes do boot; isto cobre a instância que subiu
 * com um arquivo vazio ou apontando para outro lugar.
 */
async function registrarWebhook(porta: number): Promise<void> {
  const limite = Date.now() + 45_000;
  for (;;) {
    try {
      await instancia(porta).post('/webhook/register',
        { url: WEBHOOK_URL, secret: WEBHOOK_SECRET, name: 'CRM DuoFuturo' },
        { timeout: 5000 });
      return;
    } catch (err) {
      if (Date.now() > limite) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// Chaveado por usuário + intenção: um "garanta o que der" em andamento não pode
// responder ao clique de "quero o QR Code" — devolveria o null dele.
const emAndamento = new Map<string, Promise<number | null>>();
const ultimaGarantia = new Map<number, number>();

async function garantir(
  usuarioId: number,
  aguardarInstancia: boolean,
  permitirQrNovo: boolean
): Promise<number | null> {
  const r = await query(
    `SELECT u.id, u.empresa_id, u.whatsapp_porta, a.status AS assinatura
     FROM usuarios u
     LEFT JOIN assinaturas a ON a.empresa_id = u.empresa_id
     WHERE u.id = $1 AND u.ativo = true`,
    [usuarioId]
  );
  const u = r.rows[0];
  if (!u) return null;
  if (u.whatsapp_porta && ehPortaVirtual(u.whatsapp_porta)) return u.whatsapp_porta;
  if (!u.whatsapp_porta && !STATUS_ELEGIVEIS.includes(u.assinatura)) return null;

  let porta: number = u.whatsapp_porta;
  let nova = false;
  if (!porta) {
    // Já tem número oficial (próprio ou da empresa): porta virtual, sem instância
    // e sem QR.
    const conta = await contaAtivaDoUsuario(usuarioId, u.empresa_id);
    const oficial = conta?.porta_virtual ?? (await portaParaUsuarioNovo(u.empresa_id));
    if (oficial) {
      await query(`UPDATE usuarios SET whatsapp_porta = $1 WHERE id = $2 AND whatsapp_porta IS NULL`, [oficial, usuarioId]);
      return oficial;
    }
    // Tem DIREITO ao número oficial e ainda não conectou: não ganha instância
    // Baileys sozinho. Subir um processo de 400 MB e abrir um QR Code para quem
    // comprou o canal oficial entrega o produto errado — e o QR é justamente o
    // que o plano dele existe para não usar. A tela oferece os dois caminhos, e
    // quem pedir o QR chega aqui com `permitirQrNovo`.
    if (!permitirQrNovo && (await temCapacidade(u.empresa_id, 'whatsapp_oficial'))) return null;
    ({ porta, nova } = await reservarPorta(usuarioId));
  } else if (Date.now() - (ultimaGarantia.get(porta) ?? 0) < INTERVALO_GARANTIA_MS) {
    return porta;
  }
  ultimaGarantia.set(porta, Date.now());

  const subir = (async () => {
    try {
      const saida = await subirInstancia(porta);
      await registrarWebhook(porta);
      console.log(`[WhatsApp] usuário ${usuarioId} · porta ${porta}: ${saida}, webhook ok`);
    } catch (err: any) {
      ultimaGarantia.delete(porta);
      console.error(`[WhatsApp] usuário ${usuarioId} · porta ${porta}: falha ao subir —`, err?.message || err);
      // Porta recém-reservada cuja instância nem subiu volta a ficar livre;
      // a próxima visita à tela tenta de novo.
      if (nova) {
        await query(`UPDATE usuarios SET whatsapp_porta = NULL WHERE id = $1 AND whatsapp_porta = $2`, [usuarioId, porta])
          .catch(() => {});
      }
      throw err;
    }
  })();

  if (aguardarInstancia) await subir;
  else subir.catch(() => {});
  return porta;
}

export const whatsappProvisionService = {
  /**
   * Garante que o usuário tenha porta e instância no ar, com o webhook do CRM.
   * Idempotente. Devolve a porta (já reservada) — a instância sobe em segundo plano,
   * salvo `aguardarInstancia`. Devolve null para usuário inativo, conta sem
   * assinatura válida e conta com direito ao número oficial que ainda não escolheu
   * o QR (`permitirQrNovo`). Nunca lança: é chamada do cadastro e de telas.
   */
  async garantirWhatsApp(
    usuarioId: number,
    opts: { aguardarInstancia?: boolean; permitirQrNovo?: boolean } = {}
  ): Promise<number | null> {
    const chave = `${usuarioId}:${opts.permitirQrNovo ? 'qr' : 'auto'}`;
    const pendente = emAndamento.get(chave);
    if (pendente) return pendente;
    const p = garantir(usuarioId, !!opts.aguardarInstancia, !!opts.permitirQrNovo)
      .catch((err: any) => {
        console.error(`[WhatsApp] não consegui garantir o WhatsApp do usuário ${usuarioId}:`, err?.message || err);
        return null;
      })
      .finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, p);
    return p;
  },

  /**
   * Usuário novo da equipe (usuarios.service). Lança se não houver porta.
   * `permitirQrNovo` aqui porque o administrador está criando um operador: ele
   * decide o canal do time, e negar a instância deixaria o usuário novo sem
   * WhatsApp nenhum até alguém achar o botão.
   */
  async criarInstancia(usuarioId: number): Promise<number> {
    const porta = await this.garantirWhatsApp(usuarioId, { permitirQrNovo: true });
    if (!porta) throw new Error('Não foi possível provisionar o WhatsApp');
    return porta;
  },

  async statusInstancia(porta: number): Promise<{ status: string; hasQrCode: boolean; qrUrl: string }> {
    try {
      const { data } = await instancia(porta).get('/status', { timeout: 5000 });
      return {
        status: data.status,
        hasQrCode: data.hasQrCode,
        qrUrl: `http://161.97.127.54:${porta}/qr-image`,
      };
    } catch {
      return { status: 'offline', hasQrCode: false, qrUrl: '' };
    }
  },
};
