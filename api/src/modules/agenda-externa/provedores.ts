/**
 * Google Agenda e Microsoft 365 (Outlook/Teams) — só o que a agenda externa usa: login
 * OAuth, renovar o token e criar/alterar/apagar um evento com link de reunião.
 *
 * Credenciais no .env (nunca no ecosystem): GOOGLE_OAUTH_CLIENT_ID/SECRET e
 * MS_OAUTH_CLIENT_ID/SECRET. Sem elas o provedor aparece como "não configurado".
 * URL de retorno a cadastrar em cada console: `${URL_PUBLICA}/api/gestao/agenda-externa/callback/<provedor>`.
 */
import axios from 'axios';

export type Provedor = 'google' | 'microsoft';
export const PROVEDORES: Provedor[] = ['google', 'microsoft'];
export const URL_PUBLICA = process.env.AGENDA_URL_PUBLICA || 'https://duofuturo.tech';

export const urlRetorno = (p: Provedor) => `${URL_PUBLICA}/api/gestao/agenda-externa/callback/${p}`;

const cred = (p: Provedor) => p === 'google'
  ? { id: process.env.GOOGLE_OAUTH_CLIENT_ID || '', segredo: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '' }
  : { id: process.env.MS_OAUTH_CLIENT_ID || '', segredo: process.env.MS_OAUTH_CLIENT_SECRET || '' };

export const configurado = (p: Provedor) => !!(cred(p).id && cred(p).segredo);

const ESCOPOS = {
  google: 'openid email https://www.googleapis.com/auth/calendar.events',
  microsoft: 'openid email offline_access User.Read Calendars.ReadWrite',
};
const MS_TENANT = process.env.MS_OAUTH_TENANT || 'common';
const URL_TOKEN = {
  google: 'https://oauth2.googleapis.com/token',
  microsoft: `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`,
};

export function urlAutorizacao(p: Provedor, state: string): string {
  const q = new URLSearchParams({
    client_id: cred(p).id, redirect_uri: urlRetorno(p), response_type: 'code', scope: ESCOPOS[p], state,
  });
  if (p === 'google') {
    // offline + consent: é o que garante o refresh_token (sem ele a conexão morre em 1h).
    q.set('access_type', 'offline'); q.set('prompt', 'consent'); q.set('include_granted_scopes', 'true');
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  q.set('prompt', 'select_account');
  return `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${q}`;
}

export interface Tokens { access: string; refresh: string | null; expiraEm: Date; email: string | null }

async function pedirToken(p: Provedor, corpo: Record<string, string>): Promise<any> {
  const { data } = await axios.post(URL_TOKEN[p], new URLSearchParams({
    client_id: cred(p).id, client_secret: cred(p).segredo, ...corpo,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20_000 });
  return data;
}

const emailDoIdToken = (idToken?: string): string | null => {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()).email || null; } catch { return null; }
};

export async function trocarCodigo(p: Provedor, code: string): Promise<Tokens> {
  const d = await pedirToken(p, { code, grant_type: 'authorization_code', redirect_uri: urlRetorno(p), ...(p === 'microsoft' ? { scope: ESCOPOS.microsoft } : {}) });
  let email = emailDoIdToken(d.id_token);
  if (!email && p === 'microsoft') {
    const me = await axios.get('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${d.access_token}` }, timeout: 15_000 });
    email = me.data?.mail || me.data?.userPrincipalName || null;
  }
  return { access: d.access_token, refresh: d.refresh_token || null, expiraEm: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000), email };
}

export async function renovar(p: Provedor, refresh: string): Promise<Tokens> {
  const d = await pedirToken(p, { refresh_token: refresh, grant_type: 'refresh_token', ...(p === 'microsoft' ? { scope: ESCOPOS.microsoft } : {}) });
  // A Microsoft gira o refresh_token; o Google mantém o mesmo (e não o devolve).
  return { access: d.access_token, refresh: d.refresh_token || refresh, expiraEm: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000), email: null };
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

export interface DadosEvento {
  titulo: string;
  descricao: string;
  /** Início e fim em UTC. */
  inicio: Date;
  fim: Date;
  convidado?: { email: string; nome: string } | null;
  /** Identificador estável (tarefa) — o Google o usa para não criar duas salas do Meet. */
  chave: string;
}

export interface EventoCriado { id: string; linkReuniao: string | null; linkEvento: string | null }

const G = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const M = 'https://graph.microsoft.com/v1.0/me/events';
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20_000 });

function corpoGoogle(e: DadosEvento, novo: boolean) {
  return {
    summary: e.titulo,
    description: e.descricao,
    start: { dateTime: e.inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: e.fim.toISOString(), timeZone: 'America/Sao_Paulo' },
    attendees: e.convidado ? [{ email: e.convidado.email, displayName: e.convidado.nome }] : [],
    ...(novo ? { conferenceData: { createRequest: { requestId: `duo-${e.chave}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
    reminders: { useDefault: true },
  };
}

function corpoMicrosoft(e: DadosEvento, novo: boolean) {
  const utc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '');
  return {
    subject: e.titulo,
    body: { contentType: 'text', content: e.descricao },
    start: { dateTime: utc(e.inicio), timeZone: 'UTC' },
    end: { dateTime: utc(e.fim), timeZone: 'UTC' },
    attendees: e.convidado ? [{ emailAddress: { address: e.convidado.email, name: e.convidado.nome }, type: 'required' }] : [],
    ...(novo ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}),
    transactionId: novo ? `duo-${e.chave}` : undefined,
  };
}

const lerGoogle = (d: any): EventoCriado => ({
  id: d.id,
  linkReuniao: d.hangoutLink || d.conferenceData?.entryPoints?.find((x: any) => x.entryPointType === 'video')?.uri || null,
  linkEvento: d.htmlLink || null,
});
const lerMicrosoft = (d: any): EventoCriado => ({ id: d.id, linkReuniao: d.onlineMeeting?.joinUrl || null, linkEvento: d.webLink || null });

export async function criarEvento(p: Provedor, token: string, e: DadosEvento): Promise<EventoCriado> {
  if (p === 'google') {
    const { data } = await axios.post(`${G}?conferenceDataVersion=1&sendUpdates=all`, corpoGoogle(e, true), auth(token));
    return lerGoogle(data);
  }
  const { data } = await axios.post(M, corpoMicrosoft(e, true), auth(token));
  return lerMicrosoft(data);
}

export async function atualizarEvento(p: Provedor, token: string, id: string, e: DadosEvento): Promise<EventoCriado> {
  if (p === 'google') {
    const { data } = await axios.patch(`${G}/${encodeURIComponent(id)}?conferenceDataVersion=1&sendUpdates=all`, corpoGoogle(e, false), auth(token));
    return lerGoogle(data);
  }
  const { data } = await axios.patch(`${M}/${encodeURIComponent(id)}`, corpoMicrosoft(e, false), auth(token));
  return lerMicrosoft(data);
}

/**
 * Lê o evento de novo. O Google cria a sala do Meet de forma assíncrona: a resposta da
 * criação pode vir com `conferenceData.createRequest.status = pending` e sem o link
 * (documentação "Create events" → conferências) — o link aparece numa leitura posterior.
 */
export async function lerEvento(p: Provedor, token: string, id: string): Promise<EventoCriado> {
  if (p === 'google') return lerGoogle((await axios.get(`${G}/${encodeURIComponent(id)}`, auth(token))).data);
  return lerMicrosoft((await axios.get(`${M}/${encodeURIComponent(id)}`, auth(token))).data);
}

/** Apaga (e avisa o convidado). Evento que já não existe lá conta como apagado. */
export async function excluirEvento(p: Provedor, token: string, id: string): Promise<void> {
  try {
    if (p === 'google') await axios.delete(`${G}/${encodeURIComponent(id)}?sendUpdates=all`, auth(token));
    else await axios.delete(`${M}/${encodeURIComponent(id)}`, auth(token));
  } catch (err: any) {
    if (![404, 410].includes(err?.response?.status)) throw err;
  }
}

/** Mensagem legível do erro da API (Google: error.message; Graph: error.message). */
export function erroDaApi(err: any): string {
  const d = err?.response?.data;
  return d?.error?.message || d?.error_description || (typeof d?.error === 'string' ? d.error : null) || err?.message || 'Falha na agenda externa';
}
