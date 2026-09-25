import axios, { AxiosRequestConfig } from 'axios';
import { comDDIParaEnvio } from '../../crm/_shared/telefone';
import {
  consultarNumero,
  sendTextMessage,
  sendMediaMessage,
  sendReaction,
  uploadMedia,
  tipoMidiaMeta,
  ErroMeta,
} from '../meta/meta-whatsapp.service';
import { ContaCloud, contaPorPorta, credenciaisDa, ehPortaVirtual } from './contas';
import { estadoJanela, mensagemJanelaFechada } from './janela';

/**
 * A porta do WhatsApp de um usuário, qualquer que seja o canal.
 *
 * Todo o CRM fala com o WhatsApp pelo contrato HTTP das instâncias Baileys
 * (`api-multi-baileys.js`): `/send`, `/send-media`, `/status`, `/qr`… Para porta de
 * instância, isto É esse contrato — axios em localhost, sem mudar nada. Para a porta
 * virtual de um número oficial (./contas.ts), o mesmo contrato é atendido aqui,
 * falando com a Meta, com as MESMAS formas de resposta e de erro:
 *
 *   - sucesso → `{ data: { success: true, messageId } }`;
 *   - falha   → erro com `response.status` e `response.data.{error, details}`, que é
 *     o que os chamadores já leem (`classificarErro`, o balão vermelho do card).
 *
 * Os códigos seguem a semântica das instâncias, que o motor de follow-up já sabe
 * tratar: 422 = definitivo para ESTA mensagem (fora da janela, número sem WhatsApp,
 * grupo), 503 = canal fora do ar, 429/5xx = transitório, 401/403 = canal bloqueado.
 */

export interface InstanciaWhatsApp {
  get(caminho: string, opts?: AxiosRequestConfig): Promise<{ status: number; data: any }>;
  post(caminho: string, corpo?: any, opts?: AxiosRequestConfig): Promise<{ status: number; data: any }>;
}

export function instancia(porta: number | string): InstanciaWhatsApp {
  const p = Number(porta);
  if (!ehPortaVirtual(p)) {
    return {
      get: (caminho, opts) => axios.get(`http://localhost:${p}${caminho}`, opts),
      post: (caminho, corpo, opts) => axios.post(`http://localhost:${p}${caminho}`, corpo ?? {}, opts),
    };
  }
  return {
    get: (caminho) => cloud(p, 'GET', caminho),
    post: (caminho, corpo) => cloud(p, 'POST', caminho, corpo),
  };
}

/** Erro no formato de um 4xx/5xx do axios — é o que os chamadores sabem ler. */
export function erroNoFormatoDaInstancia(status: number, mensagem: string, extra: Record<string, any> = {}) {
  const e: any = new Error(mensagem);
  e.status = status;
  e.response = { status, data: { success: false, error: mensagem, details: mensagem, ...extra } };
  return e;
}

/** Tradução do erro da Graph API para a semântica das instâncias. */
export function statusDoErroMeta(err: ErroMeta): number {
  const code = Number(err.metaCode);
  if ([4, 80007, 130429, 131048, 131049, 131056].includes(code)) return 429;
  if (code === 0 || code === 190 || err.httpStatus === 401) return 401;
  if ([3, 10, 368, 131005, 131031, 130497].includes(code) || (code >= 200 && code <= 299)) return 403;
  if ([131016, 131057].includes(code) || (err.httpStatus ?? 0) >= 500 || code === 131000) return 500;
  return 422; // parâmetro, destino, modelo: repetir não resolve
}

/**
 * Destino no formato da Cloud API. O CRM guarda JIDs do Baileys (`5511…@c.us`,
 * `@s.whatsapp.net`, `@lid`, `@g.us`); a Meta quer só dígitos com DDI — ou o BSUID.
 */
export function destinoCloud(numero: string): string {
  const bruto = String(numero || '').trim();
  if (/@bsuid$/i.test(bruto)) return bruto;
  if (/@g\.us$/i.test(bruto)) {
    throw erroNoFormatoDaInstancia(422, 'O WhatsApp oficial não envia mensagem para grupos');
  }
  if (/@lid$/i.test(bruto)) {
    throw erroNoFormatoDaInstancia(
      422,
      'Este contato veio do WhatsApp por QR Code sem número de telefone (identificador @lid). Corrija o telefone do card para falar com ele pelo número oficial.'
    );
  }
  const digitos = bruto.replace(/@.*$/, '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 15) {
    throw erroNoFormatoDaInstancia(422, 'Número de destino inválido');
  }
  return comDDIParaEnvio(digitos);
}

// Situação do número na Meta — cache curto, a tela consulta de 5 em 5 segundos.
const statusCache = new Map<number, { em: number; dados: any }>();

async function statusDaConta(conta: ContaCloud) {
  const guardado = statusCache.get(conta.id);
  if (guardado && Date.now() - guardado.em < 60_000) return guardado.dados;

  const base = {
    provedor: 'cloud_api',
    clientId: `cloud-api-${conta.phone_number_id}`,
    hasQrCode: false,
    aguardandoQr: false,
    pareado: true,
    banido: false,
    banidoDesde: null,
    recusas403: 0,
    proximaTentativaEm: null,
    numero: conta.numero,
    timestamp: new Date().toISOString(),
  };
  let dados: any;
  try {
    const n = await consultarNumero(credenciaisDa(conta));
    dados = {
      ...base,
      status: 'connected',
      connected: true,
      isReady: true,
      numero: String(n.display_phone_number || conta.numero || '').replace(/\D/g, ''),
      nomeVerificado: n.verified_name,
      qualidade: n.quality_rating,
      verificacao: n.code_verification_status,
      lastDisconnect: null,
    };
  } catch (err: any) {
    dados = {
      ...base,
      status: 'disconnected',
      connected: false,
      isReady: false,
      erro: err.message,
      lastDisconnect: { code: statusDoErroMeta(err), motivo: err.message, categoria: 'cloud_api', at: new Date().toISOString() },
    };
  }
  statusCache.set(conta.id, { em: Date.now(), dados });
  return dados;
}

async function exigirJanela(conta: ContaCloud, destino: string) {
  const janela = await estadoJanela(conta.empresa_id, destino);
  if (!janela.aberta) {
    throw erroNoFormatoDaInstancia(422, mensagemJanelaFechada(janela), { janela: 'fechada' });
  }
}

function mensagemIdDe(resposta: any): string | undefined {
  return resposta?.messages?.[0]?.id;
}

async function cloud(porta: number, metodo: 'GET' | 'POST', caminhoCompleto: string, corpo?: any) {
  const conta = await contaPorPorta(porta);
  if (!conta || !conta.ativo) {
    throw erroNoFormatoDaInstancia(503, 'WhatsApp não conectado — o número oficial desta empresa está desligado');
  }
  const cred = credenciaisDa(conta);
  const caminho = caminhoCompleto.split('?')[0];
  const ok = (data: any) => ({ status: 200, data });

  try {
    if (metodo === 'GET') {
      if (caminho === '/status') return ok(await statusDaConta(conta));
      if (caminho === '/info') {
        const numero = conta.numero || '';
        return ok({ success: true, number: numero, info: { number: numero, provedor: 'cloud_api' } });
      }
      if (caminho === '/chats') return ok({ success: true, chats: [] });
      if (caminho === '/groups') return ok({ success: true, groups: [] });
      if (/^\/groups\/[^/]+\/participants$/.test(caminho)) return ok({ success: true, participants: [] });
      if (caminho === '/qr' || caminho === '/qr-image' || caminho === '/qrcode') {
        throw erroNoFormatoDaInstancia(404, 'O número oficial não usa QR Code — ele fica conectado na Meta');
      }
    }

    if (metodo === 'POST') {
      if (caminho === '/send' || caminho === '/send-message') {
        const destino = destinoCloud(corpo?.number ?? corpo?.to ?? corpo?.chatId);
        const texto = String(corpo?.message ?? corpo?.text ?? '');
        if (!texto.trim()) throw erroNoFormatoDaInstancia(400, 'Número e mensagem são obrigatórios');
        await exigirJanela(conta, destino);
        const r = await sendTextMessage({ to: destino, text: texto, respostaA: corpo?.quoted?.id || undefined }, cred);
        return ok({ success: true, messageId: mensagemIdDe(r), provedor: 'cloud_api' });
      }

      if (caminho === '/react') {
        const destino = destinoCloud(corpo?.number);
        if (!corpo?.messageId) throw erroNoFormatoDaInstancia(400, 'Número e messageId são obrigatórios');
        await exigirJanela(conta, destino);
        await sendReaction({ to: destino, messageId: String(corpo.messageId), emoji: String(corpo?.emoji || '') }, cred);
        return ok({ success: true, provedor: 'cloud_api' });
      }

      if (caminho === '/send-media') {
        const destino = destinoCloud(corpo?.number);
        await exigirJanela(conta, destino);
        const mimetype = String(corpo?.mimetype || 'application/octet-stream');
        const filename = String(corpo?.filename || 'arquivo');
        const buffer = Buffer.from(String(corpo?.media || ''), 'base64');
        if (!buffer.length) throw erroNoFormatoDaInstancia(400, 'Arquivo vazio');
        const tipo = tipoMidiaMeta(mimetype);
        // O gravador do Chrome produz audio/webm, que a Meta não aceita (áudio só em
        // AAC, AMR, MP3, MP4 ou OGG/Opus). Sem conversor no servidor, falhar com a
        // frase certa é melhor que mandar como documento e a Meta recusar sem dizer.
        if (mimetype.toLowerCase().startsWith('audio/') && tipo !== 'audio') {
          throw erroNoFormatoDaInstancia(
            422,
            'O WhatsApp oficial não aceita áudio neste formato (' + mimetype.split(';')[0] +
              '). Envie o áudio como arquivo MP3, M4A ou OGG.'
          );
        }
        const mediaId = await uploadMedia(buffer, mimetype, filename, cred);
        const r = await sendMediaMessage(
          { to: destino, mediaId, tipo, filename, caption: corpo?.caption || undefined },
          cred
        );
        return ok({ success: true, messageId: mensagemIdDe(r), provedor: 'cloud_api' });
      }

      // Não há sessão para derrubar nem agenda para puxar: o número vive na Meta.
      if (caminho === '/contacts/resync' || caminho === '/webhook/register') return ok({ success: true });
      if (caminho === '/logout' || caminho === '/disconnect' || caminho === '/reconectar') {
        throw erroNoFormatoDaInstancia(
          409,
          'O número oficial não se desconecta por aqui: ele fica conectado na Meta. Para voltar ao QR Code, a DuoFuturo desliga o número oficial da empresa no painel da Cloud API.'
        );
      }
    }

    throw erroNoFormatoDaInstancia(404, `Operação ${metodo} ${caminho} não existe no número oficial`);
  } catch (err: any) {
    if (err?.response?.data) throw err; // já está no formato da instância
    const status = statusDoErroMeta(err);
    throw erroNoFormatoDaInstancia(status, err?.message || 'Falha no WhatsApp oficial', {
      metaCode: err?.metaCode ?? null,
    });
  }
}
