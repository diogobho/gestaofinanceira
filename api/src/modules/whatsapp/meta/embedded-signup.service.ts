import axios from 'axios';
import crypto from 'crypto';
import { BASE_URL, ErroMeta, erroDaGraph, consultarNumero } from './meta-whatsapp.service';

/**
 * Embedded Signup — o cliente autoriza a PRÓPRIA conta do WhatsApp para nós.
 *
 * É o que a aprovação de Provedor de Tecnologia (19/09/2026) destravou. Até aqui
 * `whatsapp_cloud_contas` só podia guardar a WABA da DuoFuturo, porque o único token
 * que existia era o System User dela — e ele não alcança a conta de ninguém mais.
 *
 * O cliente abre a janela da Meta no navegador, e ela devolve três coisas: um `code`
 * de vida curta, o `waba_id` e o `phone_number_id`. **A troca do code e os dois
 * passos seguintes são servidor a servidor** — é literal na documentação, e há um
 * motivo prático: quem faz a troca precisa do App Secret, que não pode sair daqui.
 *
 * ── Os quatro passos, na ordem da Meta ──────────────────────────────────────
 *   1. GET  /oauth/access_token        troca o code pelo token DO CLIENTE
 *   2. POST /{waba_id}/subscribed_apps inscreve o nosso app na WABA dele
 *   3. POST /{phone_number_id}/register ativa o número na Cloud API, com PIN
 *   4. (o cliente) cadastra a forma de pagamento no WhatsApp Manager
 *
 * O passo 2 é o que ninguém lembra e o que não avisa: sem ele a conexão parece
 * pronta, o envio funciona e **nenhuma mensagem chega** — foi exatamente o que
 * deixou a nossa própria WABA muda até 09/09/2026.
 *
 * O passo 4 não é nosso e não trava a conexão: sem forma de pagamento o cliente
 * responde quem escreve, e só a conversa iniciada por ele é recusada. Por isso
 * `pagamento_ok` é um aviso na tela, não um bloqueio no cadastro.
 */

export interface ConfigES {
  configurado: boolean;
  /** Nomes das variáveis que faltam — é o que a tela precisa dizer a quem pode resolver. */
  faltando: string[];
  appId: string | null;
  configId: string | null;
  graphVersion: string;
}

const VERSAO_GRAPH = BASE_URL.split('/').pop() || 'v25.0';

/**
 * O que o navegador precisa para abrir a janela, e o que falta para ela existir.
 *
 * `META_ES_CONFIG_ID` é a configuração de login criada no painel do app (modelo
 * "WhatsApp Embedded Signup Configuration"). Ela não é derivável do App ID: sem o
 * id certo a janela abre pedindo permissões erradas e o `code` não serve.
 */
export function configES(): ConfigES {
  const appId = process.env.META_APP_ID || '';
  const configId = process.env.META_ES_CONFIG_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  const faltando = [
    !appId && 'META_APP_ID',
    !secret && 'META_APP_SECRET',
    !configId && 'META_ES_CONFIG_ID',
  ].filter(Boolean) as string[];

  return {
    configurado: faltando.length === 0,
    faltando,
    appId: appId || null,
    configId: configId || null,
    graphVersion: VERSAO_GRAPH,
  };
}

/** PIN de 6 dígitos do `/register`. Aleatório: ninguém digita, ele fica cifrado. */
export function gerarPin(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * 1 · Troca o `code` da janela pelo token do CLIENTE.
 *
 * O code vive ~30 segundos e serve uma vez só. O token que volta é do tipo
 * "business integration system user" — ele fala pela conta do cliente, com as
 * permissões que ele acabou de conceder, e é ele que vai cifrado em `token_enc`.
 */
export async function trocarCodePorToken(code: string): Promise<string> {
  const cfg = configES();
  if (!cfg.configurado) {
    throw new Error(`Embedded Signup não configurado — falta ${cfg.faltando.join(', ')} no .env da API`);
  }
  try {
    const { data } = await axios.get(`${BASE_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        code,
      },
      timeout: 20_000,
    });
    const token = data?.access_token;
    if (!token) throw new Error('A Meta não devolveu o token de acesso');
    return String(token);
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

/**
 * 2 · Inscreve o nosso app nos webhooks da WABA do cliente.
 *
 * Sem isto a mensagem que chega ao número dele não vem para o nosso webhook, e
 * nada nisso dá erro: o cliente manda, o cliente recebe no aparelho, e o CRM fica
 * vazio. Feito com o token DELE — é a conta dele que está sendo inscrita.
 */
export async function assinarAppNaWaba(wabaId: string, token: string): Promise<void> {
  try {
    await axios.post(`${BASE_URL}/${wabaId}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

/** A WABA já tem o nosso app inscrito? Usado na conferência, não no caminho feliz. */
export async function appInscritoNaWaba(wabaId: string, token: string): Promise<boolean> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });
    const meuApp = String(process.env.META_APP_ID || '');
    return (data?.data ?? []).some((a: any) => String(a?.whatsapp_business_api_data?.id) === meuApp);
  } catch {
    return false;
  }
}

/**
 * 3 · Registra o número na Cloud API.
 *
 * Idempotente do nosso lado: número que já está registrado devolve o erro 133005
 * ("já registrado"), e isso não é falha de conexão — é o caminho de quem reconecta.
 */
export async function registrarNumero(phoneNumberId: string, pin: string, token: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/register`,
      { messaging_product: 'whatsapp', pin },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
    );
  } catch (err: any) {
    const e = erroDaGraph(err) as ErroMeta;
    // 133005 = PIN da verificação em duas etapas não confere; 133006 = número
    // precisa ser verificado antes. Os dois têm ação do cliente, não nossa.
    if (e.metaCode === 133005) {
      throw Object.assign(
        new Error(
          'Este número já tem verificação em duas etapas com outro PIN. Desligue a verificação no WhatsApp Manager da sua conta e tente de novo.'
        ),
        { metaCode: 133005 }
      );
    }
    if (e.metaCode === 133006) {
      throw Object.assign(
        new Error('Este número ainda não foi verificado na Meta. Conclua a verificação por SMS ou ligação no WhatsApp Manager.'),
        { metaCode: 133006 }
      );
    }
    throw e;
  }
}

/** O portfólio dono da WABA — é por ele que se confere a conta sem adivinhar. */
export async function businessDaWaba(wabaId: string, token: string): Promise<string | null> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId}`, {
      params: { fields: 'id,name,owner_business_info,account_review_status' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });
    return data?.owner_business_info?.id ? String(data.owner_business_info.id) : null;
  } catch {
    return null;
  }
}

export interface ResultadoOnboarding {
  token: string;
  pin: string;
  businessId: string | null;
  numero: string | null;
  nomeExibicao: string | null;
  qualidade: string | null;
}

/**
 * Os três passos que são nossos, na ordem, com o token do cliente.
 *
 * Fora da camada que grava no banco de propósito: assim o caminho que fala com a
 * Meta pode ser testado com dublês, e quem grava não precisa saber de HTTP.
 */
export async function onboardingDoNumero(dados: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}): Promise<ResultadoOnboarding> {
  const token = await trocarCodePorToken(dados.code);
  await assinarAppNaWaba(dados.wabaId, token);

  const pin = gerarPin();
  await registrarNumero(dados.phoneNumberId, pin, token);

  const businessId = await businessDaWaba(dados.wabaId, token);
  const numero = await consultarNumero({ phoneNumberId: dados.phoneNumberId, wabaId: dados.wabaId, token });

  return {
    token,
    pin,
    businessId,
    numero: String(numero.display_phone_number || '').replace(/\D/g, '') || null,
    nomeExibicao: numero.verified_name || null,
    qualidade: (numero as any).quality_rating ?? null,
  };
}
