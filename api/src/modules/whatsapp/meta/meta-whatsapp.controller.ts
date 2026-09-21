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
import crypto from 'crypto';
import { processarMensagemRecebida } from '../../onboarding/onboarding.service';
import {
  contaPorPhoneNumberId,
  credenciaisDa,
  contaDaEmpresa,
  listarContas,
  salvarConta,
  ligarConta,
  desligarConta,
} from '../canal/contas';
import { lerPerfilComercial, atualizarPerfilComercial, trocarFotoPerfil, CredenciaisMeta } from './meta-whatsapp.service';
import { encaminharMensagemAoCRM, registrarStatus, registrarSaidaAutomatica } from '../canal/entrada';

/**
 * A Meta assina todo POST do webhook com o App Secret (X-Hub-Signature-256 =
 * sha256 HMAC do corpo cru). Com o webhook alimentando o CRM, um POST forjado
 * gravaria conversa falsa no card de um cliente — então, com META_APP_SECRET no
 * .env, assinatura errada é descartada. Sem o secret, aceita e avisa uma vez.
 */
let avisouSemSecret = false;
function assinaturaValida(req: Request): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    if (!avisouSemSecret) {
      console.warn('[Meta WA] META_APP_SECRET ausente no .env — webhook aceito SEM validar a assinatura');
      avisouSemSecret = true;
    }
    return true;
  }
  const recebida = String(req.headers['x-hub-signature-256'] || '');
  const corpo: Buffer | undefined = (req as any).rawBody;
  if (!recebida.startsWith('sha256=') || !corpo) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secret).update(corpo).digest('hex');
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * A mensagem chegou ao número institucional da DuoFuturo?
 *
 * O webhook é um só para todas as WABAs inscritas no nosso app, e o material de
 * boas-vindas sai SEMPRE do nosso número — responder a quem escreveu para o número
 * de um cliente seria iniciar conversa com um desconhecido, pelo canal que existe
 * justamente para não fazer isso.
 *
 * Sem `META_WA_PHONE_NUMBER_ID` configurado não há de onde enviar, então o certo é
 * não tratar nada — e não é silêncio cego: quem precisa da variável já reprova no
 * `verificar_canal_oficial.js`.
 */
function ehNossoNumeroInstitucional(phoneNumberId?: string): boolean {
  const nosso = String(process.env.META_WA_PHONE_NUMBER_ID || '').trim();
  return !!nosso && String(phoneNumberId || '').trim() === nosso;
}

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
    if (!assinaturaValida(req)) {
      console.warn('[Meta WA] webhook com assinatura inválida descartado');
      return res.sendStatus(401);
    }
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
            await this.handleIncomingMessage(msg, value);
          }

          // Atualizações de status de envio (delivered, read, failed)
          for (const status of value.statuses ?? []) {
            this.handleStatusUpdate(status);
            try {
              await registrarStatus(status);
            } catch (err: any) {
              console.error('[Meta WA] status não registrado no histórico:', err?.message || err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Meta WA] Erro ao processar webhook:', err);
    }
  }

  private async handleIncomingMessage(msg: MetaWebhookMessage & Record<string, any>, value: any) {
    const from = msg.from;
    const text = msg.text?.body ?? '';
    const type = msg.type;
    const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

    console.log(`[Meta WA] Mensagem recebida de ${from ?? msg.from_user_id} — tipo: ${type} — texto: "${text}"`);

    // Número oficial de uma empresa LIGADA: a mensagem é conversa do CRM dela.
    const conta = phoneNumberId ? await contaPorPhoneNumberId(phoneNumberId) : null;
    const noCRM = !!conta?.ativo;
    if (noCRM) {
      try {
        await encaminharMensagemAoCRM(conta!, msg, value);
      } catch (err: any) {
        console.error('[Meta WA] mensagem não entrou no CRM:', err?.response?.data ?? err?.message ?? err);
      }
    } else {
      // Sem CRM por trás (só o fluxo de boas-vindas), marca como lida na hora. Com CRM,
      // quem marca é o operador ao abrir a conversa — os tiques azuis dizem ao cliente
      // que alguém leu, e ninguém leu ainda.
      try {
        await markMessageAsRead(msg.id, conta ? credenciaisDa(conta) : undefined);
      } catch (err: any) {
        console.warn('[Meta WA] Não foi possível marcar como lida:', err.message);
      }
    }

    // Sem telefone (usuário com nome de usuário, só BSUID) não há como casar com o
    // cadastro das boas-vindas, que é por telefone e código.
    if (!from) return;

    /**
     * Boas-vindas: é ESTA mensagem que abre a janela de 24h em que a Meta nos
     * deixa responder com texto livre e anexo. Quem pediu o material no cadastro
     * recebe aqui o texto e o PDF do plano dele.
     *
     * **Só para quem escreveu ao NOSSO número.** Desde o Embedded Signup este
     * webhook é compartilhado: a WABA de cada cliente Enterprise entrega aqui, e
     * `value.metadata.phone_number_id` é o único campo que diz a quem a mensagem
     * foi endereçada. Sem esta guarda, o cliente de um cliente virava linha em
     * `onboarding_mensagens` (o texto dele, na nossa tabela) e, se o telefone
     * casasse com um cadastro à espera, recebia o nosso material de boas-vindas
     * pelo nosso número — uma conversa que ele nunca abriu conosco.
     *
     * O dedupe e o "uma vez só" vivem no serviço (a Meta reentrega o mesmo
     * evento, e são 3 instâncias no cluster). Mensagem de quem não é conta nova
     * não vira resposta automática: fica registrada para a equipe ler.
     *
     * Falha aqui não pode derrubar o laço do webhook — as outras mensagens do
     * mesmo lote ainda precisam ser processadas.
     */
    if (!ehNossoNumeroInstitucional(phoneNumberId)) return;

    try {
      const desfecho = await processarMensagemRecebida({ messageId: msg.id, de: from, tipo: type, texto: text });
      // O material saiu por fora do CRM (onboarding manda direto pela Meta): registra
      // no card, senão a conversa mostra o pedido do cliente e nenhuma resposta.
      if (noCRM && desfecho === 'material_enviado') {
        await registrarSaidaAutomatica(conta!, from, '[Material de boas-vindas enviado automaticamente: texto + PDF do plano]');
      }
    } catch (err: any) {
      console.error('[Meta WA] onboarding não processou a mensagem:', err?.message || err);
    }
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

  // ============================================================
  // Número oficial por empresa (super_admin)
  // ============================================================

  async getContas(_req: Request, res: Response) {
    try {
      return res.json({ contas: await listarContas() });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  /**
   * Cadastra/atualiza um número oficial (sem ligar), à mão, pela DuoFuturo.
   *
   * Caminho manual: o número já está numa WABA que o nosso System User alcança.
   * O cliente que conecta a PRÓPRIA WABA entra por `/whatsapp/canal/oficial/conectar`
   * (Embedded Signup), que traz o token dele — aqui não há token para dar.
   *
   * `usuario_id` opcional: com ele o número é daquele operador e só a porta dele
   * muda; sem ele é o número da empresa inteira.
   */
  async postConta(req: Request, res: Response) {
    const empresaId = Number(req.body?.empresa_id);
    const usuarioId = req.body?.usuario_id ? Number(req.body.usuario_id) : null;
    // Sem ids no corpo, vale o número do .env — o nosso, +55 11 94052-4435.
    const phoneNumberId = String(req.body?.phone_number_id || process.env.META_WA_PHONE_NUMBER_ID || '').trim();
    const wabaId = String(req.body?.waba_id || process.env.META_WA_BUSINESS_ACCOUNT_ID || '').trim();
    if (!Number.isInteger(empresaId) || empresaId <= 0) return res.status(400).json({ message: 'Informe a empresa' });
    if (!/^\d{6,30}$/.test(phoneNumberId) || !/^\d{6,30}$/.test(wabaId)) {
      return res.status(400).json({ message: 'phone_number_id e waba_id são números (veja o painel da Meta)' });
    }
    try {
      const conta = await salvarConta({ empresaId, usuarioId, phoneNumberId, wabaId, origem: 'manual' });
      return res.json({ success: true, conta: { ...conta, token_enc: undefined } });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(409).json({
          message: 'Já existe número oficial para esta empresa ou para este usuário. Desligue o atual antes de trocar.',
        });
      }
      return res.status(400).json({ message: err.message });
    }
  }

  async ligar(req: Request, res: Response) {
    try {
      const conta = await ligarConta(Number(req.params.contaId), (req as any).user?.id ?? null);
      console.log(`[Cloud API] número oficial LIGADO na empresa #${conta.empresa_id} (porta ${conta.porta_virtual})`);
      return res.json({ success: true, conta: { ...conta, token_enc: undefined } });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  async desligar(req: Request, res: Response) {
    try {
      const conta = await desligarConta(Number(req.params.contaId));
      console.log(`[Cloud API] número oficial DESLIGADO na empresa #${conta.empresa_id}`);
      return res.json({ success: true, conta: { ...conta, token_enc: undefined } });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // ============================================================
  // Perfil comercial do número (foto, sobre, descrição)
  // ============================================================

  private async credDaRequisicao(req: Request): Promise<CredenciaisMeta | undefined> {
    const empresaId = Number(req.query.empresa_id || req.body?.empresa_id);
    if (!empresaId) return undefined; // número do .env
    const conta = await contaDaEmpresa(empresaId);
    if (!conta) throw new Error('Esta empresa não tem número oficial cadastrado');
    return credenciaisDa(conta);
  }

  async getPerfil(req: Request, res: Response) {
    try {
      return res.json({ perfil: await lerPerfilComercial(await this.credDaRequisicao(req)) });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  async putPerfil(req: Request, res: Response) {
    const b = req.body ?? {};
    const campos: any = {};
    // Limites da Meta: sobre 139, descrição 512, endereço 256, e-mail 128, até 2 sites.
    if (b.about !== undefined) campos.about = String(b.about).slice(0, 139);
    if (b.description !== undefined) campos.description = String(b.description).slice(0, 512);
    if (b.address !== undefined) campos.address = String(b.address).slice(0, 256);
    if (b.email !== undefined) campos.email = String(b.email).slice(0, 128);
    if (Array.isArray(b.websites)) campos.websites = b.websites.map(String).filter(Boolean).slice(0, 2);
    if (b.vertical) campos.vertical = String(b.vertical);
    try {
      await atualizarPerfilComercial(campos, await this.credDaRequisicao(req));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  async postFotoPerfil(req: Request, res: Response) {
    const arquivo = (req as any).file as { buffer: Buffer; mimetype: string; size: number } | undefined;
    if (!arquivo) return res.status(400).json({ message: 'Envie a imagem' });
    if (arquivo.mimetype !== 'image/jpeg' && arquivo.mimetype !== 'image/png') {
      return res.status(400).json({ message: 'A foto do perfil precisa ser JPG ou PNG' });
    }
    if (arquivo.size > 5 * 1024 * 1024) return res.status(400).json({ message: 'A foto pode ter no máximo 5 MB' });
    try {
      await trocarFotoPerfil(arquivo.buffer, arquivo.mimetype, await this.credDaRequisicao(req));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
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
