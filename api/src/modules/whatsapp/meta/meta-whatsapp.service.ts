import axios from 'axios';
import FormData from 'form-data';
import { digitosParaGravar, comDDIParaEnvio } from '../../crm/_shared/telefone';

/**
 * Versão da Graph API. A v20.0 expira em 24/09/2026 (Graph API > Changelog > Versions);
 * a v25.0 vale até 29/07/2028. Trocar de versão é trocar AQUI — nada mais no código
 * chumba versão.
 */
export const BASE_URL = 'https://graph.facebook.com/v25.0';

export interface MetaTextMessage {
  to: string;
  text: string;
  /** id (wamid) da mensagem respondida — vira a citação no WhatsApp do cliente. */
  respostaA?: string;
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

/**
 * Exportado como `erroDaGraph` para quem chama a Graph API de fora deste arquivo
 * (o Embedded Signup): o motivo real vem em `error.message` / `error_user_msg`, e
 * o axios cru diria só "Request failed with status code 400".
 */
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

function getHeaders(cred?: CredenciaisMeta) {
  return {
    Authorization: `Bearer ${cred?.token || getToken()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * De qual número (e com qual token) a chamada sai. Sem isto vale o `.env` — o número
 * oficial da DuoFuturo e o System User dela. Cada empresa com número oficial
 * (`whatsapp_cloud_contas`) passa o dela; hoje o token é o mesmo System User, e quando
 * formos Tech Provider o Embedded Signup de cada cliente traz o próprio.
 */
export interface CredenciaisMeta {
  phoneNumberId: string;
  wabaId?: string;
  token?: string;
}

function phoneId(cred?: CredenciaisMeta) {
  return cred?.phoneNumberId || getPhoneId();
}

function wabaId(cred?: CredenciaisMeta) {
  return cred?.wabaId || getWabaId();
}

function token(cred?: CredenciaisMeta) {
  return cred?.token || getToken();
}

export const erroDaGraph = erroMeta;

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

export async function consultarNumero(cred?: CredenciaisMeta): Promise<StatusNumero> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${phoneId(cred)}`, {
      params: {
        fields:
          'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput,messaging_limit_tier',
        access_token: token(cred),
      },
      timeout: 10000,
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

/**
 * Para quem a mensagem vai. Desde 2026 o WhatsApp tem nome de usuário: quem adota
 * pode esconder o telefone, e o webhook chega só com o id da pessoa na nossa conta
 * (BSUID, `messages[].from_user_id`). O contato guarda esse id como `<BSUID>@bsuid`,
 * e a resposta vai no campo `recipient` em vez de `to` (Business-scoped user IDs).
 */
function destinatario(to: string): { to: string } | { recipient: string } {
  const bruto = String(to || '').trim();
  if (/@bsuid$/i.test(bruto)) return { recipient: bruto.replace(/@bsuid$/i, '') };
  return { to: normalizarDestino(bruto) };
}

export async function sendTextMessage({ to, text, respostaA }: MetaTextMessage, cred?: CredenciaisMeta) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...destinatario(to),
        ...(respostaA ? { context: { message_id: respostaA } } : {}),
        type: 'text',
        text: { preview_url: false, body: text },
      },
      { headers: getHeaders(cred), timeout: 30000 }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

/** Reage a uma mensagem (emoji vazio remove). Conta como mensagem: exige a janela de 24h. */
export async function sendReaction(
  { to, messageId, emoji }: { to: string; messageId: string; emoji: string },
  cred?: CredenciaisMeta
) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...destinatario(to),
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
      },
      { headers: getHeaders(cred), timeout: 30000 }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

export interface MetaDocumentMessage {
  to: string;
  /** URL pública do arquivo. A Meta baixa por conta dela — precisa abrir sem login. */
  link: string;
  /** Nome que aparece no balão; sem ele o WhatsApp mostra a URL. */
  filename: string;
  caption?: string;
}

/**
 * Envia um documento (o PDF de boas-vindas) por link público.
 *
 * Link em vez de upload de mídia porque o material já é publicado em
 * duofuturo.tech/onboarding/ — subir o mesmo arquivo a cada envio gastaria uma
 * chamada extra e um id de mídia que expira em 30 dias.
 *
 * Só funciona dentro da janela de 24h aberta por uma mensagem DA PESSOA: fora
 * dela a Meta exige modelo aprovado, e modelo não carrega documento arbitrário.
 */
export async function sendDocumentMessage({ to, link, filename, caption }: MetaDocumentMessage, cred?: CredenciaisMeta) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...destinatario(to),
        type: 'document',
        document: { link, filename, ...(caption ? { caption } : {}) },
      },
      { headers: getHeaders(cred), timeout: 30000 }
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
}: MetaTemplateMessage, cred?: CredenciaisMeta) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...destinatario(to),
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      },
      { headers: getHeaders(cred), timeout: 30000 }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

/**
 * Marca como lida (os dois tiques azuis para o cliente). Com `digitando`, mostra
 * também "digitando…" até a resposta sair ou por 25s — só use quando uma resposta
 * vem mesmo (o agente de IA), senão o cliente fica esperando à toa.
 */
export async function markMessageAsRead(messageId: string, cred?: CredenciaisMeta, digitando = false) {
  try {
    await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        ...(digitando ? { typing_indicator: { type: 'text' } } : {}),
      },
      { headers: getHeaders(cred), timeout: 10000 }
    );
  } catch (err) {
    throw erroMeta(err);
  }
}

// ============================================================
// Mídia
// ============================================================

export type TipoMidiaMeta = 'image' | 'audio' | 'video' | 'document' | 'sticker';

/**
 * Qual tipo de mensagem a Meta aceita para o arquivo. Imagem só JPEG/PNG (webp é
 * figurinha) e áudio só nos formatos da lista dela — o resto vai como documento, que
 * aceita qualquer coisa, em vez de ser recusado.
 */
export function tipoMidiaMeta(mimetype: string): TipoMidiaMeta {
  const m = (mimetype || '').split(';')[0].trim().toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png') return 'image';
  if (['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'].includes(m)) return 'audio';
  if (m === 'video/mp4' || m === 'video/3gpp') return 'video';
  return 'document';
}

/** Sobe o arquivo para a Meta e devolve o id da mídia (vale 30 dias). */
export async function uploadMedia(
  arquivo: Buffer,
  mimetype: string,
  filename: string,
  cred?: CredenciaisMeta
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimetype.split(';')[0].trim());
  form.append('file', arquivo, { filename, contentType: mimetype.split(';')[0].trim() });
  try {
    const { data } = await axios.post(`${BASE_URL}/${phoneId(cred)}/media`, form, {
      headers: { Authorization: `Bearer ${token(cred)}`, ...form.getHeaders() },
      maxBodyLength: Infinity,
      timeout: 120000,
    });
    return data.id;
  } catch (err) {
    throw erroMeta(err);
  }
}

export async function sendMediaMessage(
  { to, mediaId, tipo, filename, caption }: { to: string; mediaId: string; tipo: TipoMidiaMeta; filename?: string; caption?: string },
  cred?: CredenciaisMeta
) {
  const objeto: any = { id: mediaId };
  // Áudio e figurinha não aceitam legenda; documento leva o nome do arquivo no balão.
  if (caption && tipo !== 'audio' && tipo !== 'sticker') objeto.caption = caption;
  if (tipo === 'document' && filename) objeto.filename = filename;
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...destinatario(to),
        type: tipo,
        [tipo]: objeto,
      },
      { headers: getHeaders(cred), timeout: 30000 }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

/**
 * Baixa a mídia de uma mensagem RECEBIDA. São duas chamadas: o id devolve uma URL
 * temporária (5 min), e a URL só abre com o mesmo token no header.
 */
export async function baixarMidia(
  mediaId: string,
  cred?: CredenciaisMeta
): Promise<{ buffer: Buffer; mimetype: string }> {
  try {
    const { data: meta } = await axios.get(`${BASE_URL}/${mediaId}`, {
      params: { phone_number_id: phoneId(cred) },
      headers: { Authorization: `Bearer ${token(cred)}` },
      timeout: 15000,
    });
    const arquivo = await axios.get(meta.url, {
      headers: { Authorization: `Bearer ${token(cred)}` },
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 100 * 1024 * 1024,
    });
    return { buffer: Buffer.from(arquivo.data), mimetype: meta.mime_type || 'application/octet-stream' };
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
  /** 'POSITIONAL' ({{1}}) ou 'NAMED' ({{primeiro_nome}}) — muda como os parâmetros vão no envio. */
  parameter_format?: string;
}

export async function listarTemplates(limite = 50, cred?: CredenciaisMeta): Promise<TemplateMeta[]> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId(cred)}/message_templates`, {
      params: {
        fields: 'id,name,status,category,language,components,rejected_reason,parameter_format',
        limit: limite,
        access_token: token(cred),
      },
      timeout: 15000,
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

/**
 * Cria o modelo na WABA de `cred` — a do CLIENTE quando ele está no Embedded
 * Signup, a nossa quando `cred` não vem (o painel de homologação).
 *
 * **Modelo não é portátil entre contas.** Cada WABA aprova os seus, e o nome só
 * existe dentro dela: mandar um modelo nosso com o token do cliente devolve
 * "template name does not exist". Por isso a criação tinha que deixar de ser
 * global — sem ela, um Enterprise recém-conectado não tem UM modelo aprovado e,
 * fora da janela de 24h, não consegue falar primeiro com ninguém, que é
 * exatamente o que o plano dele vende.
 */
export async function criarTemplate(novo: NovoTemplate, cred?: CredenciaisMeta) {
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
      `${BASE_URL}/${wabaId(cred)}/message_templates`,
      {
        name: novo.nome,
        language: novo.idioma,
        category: novo.categoria,
        components: [body],
      },
      { headers: { Authorization: `Bearer ${token(cred)}`, 'Content-Type': 'application/json' } }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

// ============================================================
// Perfil comercial do número (foto, sobre, descrição, contato)
// ============================================================

export interface PerfilComercial {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
}

export async function lerPerfilComercial(cred?: CredenciaisMeta): Promise<PerfilComercial> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${phoneId(cred)}/whatsapp_business_profile`, {
      params: {
        fields: 'about,address,description,email,profile_picture_url,websites,vertical',
        access_token: token(cred),
      },
      timeout: 15000,
    });
    return data?.data?.[0] ?? {};
  } catch (err) {
    throw erroMeta(err);
  }
}

export async function atualizarPerfilComercial(
  campos: Omit<PerfilComercial, 'profile_picture_url'> & { profile_picture_handle?: string },
  cred?: CredenciaisMeta
) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${phoneId(cred)}/whatsapp_business_profile`,
      { messaging_product: 'whatsapp', ...campos },
      { headers: getHeaders(cred), timeout: 30000 }
    );
    return data;
  } catch (err) {
    throw erroMeta(err);
  }
}

/** Id do app dono do token — a sessão de upload da foto é aberta nele. */
async function appDoToken(cred?: CredenciaisMeta): Promise<string> {
  const { data } = await axios.get(`${BASE_URL}/app`, {
    params: { access_token: token(cred) },
    timeout: 10000,
  });
  if (!data?.id) throw new Error('Não foi possível descobrir o app do token da Meta');
  return data.id;
}

/**
 * Troca a foto do perfil. A foto não vai pelo endpoint de mídia: vai pela Resumable
 * Upload API (abre sessão em /{app}/uploads, sobe os bytes, recebe um handle) e o
 * handle é gravado no perfil. Quadrada, JPEG/PNG, até 5 MB; 640×640 é o recomendado
 * e fundo transparente vira PRETO no WhatsApp — mande com fundo.
 */
export async function trocarFotoPerfil(
  imagem: Buffer,
  mimetype: 'image/jpeg' | 'image/png',
  cred?: CredenciaisMeta
) {
  try {
    const app = await appDoToken(cred);
    const { data: sessao } = await axios.post(`${BASE_URL}/${app}/uploads`, null, {
      params: {
        file_name: mimetype === 'image/png' ? 'perfil.png' : 'perfil.jpg',
        file_length: imagem.length,
        file_type: mimetype,
        access_token: token(cred),
      },
      timeout: 15000,
    });
    const { data: enviado } = await axios.post(`${BASE_URL}/${sessao.id}`, imagem, {
      headers: {
        Authorization: `OAuth ${token(cred)}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      timeout: 60000,
    });
    if (!enviado?.h) throw new Error('A Meta não devolveu o handle da imagem enviada');
    return atualizarPerfilComercial({ profile_picture_handle: enviado.h }, cred);
  } catch (err) {
    throw erroMeta(err);
  }
}
