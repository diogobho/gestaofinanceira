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
  /**
   * Versão do Embedded Signup (`META_ES_VERSAO`, padrão v4). Decide o `extras` do FB.login: na v5
   * vai `version: 'v5'` e a coexistência já vem ligada; na v4 vai vazio e a Meta NÃO oferece a
   * coexistência; v2/v3 (com `featureType`) foram desligadas pela Meta em 15/10/2026.
   */
  versao: string;
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
    versao: (process.env.META_ES_VERSAO || 'v4').trim().toLowerCase(),
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

/** Portfólio dono da WABA, com o nome — a tela mostra o nome, e a conferência usa o id. */
export async function portfolioDaWaba(wabaId: string, token: string): Promise<{ id: string; nome: string | null } | null> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId}`, {
      params: { fields: 'owner_business_info' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });
    const b = data?.owner_business_info;
    return b?.id ? { id: String(b.id), nome: b.name ? String(b.name) : null } : null;
  } catch {
    return null;
  }
}

/**
 * Número que caiu num portfólio que não é o da empresa (097). Recusado ANTES do
 * registro: depois dele o número já estaria ativo na conta errada, com outro cartão.
 */
export class ErroPortfolioErrado extends Error {
  constructor(public escolhido: string | null, public esperado: string | null) {
    super(
      `Na janela da Meta foi escolhido o portfólio "${escolhido ?? 'outro'}", e o da sua empresa é "${esperado ?? 'outro'}". ` +
        'Conecte de novo escolhendo o portfólio da empresa — é nele que está o cartão de pagamento.'
    );
  }
}

/** Confere o portfólio contra o da empresa. Sem referência (primeira conexão), aceita. */
async function conferirPortfolio(
  wabaId: string,
  token: string,
  esperado?: { id: string; nome: string | null } | null
): Promise<{ id: string; nome: string | null } | null> {
  const atual = await portfolioDaWaba(wabaId, token);
  if (esperado && atual?.id !== esperado.id) throw new ErroPortfolioErrado(atual?.nome ?? null, esperado.nome);
  return atual;
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
  businessNome: string | null;
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
  /** Portfólio da empresa (097). Outro é recusado antes do registro. */
  portfolioEsperado?: { id: string; nome: string | null } | null;
}): Promise<ResultadoOnboarding> {
  const token = await trocarCodePorToken(dados.code);
  await assinarAppNaWaba(dados.wabaId, token);
  const portfolio = await conferirPortfolio(dados.wabaId, token, dados.portfolioEsperado);

  const pin = gerarPin();
  await registrarNumero(dados.phoneNumberId, pin, token);

  const businessId = portfolio?.id ?? null;
  const numero = await consultarNumero({ phoneNumberId: dados.phoneNumberId, wabaId: dados.wabaId, token });

  return {
    token,
    pin,
    businessId,
    businessNome: portfolio?.nome ?? null,
    numero: String(numero.display_phone_number || '').replace(/\D/g, '') || null,
    nomeExibicao: numero.verified_name || null,
    qualidade: (numero as any).quality_rating ?? null,
  };
}

// ── Coexistência (095) ────────────────────────────────────────────────────────
//
// O número continua no app WhatsApp Business do celular e passa a falar também pela
// Cloud API. Muda três coisas no caminho acima:
//
//  - a janela devolve só o `waba_id` (evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING),
//    então o número é procurado na WABA;
//  - **não há /register**: o número já está registrado, é o do app. Chamar o
//    register derrubaria o app do celular;
//  - depois de ligado, há 24h e UMA chamada para pedir contatos e histórico
//    (`pedirSincronizacao`). O que chega vem pelos webhooks `smb_app_state_sync` e
//    `history`; o que a pessoa manda pelo celular dali em diante, por `smb_message_echoes`.

/** Os números da WABA — na coexistência a janela não diz qual foi conectado. */
export async function numerosDaWaba(wabaId: string, token: string): Promise<Array<{
  id: string;
  display_phone_number?: string;
  is_on_biz_app?: boolean;
}>> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId}/phone_numbers`, {
      params: { fields: 'id,display_phone_number,verified_name,is_on_biz_app' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });
    return data?.data ?? [];
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

/**
 * Qual número da WABA é o do app. A WABA nascida na janela tem um só; se houver
 * mais, vale o que a Meta marca como `is_on_biz_app`. Escolher no escuro ligaria o
 * CRM no número errado — melhor recusar e dizer.
 */
export function escolherNumeroCoexistencia(
  numeros: Array<{ id: string; is_on_biz_app?: boolean }>,
  pedido?: string | null
): string {
  if (pedido) {
    if (!numeros.some((n) => n.id === pedido)) throw new Error('O número informado pela Meta não está nesta conta do WhatsApp.');
    return pedido;
  }
  if (numeros.length === 1) return numeros[0].id;
  const doApp = numeros.filter((n) => n.is_on_biz_app);
  if (doApp.length === 1) return doApp[0].id;
  if (numeros.length === 0) throw new Error('A Meta não encontrou nenhum número nesta conta do WhatsApp. Refaça a conexão até o fim.');
  throw new Error('Esta conta do WhatsApp tem mais de um número e a Meta não disse qual é o do app. Fale com o suporte.');
}

export async function onboardingCoexistencia(dados: {
  code: string;
  wabaId: string;
  phoneNumberId?: string | null;
  portfolioEsperado?: { id: string; nome: string | null } | null;
}): Promise<ResultadoOnboarding & { phoneNumberId: string }> {
  const token = await trocarCodePorToken(dados.code);
  await assinarAppNaWaba(dados.wabaId, token);
  // Antes de qualquer sincronização: no portfólio errado o histórico iria para uma
  // conta que a empresa vai ter de refazer — e a Meta só deixa pedir uma vez.
  const portfolio = await conferirPortfolio(dados.wabaId, token, dados.portfolioEsperado);
  const phoneNumberId = escolherNumeroCoexistencia(await numerosDaWaba(dados.wabaId, token), dados.phoneNumberId);

  const businessId = portfolio?.id ?? null;
  const numero = await consultarNumero({ phoneNumberId, wabaId: dados.wabaId, token });
  return {
    token,
    pin: '',
    phoneNumberId,
    businessId,
    businessNome: portfolio?.nome ?? null,
    numero: String(numero.display_phone_number || '').replace(/\D/g, '') || null,
    nomeExibicao: numero.verified_name || null,
    qualidade: (numero as any).quality_rating ?? null,
  };
}

/**
 * Pede à Meta os contatos (`smb_app_state_sync`) ou o histórico (`history`) do app.
 * Só pode ser feito UMA vez por conexão e dentro de 24h dela — por isso quem chama
 * grava que pediu, e a tela não oferece "tentar de novo" depois de um pedido aceito.
 */
export async function pedirSincronizacao(
  phoneNumberId: string,
  token: string,
  tipo: 'smb_app_state_sync' | 'history'
): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/smb_app_data`,
      { messaging_product: 'whatsapp', sync_type: tipo },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
    );
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

// ── Número novo na conta da empresa, sem janela (097) ─────────────────────────
//
// Com a referência da empresa definida, o número de mais um operador é criado direto
// na WABA dela com o token que já temos: cria → código por SMS/ligação → confere →
// registra. Ninguém faz login no Facebook nem escolhe portfólio, e o cartão é o da
// empresa. Só serve para número que NÃO está em nenhum WhatsApp — o do app vai pela
// coexistência.

/** Número brasileiro em DDI + nacional. null = não dá para usar. */
export function separarDDI(valor: string): { cc: string; nacional: string } | null {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { cc: '55', nacional: d.slice(2) };
  if (d.length === 10 || d.length === 11) return { cc: '55', nacional: d };
  return null;
}

export async function criarNumeroNaWaba(
  wabaId: string,
  token: string,
  cc: string,
  nacional: string,
  nomeExibicao: string
): Promise<string> {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/${wabaId}/phone_numbers`,
      { cc, phone_number: nacional, verified_name: nomeExibicao },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
    );
    if (!data?.id) throw new Error('A Meta não devolveu o número criado');
    return String(data.id);
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

export async function pedirCodigo(phoneNumberId: string, token: string, metodo: 'SMS' | 'VOICE'): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/request_code`,
      { code_method: metodo, language: 'pt' },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
    );
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

export async function verificarCodigo(phoneNumberId: string, token: string, codigo: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/verify_code`,
      { code: codigo },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
    );
  } catch (err: any) {
    throw erroDaGraph(err);
  }
}

/**
 * A WABA tem alguma pendência de pagamento? A Meta não deixa um Tech Provider ler o
 * cartão (`primary_funding_id` é só de Solution Provider), mas o `health_status` diz
 * "There is an error with the payment method" — foi assim que se viu o da Jéssica.
 */
export async function pagamentoPendente(wabaId: string, token: string): Promise<boolean | null> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${wabaId}`, {
      params: { fields: 'health_status' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    return (data?.health_status?.entities ?? []).some((e: any) =>
      (e.errors ?? []).some((x: any) => /payment/i.test(String(x?.error_description || '')))
    );
  } catch {
    return null;
  }
}
