import { Request, Response } from 'express';
import { markMessageAsRead, MetaWebhookMessage } from './meta-whatsapp.service';

export class MetaWhatsAppController {
  // GET — verificação do webhook pela Meta
  verifyWebhook(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
      console.log('[Meta WA] Webhook verificado com sucesso');
      return res.status(200).send(challenge);
    }

    console.warn('[Meta WA] Falha na verificação do webhook — token inválido');
    return res.sendStatus(403);
  }

  // POST — receber eventos da Meta
  async receiveWebhook(req: Request, res: Response) {
    // Responder 200 imediatamente para a Meta não retentar
    res.sendStatus(200);

    try {
      const body = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue;

          const value = change.value;

          // Mensagens recebidas
          for (const msg of value.messages ?? []) {
            await this.handleIncomingMessage(msg, value.metadata?.phone_number_id);
          }

          // Atualizações de status de envio (delivered, read, failed)
          for (const status of value.statuses ?? []) {
            this.handleStatusUpdate(status);
          }
        }
      }
    } catch (err) {
      console.error('[Meta WA] Erro ao processar webhook:', err);
    }
  }

  private async handleIncomingMessage(msg: MetaWebhookMessage, phoneNumberId: string) {
    const from = msg.from;
    const text = msg.text?.body ?? '';
    const type = msg.type;

    console.log(`[Meta WA] Mensagem recebida de ${from} — tipo: ${type} — texto: "${text}"`);

    // Marcar como lida
    try {
      await markMessageAsRead(msg.id);
    } catch (err: any) {
      console.warn('[Meta WA] Não foi possível marcar como lida:', err.message);
    }

    // TODO: integrar com módulo de automações / CRM conforme regras de negócio
  }

  private handleStatusUpdate(status: any) {
    console.log(`[Meta WA] Status da mensagem ${status.id}: ${status.status}`);
  }
}

export default new MetaWhatsAppController();
