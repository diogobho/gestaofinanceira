import axios from 'axios';
import { digitosParaGravar, comDDIParaEnvio } from '../../crm/_shared/telefone';

const BASE_URL = 'https://graph.facebook.com/v20.0';

export interface MetaTextMessage {
  to: string;
  text: string;
}

export interface MetaTemplateMessage {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: object[];
}

export interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  type: string;
}

/**
 * Erro da Graph API com o motivo REAL na mensagem.
 *
 * O axios cru diz apenas "Request failed with status code 400" — inútil na tela e
 * pior ainda num vídeo de App Review, onde o revisor precisa ver o app se
 * comportando. A Meta manda o motivo em `error.message` e, quando existe, o texto
 * pronto para o usuário em `error_user_msg`.
 */
export interface ErroMeta extends Error {
  metaCode?: number;
  metaSubcode?: number;
  httpStatus?: number;
}

function erroMeta(err: any): ErroMeta {
  const meta = err?.response?.data?.error;
  if (!meta) return err instanceof Error ? err : new Error(String(err));

  const partes = [meta.error_user_msg, meta.message, meta.error_data?.details];
  const e = new Error(
    [...new Set(partes.filter(Boolean))].join(' — ') || 'Erro desconhecido da Meta'
  ) as ErroMeta;
  e.metaCode = meta.code;
  e.metaSubcode = meta.error_subcode;
  e.httpStatus = err?.response?.status;
  return e;
}

// ============================================================
// Configuração
// ============================================================

function getToken() {
  return process.env.META_WA_TOKEN || '';
}

function getPhoneId() {
  return process.env.META_WA_PHONE_NUMBER_ID || '';
}

function getWabaId() {
  return process.env.META_WA_BUSINESS_ACCOUNT_ID || '';
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

export interface ConfigMeta {
  configurado: boolean;
  /** Nomes das variáveis de ambiente que faltam — o que a tela precisa dizer. */
  faltando: string[];
  phoneNumberId: string | null;
  wabaId: string | null;
}

/**
 * O que está no `.env`, sem ir à rede. Serve para a tela distinguir
 * "não configurado" (arrume o .env) de "configurado e a Meta recusou".
 */
export function conferirConfig(): ConfigMeta {
  const faltando: string[] = [];
  if (!getToken()) faltando.push('META_WA_TOKEN');
  if (!getPhoneId()) faltando.push('META_WA_PHONE_NUMBER_ID');
  if (!getWabaId()) faltando.push('META_WA_BUSINESS_ACCOUNT_ID');

  return {
    configurado: faltando.length === 0,
    faltando,
    phoneNumberId: getPhoneId() || null,
    wabaId: getWabaId() || null,
  };
}

// ============================================================
// Diagnóstico
// ============================================================

export interface StatusNumero {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
  throughput?: { level?: string };
}

export async function consultarNumero(): Promise<StatusNumero> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${getPhoneId()}`, {
      params: {
        fields:
          'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput',
        access_token: getToken(),
      },
    });
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

// ============================================================
// Envio
// ============================================================

/**
 * O destino do Cloud API é só dígitos com DDI, sem `+` e sem máscara. Número
 * brasileiro salvo sem o 55 é o caso mais comum da base — `comDDIParaEnvio`
 * completa apenas ele, exatamente como no caminho do Baileys.
 *
 * Com `+` na frente o número já traz o DDI e segue como veio: um americano com
 * código do país (`+1` + 10 dígitos) tem os mesmos 11 dígitos de um celular
 * brasileiro com DDD, e sem essa saída ganharia um `55` na frente.
 */
export function normalizarDestino(numero: string): string {
  const digitos = digitosParaGravar(numero);
  if (!digitos) throw new Error('Número de destino inválido');
  if (String(numero).trim().startsWith('+')) return digitos;
  return comDDIParaEnvio(digitos);
}

export async function sendTextMessage({ to, text }: MetaTextMessage) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizarDestino(to),
        type: 'text',
        text: { preview_url: false, body: text },
      },
      { headers: getHeaders() }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

export async function sendTemplateMessage({
  to,
  templateName,
  languageCode = 'pt_BR',
  components = [],
}: MetaTemplateMessage) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        to: normalizarDestino(to),
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      },
      { headers: getHeaders() }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

export async function markMessageAsRead(messageId: string) {
  try {
    await axios.post(
      `${BASE_URL}/${getPhoneId()}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: getHeaders() }
    );
  } catch (err) {
    throw erroMeta(err);
  }
}

// ============================================================
// Modelos de mensagem (whatsapp_business_management)
// ============================================================

export interface TemplateMeta {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: any[];
  rejected_reason?: string;
}

export async function listarTemplates(limite = 50): Promise<TemplateMeta[]> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${getWabaId()}/message_templates`, {
      params: {
        fields: 'id,name,status,category,language,components,rejected_reason',
        limit: limite,
        access_token: getToken(),
      },
    });
    return data.data ?? [];
  } catch (err) {
    throw erroMeta(err);
  }
}

export interface NovoTemplate {
  nome: string;
  categoria: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  idioma: string;
  corpo: string;
  /** Um valor de exemplo por variável `{{n}}` do corpo. */
  exemplos?: string[];
}

/** Quantas variáveis `{{n}}` distintas o corpo declara. */
export function contarVariaveis(corpo: string): number {
  const encontradas = new Set((corpo.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map((v) => v.replace(/\D/g, '')));
  return encontradas.size;
}

export async function criarTemplate(novo: NovoTemplate) {
  const variaveis = contarVariaveis(novo.corpo);
  const exemplos = (novo.exemplos ?? []).filter((e) => e.trim().length > 0);

  // A Meta recusa com 400 quando o corpo tem {{n}} e não vem `example`. Barrar
  // aqui devolve a frase certa em vez de repassar "Invalid parameter".
  if (variaveis > 0 && exemplos.length !== variaveis) {
    throw new Error(
      `O corpo tem ${variaveis} variável(is) e você informou ${exemplos.length} exemplo(s). ` +
        'A Meta exige um exemplo para cada {{n}}.'
    );
  }

  const body: any = {
    type: 'BODY',
    text: novo.corpo,
  };
  if (variaveis > 0) body.example = { body_text: [exemplos] };

  try {
    const { data } = await axios.post(
      `${BASE_URL}/${getWabaId()}/message_templates`,
      {
        name: novo.nome,
        language: novo.idioma,
        category: novo.categoria,
        components: [body],
      },
      { headers: getHeaders() }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}
