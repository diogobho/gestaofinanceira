import { Request, Response } from 'express';
import {
  markMessageAsRead,
  MetaWebhookMessage,
  conferirConfig,
  consultarNumero,
  sendTextMessage,
  listarTemplates,
  criarTemplate,
  NovoTemplate,
} from './meta-whatsapp.service';

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
        // entry.id É o WhatsApp Business Account ID (WABA) — o painel é a
        // única outra fonte dele, e sem ele não dá para assinar a app na WABA
        console.log(`[Meta WA] webhook da WABA ${entry.id}`);

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

  // ============================================================
  // Painel de homologação (autenticado, super_admin)
  // ============================================================

  /**
   * Situação da integração: o que está no .env e o que a Meta responde sobre o
   * número. Os dois lados separados de propósito — credencial ausente e
   * credencial recusada pedem ações diferentes de quem está na tela.
   */
  async getStatus(_req: Request, res: Response) {
    const config = conferirConfig();
    if (!config.configurado) {
      return res.json({ config, numero: null, erro: null });
    }

    try {
      const numero = await consultarNumero();
      return res.json({ config, numero, erro: null });
    } catch (err: any) {
      return res.json({ config, numero: null, erro: err.message });
    }
  }

  async enviarTexto(req: Request, res: Response) {
    const { numero, texto } = req.body ?? {};

    if (!numero || !String(numero).trim()) {
      return res.status(400).json({ message: 'Informe o número de destino' });
    }
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ message: 'Informe o texto da mensagem' });
    }

    try {
      const resultado = await sendTextMessage({ to: String(numero), text: String(texto) });
      const messageId = resultado?.messages?.[0]?.id ?? null;
      const destino = resultado?.contacts?.[0]?.wa_id ?? null;
      console.log(`[Meta WA] enviado para ${destino ?? numero} — id ${messageId}`);
      return res.json({ success: true, messageId, destino });
    } catch (err: any) {
      return res.status(400).json({ message: err.message, code: err.metaCode ?? null });
    }
  }

  async getTemplates(_req: Request, res: Response) {
    try {
      return res.json({ templates: await listarTemplates() });
    } catch (err: any) {
      return res.status(400).json({ message: err.message, code: err.metaCode ?? null });
    }
  }

  async postTemplate(req: Request, res: Response) {
    const { nome, categoria, idioma, corpo, exemplos } = req.body ?? {};

    // O nome do modelo na Meta é minúsculo, sem espaço nem acento. Recusar aqui
    // com a regra escrita evita o 400 genérico da Graph API.
    if (!/^[a-z0-9_]{1,512}$/.test(String(nome ?? ''))) {
      return res.status(400).json({
        message: 'O nome do modelo aceita apenas letras minúsculas, números e underline (ex.: boas_vindas_duofuturo)',
      });
    }
    if (!corpo || !String(corpo).trim()) {
      return res.status(400).json({ message: 'Informe o corpo do modelo' });
    }

    const novo: NovoTemplate = {
      nome: String(nome),
      categoria: (categoria === 'MARKETING' || categoria === 'AUTHENTICATION' ? categoria : 'UTILITY'),
      idioma: String(idioma || 'pt_BR'),
      corpo: String(corpo),
      exemplos: Array.isArray(exemplos) ? exemplos.map(String) : [],
    };

    try {
      const criado = await criarTemplate(novo);
      console.log(`[Meta WA] modelo "${novo.nome}" criado — id ${criado?.id} status ${criado?.status}`);
      return res.json({ success: true, ...criado });
    } catch (err: any) {
      return res.status(400).json({ message: err.message, code: err.metaCode ?? null });
    }
  }

  private handleStatusUpdate(status: any) {
    const base = `[Meta WA] Status da mensagem ${status.id}: ${status.status} — para ${status.recipient_id ?? '?'}`;

    // 'failed' sem o motivo não diz nada: a causa vem em status.errors[]
    if (status.status === 'failed') {
      const erros = (status.errors ?? [])
        .map((e: any) => {
          const detalhe = e.error_data?.details ?? e.message ?? '';
          return `${e.code} ${e.title}${detalhe ? ` (${detalhe})` : ''}`;
        })
        .join('; ');
      console.error(`${base} — ${erros || 'sem detalhe de erro'}`);
      return;
    }

    console.log(base);
  }
}

export default new MetaWhatsAppController();
