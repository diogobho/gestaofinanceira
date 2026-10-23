import axios, { AxiosInstance } from 'axios';
import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { pool, query } from '../../config/database';
import { encrypt, decrypt } from '../../utils/crypto';
import { adotarReceitaContaAzul } from '../contaazul/gemeos-asaas';

/**
 * Receitas do Asaas (105). A empresa cola a chave de API da PRÓPRIA conta do Asaas — o Asaas
 * não tem login OAuth para sistemas de terceiros. Ao conectar:
 *   1. a chave é testada em /myAccount (a tela mostra nome e CNPJ para a pessoa conferir);
 *   2. um webhook é registrado na conta, apontando para nós, com token próprio;
 *   3. as cobranças com vencimento desde `importar_desde` entram como receitas.
 *
 * Cada cobrança vira uma receita à vista com a parcela de 1 de 1 (sem ela o dashboard não a
 * enxerga — ver docs/claude/dashboards.md). Cobrança estornada ou excluída no Asaas fica com a
 * receita `estornado`/`cancelado` e PERDE a parcela: o dashboard só conhece PAGO/PENDENTE, e
 * uma parcela cancelada contaria como a receber.
 *
 * Só leitura no Asaas: o único POST/DELETE é o do próprio webhook.
 */

const URL_PRODUCAO = 'https://api.asaas.com/v3';
const URL_SANDBOX = 'https://api-sandbox.asaas.com/v3';
const URL_WEBHOOK = (conexaoId: number) =>
  `https://duofuturo.tech/api/gestao/asaas-receitas/webhook/${conexaoId}`;

const EVENTOS_WEBHOOK = [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_DUNNING_RECEIVED',
];

// CONFIRMED não é pago: no cartão o cliente já passou, mas o dinheiro só cai no vencimento de
// cada parcela. Contar como pago escondia R$ 42 mil de parcelas futuras da Dani (06/10/2026).
const PAGOS = new Set(['RECEIVED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);
const ESTORNADOS = new Set([
  'REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL',
]);

export class ErroAsaas extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface CobrancaAsaas {
  id: string;
  customer: string;
  value: number;
  /** O que cai na conta: `value` menos a taxa do Asaas. */
  netValue?: number | null;
  status: string;
  deleted?: boolean;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  description?: string | null;
  installmentNumber?: number | null;
  billingType?: string;
}

/** Como a cobrança do Asaas fica na receita. Pura, para testar sem banco. */
export function receitaDaCobranca(p: CobrancaAsaas, nomeCliente?: string | null) {
  const status = p.deleted ? 'cancelado'
    : PAGOS.has(p.status) ? 'pago'
    : ESTORNADOS.has(p.status) ? 'estornado'
    : p.status === 'OVERDUE' ? 'atrasado'
    : 'pendente';
  const pagoEm = status === 'pago'
    ? (p.paymentDate || p.clientPaymentDate || p.dueDate)   // dia em que o dinheiro caiu
    : null;
  const base = (p.description || '').trim() || 'Cobrança Asaas';
  const parcela = p.installmentNumber ? ` (parcela ${p.installmentNumber})` : '';
  const quem = nomeCliente ? ` — ${nomeCliente}` : '';
  return {
    status,
    descricao: `${base}${parcela}${quem}`.slice(0, 500),
    valor: Number(p.value),
    data: pagoEm || p.dueDate,          // a receita fica no dia em que o dinheiro entrou
    vencimento: p.dueDate,
    pagoEm,
    temParcela: status !== 'cancelado' && status !== 'estornado',
    // Taxa do Asaas vira despesa (dono, 06/10/2026), só quando o dinheiro entrou: antes
    // disso o `netValue` é previsão, e cobrança que não for paga não custa nada.
    taxa: status === 'pago' && p.netValue != null && Number(p.value) - Number(p.netValue) > 0.004
      ? Math.round((Number(p.value) - Number(p.netValue)) * 100) / 100
      : 0,
  };
}

function cliente(apiKey: string): AxiosInstance {
  const http = axios.create({
    baseURL: apiKey.includes('_hmlg_') ? URL_SANDBOX : URL_PRODUCAO,
    headers: { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'Duo-CRM' },
    timeout: 30000,
  });
  http.interceptors.response.use(r => r, err => {
    const st = err.response?.status;
    const desc = err.response?.data?.errors?.map((e: any) => e.description || e.code).join(', ');
    if (st === 401) throw new ErroAsaas('O Asaas recusou a chave. Confira se ela foi copiada inteira e se não foi apagada.', 400);
    throw new ErroAsaas(desc ? `Asaas: ${desc}` : `Asaas não respondeu (${st || err.code || 'erro'})`, 502);
  });
  return http;
}

// DATE como texto: um Date do pg passaria pelo fuso e poderia virar o dia anterior.
const SELECT_CONEXAO = 'SELECT *, importar_desde::text AS desde FROM asaas_conexoes WHERE id = $1';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const soDigitos = (s?: string | null) => (s || '').replace(/\D/g, '');

async function conexaoDaEmpresa(empresaId: number) {
  const r = await query('SELECT *, importar_desde::text AS desde FROM asaas_conexoes WHERE empresa_id = $1', [empresaId]);
  return r.rows[0] || null;
}

export async function status(empresaId: number) {
  const c = await conexaoDaEmpresa(empresaId);
  if (!c) return { conectado: false };
  const n = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE r.status = 'pago')::int AS pagas,
            COALESCE(SUM(r.valor) FILTER (WHERE r.status = 'pago'), 0) AS valor_pago
       FROM asaas_cobrancas a JOIN receitas r ON r.id = a.receita_id
      WHERE a.conexao_id = $1`, [c.id]);
  return {
    conectado: true,
    conta_nome: c.conta_nome,
    conta_cnpj: c.conta_cnpj,
    importar_desde: c.desde,
    ultima_sync_em: c.ultima_sync_em,
    webhook_ativo: !!c.webhook_id,
    erro: c.erro,
    receitas: n.rows[0].total,
    receitas_pagas: n.rows[0].pagas,
    valor_pago: Number(n.rows[0].valor_pago),
  };
}

export async function conectar(empresaId: number, usuarioId: number, apiKeyBruta: string, importarDesde: string) {
  const apiKey = String(apiKeyBruta || '').trim();
  if (!apiKey.startsWith('$aact_')) throw new ErroAsaas('Essa não parece uma chave de API do Asaas. Ela começa com $aact_.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importarDesde || '')) throw new ErroAsaas('Informe a partir de qual data importar.');
  if (await conexaoDaEmpresa(empresaId)) throw new ErroAsaas('Esta empresa já tem uma conta do Asaas conectada. Desconecte antes de trocar.', 409);

  const http = cliente(apiKey);
  const conta = (await http.get('/myAccount')).data;

  const token = 'duo_' + randomBytes(24).toString('hex');
  const ins = await query(
    `INSERT INTO asaas_conexoes (empresa_id, usuario_id, api_key_enc, conta_nome, conta_cnpj, webhook_token_hash, importar_desde)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [empresaId, usuarioId, encrypt(apiKey), conta.name || conta.companyName || null,
     soDigitos(conta.cpfCnpj) || null, hash(token), importarDesde]);
  const conexaoId: number = ins.rows[0].id;

  try {
    const { data: wh } = await http.post('/webhooks', {
      name: 'Duo — receitas',
      url: URL_WEBHOOK(conexaoId),
      email: conta.email || undefined,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: token,
      sendType: 'SEQUENTIALLY',
      events: EVENTOS_WEBHOOK,
    });
    await query('UPDATE asaas_conexoes SET webhook_id = $1 WHERE id = $2', [wh.id, conexaoId]);
  } catch (e: any) {
    // Sem webhook a conexão ainda funciona pelo job de 6 em 6 horas; a tela mostra o aviso.
    await query('UPDATE asaas_conexoes SET erro = $1 WHERE id = $2',
      [`Não foi possível registrar o aviso automático no Asaas: ${e.message}`, conexaoId]);
  }

  // A importação inicial pode levar alguns minutos numa conta grande: roda em segundo plano.
  setImmediate(() => sincronizar(conexaoId).catch(e => console.error('[AsaasReceitas] sync inicial', conexaoId, e.message)));
  return status(empresaId);
}

export async function desconectar(empresaId: number) {
  const c = await conexaoDaEmpresa(empresaId);
  if (!c) return { conectado: false };
  if (c.webhook_id) {
    try { await cliente(decrypt(c.api_key_enc)).delete(`/webhooks/${c.webhook_id}`); }
    catch (e: any) { console.warn('[AsaasReceitas] não removeu o webhook', c.webhook_id, e.message); }
  }
  // As receitas importadas ficam; só some o vínculo (e com ele a chave).
  await query('DELETE FROM asaas_cobrancas WHERE conexao_id = $1', [c.id]);
  await query('DELETE FROM asaas_conexoes WHERE id = $1', [c.id]);
  return { conectado: false };
}

/** Cliente do CRM pelo CPF/CNPJ dentro da empresa; cria se não existir. Sem vencimento: quem cobra é o Asaas. */
async function clienteDoCrm(db: PoolClient, conexao: any, http: AxiosInstance, customerId: string, cache: Map<string, any>) {
  if (!customerId) return { id: null, nome: null };
  if (cache.has(customerId)) return cache.get(customerId);
  let cus: any;
  try { cus = (await http.get(`/customers/${customerId}`)).data; } catch { cus = null; }
  let res = { id: null as number | null, nome: cus?.name || null };
  const doc = soDigitos(cus?.cpfCnpj);
  if (cus && (doc.length === 11 || doc.length === 14)) {
    // Depois do CPF/CNPJ, o e-mail: o cadastro manual pode ter o CPF e o Asaas o CNPJ da mesma
    // pessoa (Luciana Lion, empresa 44) — sem isso, juntar duplicados não durava até a próxima sync.
    const achado = await db.query(
      `SELECT id, nome FROM clientes
        WHERE empresa_id = $1 AND (cpf_cnpj = $2 OR ($3 <> '' AND lower(trim(email)) = $3))
        ORDER BY (cpf_cnpj = $2) DESC NULLS LAST, id LIMIT 1`,
      [conexao.empresa_id, doc, String(cus.email || '').trim().toLowerCase()]);
    if (achado.rows[0]) {
      res = { id: achado.rows[0].id, nome: achado.rows[0].nome };
    } else {
      const novo = await db.query(
        `INSERT INTO clientes (codigo, nome, email, telefone, cpf_cnpj, empresa_id, usuario_id, servico)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Asaas') RETURNING id, nome`,
        [`ASAAS-${customerId}`.slice(0, 20), String(cus.name || 'Cliente Asaas').slice(0, 255),
         cus.email || null, soDigitos(cus.mobilePhone || cus.phone).slice(0, 20) || null,
         doc, conexao.empresa_id, conexao.usuario_id]);
      res = { id: novo.rows[0].id, nome: novo.rows[0].nome };
    }
  }
  cache.set(customerId, res);
  return res;
}

/** Aplica uma cobrança: cria ou atualiza a receita. Idempotente; serializado por cobrança. */
/**
 * A despesa da taxa, ligada à receita por `receita_origem_id` (o mesmo vínculo da taxa de
 * serviço). Paga: cria ou acerta; deixou de estar paga (estorno, exclusão): sai. À vista
 * com a parcela 1 de 1 já paga — sem parcela a despesa não entra no dashboard.
 */
async function aplicarTaxa(db: PoolClient, conexao: any, receitaId: string, r: ReturnType<typeof receitaDaCobranca>) {
  const atual = (await db.query(
    `SELECT id FROM despesas WHERE receita_origem_id = $1 AND categoria = 'Taxa Asaas'`, [receitaId])).rows[0];
  if (!r.taxa) {
    if (atual) {
      await db.query('DELETE FROM parcelas_despesas WHERE despesa_id = $1', [atual.id]);
      await db.query('DELETE FROM despesas WHERE id = $1', [atual.id]);
    }
    return;
  }
  const descricao = `Taxa Asaas — ${r.descricao}`.slice(0, 500);
  let despesaId = atual?.id;
  if (despesaId) {
    await db.query(
      `UPDATE despesas SET descricao = $1, valor = $2, data = $3, status = 'pago', pago = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`, [descricao, r.taxa, r.pagoEm, despesaId]);
    await db.query('DELETE FROM parcelas_despesas WHERE despesa_id = $1', [despesaId]);
  } else {
    despesaId = (await db.query(
      `INSERT INTO despesas (descricao, valor, data, categoria, tipo_pagamento, status, pago, parcelado, recorrente,
                             usuario_id, receita_origem_id, origem)
       VALUES ($1, $2, $3, 'Taxa Asaas', 'a_vista', 'pago', true, false, false, $4, $5, 'asaas') RETURNING id`,
      [descricao, r.taxa, r.pagoEm, conexao.usuario_id, receitaId])).rows[0].id;
  }
  await db.query(
    `INSERT INTO parcelas_despesas (despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento)
     VALUES ($1, 1, 1, $2, $3, 'PAGO', $3)`, [despesaId, r.taxa, r.pagoEm]);
}

/**
 * Lançamento manual que a cobrança do Asaas (ou a parcela do Conta Azul) repete: parcela da MESMA cliente, com o mesmo valor
 * e o mesmo vencimento, numa receita que não veio do Asaas. Quem já lançava à mão antes de
 * conectar ficava com tudo em dobro (Instituto Libertá, 07/10/2026). A parcela sai do lançamento
 * manual e fica só a do Asaas, que se atualiza sozinha; as outras parcelas manuais continuam,
 * cobrindo os meses que o Asaas ainda não gerou. Sem parcela nenhuma, a receita manual sai.
 * Devolve o id da receita manual mexida, ou null.
 */
export async function absorverParcelaManual(
  db: PoolClient, empresaId: number, clienteId: number | null, valor: number, vencimento: string,
  quem = 'Asaas',
): Promise<string | null> {
  if (!clienteId) return null;
  const par = (await db.query(
    `SELECT p.id, p.receita_id, p.valor
       FROM parcelas_receitas p
       JOIN receitas r ON r.id = p.receita_id
       JOIN usuarios u ON u.id = r.usuario_id
      WHERE u.empresa_id = $1 AND r.cliente_id = $2
        AND p.valor = $3 AND p.data_vencimento = $4::date
        AND r.status NOT IN ('cancelado', 'estornado')
        AND NOT EXISTS (SELECT 1 FROM asaas_cobrancas a WHERE a.receita_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM contaazul_lancamentos ca WHERE ca.receita_id = r.id)
      ORDER BY r.created_at, p.numero_parcela
      LIMIT 1
      FOR UPDATE OF p, r`,
    [empresaId, clienteId, valor, vencimento])).rows[0];
  if (!par) return null;
  await db.query('DELETE FROM parcelas_receitas WHERE id = $1', [par.id]);
  const resto = (await db.query(
    'SELECT COUNT(*)::int AS n FROM parcelas_receitas WHERE receita_id = $1', [par.receita_id])).rows[0].n;
  if (resto === 0) {
    await db.query('DELETE FROM receitas WHERE id = $1', [par.receita_id]);
  } else {
    // Parcelado exige 2+ parcelas (receitas_parcelas_minimo): sobrando uma, vira à vista.
    await db.query(
      `UPDATE receitas SET valor = GREATEST(valor - $1, 0),
              parcelado = $2 > 1,
              tipo_pagamento = CASE WHEN $2 > 1 THEN tipo_pagamento ELSE 'a_vista' END,
              numero_parcelas = CASE WHEN $2 > 1 THEN $2 END,
              parcela_atual = CASE WHEN $2 > 1 THEN LEAST(parcela_atual, $2) END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3`, [par.valor, resto, par.receita_id]);
  }
  console.log(`[${quem}] empresa ${empresaId}: parcela manual ${par.id} (receita ${par.receita_id}) absorvida pela do ${quem}`);
  return par.receita_id;
}

async function aplicarCobranca(conexao: any, http: AxiosInstance, p: CobrancaAsaas, cache: Map<string, any>) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [conexao.id, p.id]);
    const vinculo = (await db.query(
      'SELECT receita_id FROM asaas_cobrancas WHERE conexao_id = $1 AND payment_id = $2', [conexao.id, p.id])).rows[0];

    let receitaId: string | null = null;
    if (vinculo) {
      const existe = await db.query('SELECT id FROM receitas WHERE id = $1', [vinculo.receita_id]);
      if (!existe.rows[0]) {
        // Apagada à mão no Duo: a decisão da pessoa vale, não recriamos.
        await db.query('UPDATE asaas_cobrancas SET status_asaas = $1, atualizado_em = now() WHERE conexao_id = $2 AND payment_id = $3',
          [p.status, conexao.id, p.id]);
        await db.query('COMMIT');
        return 'ignorada';
      }
      receitaId = vinculo.receita_id;
    }

    const prev = receitaDaCobranca(p);
    if (!receitaId && !prev.temParcela) { await db.query('COMMIT'); return 'ignorada'; } // nunca entrou e já morreu

    const cli = await clienteDoCrm(db, conexao, http, p.customer, cache);
    const r = receitaDaCobranca(p, cli.nome);

    // A mesma cobrança já entrou pelo Conta Azul: a receita passa a ser do Asaas, sem duplicar.
    if (!receitaId && r.temParcela) {
      receitaId = await adotarReceitaContaAzul(db, conexao.empresa_id, cli.id, cli.nome, r.valor, r.vencimento);
    }

    if (receitaId) {
      await db.query(
        `UPDATE receitas SET descricao = $1, valor = $2, data = $3, status = $4, recebido = $5,
                cliente_id = COALESCE(cliente_id, $6), fonte = 'Asaas', updated_at = CURRENT_TIMESTAMP
          WHERE id = $7`,
        [r.descricao, r.valor, r.data, r.status, r.status === 'pago', cli.id, receitaId]);
      await db.query('DELETE FROM parcelas_receitas WHERE receita_id = $1', [receitaId]);
    } else {
      if (r.temParcela) await absorverParcelaManual(db, conexao.empresa_id, cli.id, r.valor, r.vencimento);
      const ins = await db.query(
        `INSERT INTO receitas (descricao, valor, data, fonte, tipo_pagamento, status, recebido, parcelado, usuario_id, cliente_id)
         VALUES ($1, $2, $3, 'Asaas', 'a_vista', $4, $5, false, $6, $7) RETURNING id`,
        [r.descricao, r.valor, r.data, r.status, r.status === 'pago', conexao.usuario_id, cli.id]);
      receitaId = ins.rows[0].id;
    }
    if (r.temParcela) {
      await db.query(
        `INSERT INTO parcelas_receitas (receita_id, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento)
         VALUES ($1, 1, 1, $2, $3, $4, $5)`,
        [receitaId, r.valor, r.vencimento, r.status === 'pago' ? 'PAGO' : 'PENDENTE', r.pagoEm]);
    }
    await aplicarTaxa(db, conexao, receitaId!, r);
    await db.query(
      `INSERT INTO asaas_cobrancas (conexao_id, payment_id, receita_id, status_asaas) VALUES ($1, $2, $3, $4)
       ON CONFLICT (conexao_id, payment_id) DO UPDATE SET status_asaas = EXCLUDED.status_asaas, atualizado_em = now()`,
      [conexao.id, p.id, receitaId, p.deleted ? 'DELETED' : p.status]);
    await db.query('COMMIT');
    return vinculo ? 'atualizada' : 'criada';
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

/** Importa/atualiza todas as cobranças com vencimento desde `importar_desde`. */
export async function sincronizar(conexaoId: number) {
  const conexao = (await query(SELECT_CONEXAO, [conexaoId])).rows[0];
  if (!conexao) return null;
  const http = cliente(decrypt(conexao.api_key_enc));
  const cache = new Map<string, any>();
  const desde: string = conexao.desde;
  const cont = { criada: 0, atualizada: 0, ignorada: 0 };
  const vistas = new Set<string>();
  try {
    for (let offset = 0; ; offset += 100) {
      const { data } = await http.get('/payments', { params: { 'dueDate[ge]': desde, offset, limit: 100 } });
      for (const p of data.data || []) {
        vistas.add(p.id);
        cont[await aplicarCobranca(conexao, http, p, cache) as keyof typeof cont]++;
      }
      if (!data.hasMore) break;
    }
    // Cobrança excluída não vem na listagem: confere as que temos e ainda estão vivas.
    const vivas = await query(
      `SELECT payment_id FROM asaas_cobrancas WHERE conexao_id = $1 AND status_asaas <> 'DELETED'`, [conexao.id]);
    for (const { payment_id } of vivas.rows) {
      if (vistas.has(payment_id)) continue;
      try {
        const p = (await http.get(`/payments/${payment_id}`)).data;
        await aplicarCobranca(conexao, http, p, cache);
      } catch { /* 404: segue; o webhook PAYMENT_DELETED cobre o caso normal */ }
    }
    await query('UPDATE asaas_conexoes SET ultima_sync_em = now(), erro = CASE WHEN webhook_id IS NULL THEN erro END WHERE id = $1', [conexao.id]);
    console.log(`[AsaasReceitas] empresa ${conexao.empresa_id}: ${cont.criada} novas, ${cont.atualizada} atualizadas, ${cont.ignorada} ignoradas`);
    return cont;
  } catch (e: any) {
    await query('UPDATE asaas_conexoes SET erro = $1 WHERE id = $2', [e.message, conexao.id]);
    throw e;
  }
}

export async function sincronizarDaEmpresa(empresaId: number) {
  const c = await conexaoDaEmpresa(empresaId);
  if (!c) throw new ErroAsaas('Nenhuma conta do Asaas conectada.', 404);
  return sincronizar(c.id);
}

/** Webhook: confere o token, busca a cobrança de novo NA API (não confia no corpo) e aplica. */
export async function receberWebhook(conexaoId: number, token: string | undefined, corpo: any) {
  const conexao = (await query(SELECT_CONEXAO, [conexaoId])).rows[0];
  if (!conexao || !token || hash(token) !== conexao.webhook_token_hash) return false;
  const paymentId = corpo?.payment?.id;
  if (!paymentId) return true;
  const http = cliente(decrypt(conexao.api_key_enc));
  let p: CobrancaAsaas;
  try { p = (await http.get(`/payments/${paymentId}`)).data; }
  catch { p = { ...corpo.payment, deleted: corpo.event === 'PAYMENT_DELETED' || corpo.payment.deleted }; }
  // Fora do período escolhido não entra, mas o que já entrou continua sendo atualizado.
  const jaTem = await query('SELECT 1 FROM asaas_cobrancas WHERE conexao_id = $1 AND payment_id = $2', [conexaoId, paymentId]);
  if (!jaTem.rows[0] && p.dueDate < conexao.desde) return true;
  await aplicarCobranca(conexao, http, p, new Map());
  return true;
}

export async function sincronizarTodas() {
  const r = await query('SELECT id FROM asaas_conexoes ORDER BY id');
  for (const { id } of r.rows) {
    try { await sincronizar(id); } catch (e: any) { console.error('[AsaasReceitas] sync', id, e.message); }
  }
}
