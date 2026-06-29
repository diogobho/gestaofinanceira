import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '../config/database';

const execAsync = promisify(exec);

const PORTA_INICIAL = 3013;
const PORTA_MAXIMA = 3200;
const CREATE_SCRIPT = '/var/www/apps/whatsapp-integration/create-instance.sh';

export const whatsappProvisionService = {

  async proximaPortaDisponivel(): Promise<number> {
    // Portas já atribuídas no banco
    const result = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE whatsapp_porta IS NOT NULL ORDER BY whatsapp_porta`
    );
    const portasUsadas = new Set(result.rows.map((r: any) => r.whatsapp_porta));

    // Encontrar próxima porta livre
    for (let porta = PORTA_INICIAL; porta <= PORTA_MAXIMA; porta++) {
      if (!portasUsadas.has(porta)) {
        return porta;
      }
    }
    throw new Error('Nenhuma porta WhatsApp disponível');
  },

  async criarInstancia(usuarioId: number): Promise<number> {
    const porta = await this.proximaPortaDisponivel();

    // Atribuir porta ao usuário antes de criar (reserva a porta)
    await query(
      `UPDATE usuarios SET whatsapp_porta = $1 WHERE id = $2`,
      [porta, usuarioId]
    );

    // Criar instância PM2 em background
    execAsync(`${CREATE_SCRIPT} ${porta}`).then(({ stdout }) => {
      console.log(`[WhatsApp] Instância criada: ${stdout.trim()}`);
    }).catch((err) => {
      console.error(`[WhatsApp] Erro ao criar instância porta ${porta}:`, err.message);
      // Reverter porta em caso de falha crítica
      query(`UPDATE usuarios SET whatsapp_porta = NULL WHERE id = $1 AND whatsapp_porta = $2`, [usuarioId, porta])
        .catch(() => {});
    });

    return porta;
  },

  async statusInstancia(porta: number): Promise<{ status: string; hasQrCode: boolean; qrUrl: string }> {
    try {
      const res = await fetch(`http://localhost:${porta}/status`);
      const data = await res.json() as any;
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
