import { PoolClient } from 'pg';
import { pool, query } from '../../config/database';
import { contaazulService } from './contaazul.service';
import { absorverParcelaManual } from '../asaas-receitas/asaas-receitas.service';
import { receitaAsaasGemea } from './gemeos-asaas';

/**
 * Lançamentos do Conta Azul em Receitas e Despesas (106, 09/10/2026) — o mesmo desenho das
 * receitas do Asaas (105). Contas a receber viram receitas; contas a pagar, despesas.
 *
 * Cada PARCELA do Conta Azul vira um lançamento à vista com a parcela 1 de 1 (sem ela o
 * dashboard não enxerga o lançamento). Recebida/paga: fica no dia da baixa, com o valor que de
 * fato entrou ou saiu (`pago`, com juros e desconto). Perdida, renegociada ou excluída no Conta
 * Azul: o lançamento fica `cancelado` e PERDE a parcela — o dashboard só conhece PAGO/PENDENTE.
 *
 * O Conta Azul não tem webhook (FAQ oficial). Por isso dois jobs: o incremental, a cada 15 min,
 * pela `data_alteracao`; e a passada completa, a cada 6 h, que também acha as exclusões (parcela
 * excluída não aparece na busca). Só leitura no Conta Azul: nenhuma chamada escreve lá.
 *
 * Limite da API: 600 chamadas/min e 10/s por conta conectada — `chamar` espaça as chamadas.
 */

type Tipo = 'receita' | 'despesa';

export interface ItemContaAzul {
  id: string;
  status: string;              // ACQUITTED, PENDING, OVERDUE, PARTIAL, LOST, RENEGOTIATED…
  status_traduzido?: string;   // RECEBIDO, EM_ABERTO, ATRASADO, RECEBIDO_PARCIAL, PERDIDO…
  total: number;
  pago: number;
  nao_pago: number;
  descricao?: string | null;
  data_vencimento: string;
  data_alteracao?: string | null;
  categorias?: { id: string; nome: string }[];
  cliente?: { id: string; nome: string } | null;
  fornecedor?: { id: string; nome: string } | null;
}

const PAGOS = new Set(['ACQUITTED', 'RECEBIDO']);
const MORTOS = new Set(['LOST', 'PERDIDO', 'RENEGOTIATED', 'RENEGOCIADO', 'CANCELLED', 'CANCELADO']);
const ATRASADOS = new Set(['OVERDUE', 'ATRASADO']);

const DESDE_SEMPRE = '2000-01-01';
const ate = () => `${new Date().getFullYear() + 5}-12-31`;
const dinheiro = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/** Como a parcela do Conta Azul fica no Duo. Pura, para testar sem banco. */
export function lancamentoDoItem(
  it: ItemContaAzul, conexaoNome: string, pagoEm: string | null, excluido = false,
) {
  const s = it.status_traduzido || it.status;
  const status = excluido || MORTOS.has(it.status) || MORTOS.has(s) ? 'cancelado'
    : PAGOS.has(it.status) || PAGOS.has(s) ? 'pago'
    : ATRASADOS.has(it.status) || ATRASADOS.has(s) ? 'atrasado'
    : 'pendente';
  const pago = status === 'pago';
  // Pago com juros ou desconto: vale o que de fato entrou/saiu. O resto, o valor da parcela.
  const valor = pago && Number(it.pago) > 0 ? dinheiro(it.pago) : dinheiro(it.total);
  const parte = (it.cliente?.nome || it.fornecedor?.nome || '').trim();
  const base = (it.descricao || '').trim() || 'Lançamento Conta Azul';
  const parcial = !pago && Number(it.pago) > 0 ? ` (já recebido R$ ${dinheiro(it.pago).toFixed(2).replace('.', ',')})` : '';
  const quem = parte && !base.toLowerCase().includes(parte.toLowerCase()) ? ` — ${parte}` : '';
  const quitadoEm = pago ? (pagoEm || it.data_vencimento) : null;
  return {
    status,
    descricao: `${base}${quem}${parcial}`.slice(0, 500),
    valor,
    data: quitadoEm || it.data_vencimento,   // fica no dia em que o dinheiro entrou/saiu
    vencimento: it.data_vencimento,
    pagoEm: quitadoEm,
    temParcela: status !== 'cancelado' && valor > 0,
    categoria: (it.categorias?.[0]?.nome || 'Conta Azul').slice(0, 100),
    produto: conexaoNome.slice(0, 255),
    parte: parte || null,
  };
}

/** Dia da última baixa (a data de pagamento só vem na parcela por id). */
export function dataDaBaixa(parcela: any): string | null {
  const datas = (parcela?.baixas || []).map((b: any) => b?.data_pagamento).filter(Boolean).sort();
  return datas.length ? String(datas[datas.length - 1]).slice(0, 10) : null;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chamada GET espaçada (≤ ~8/s) e com nova tentativa em 429. */
async function chamar(conexaoId: number, caminho: string): Promise<{ status: number; corpo: any }> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    await pausa(125);
    const r = await contaazulService.api(conexaoId, caminho);
    if (r.status === 429) { await pausa(2000 * (tentativa + 1)); continue; }
    const corpo = await r.json().catch(() => null);
    return { status: r.status, corpo };
  }
  throw new Error('Conta Azul: limite de chamadas (429) mesmo depois de esperar');
}

async function* buscar(conexaoId: number, tipo: Tipo, desde: string, alteradosDesde?: string, limite?: string | null) {
  const lado = tipo === 'receita' ? 'receber' : 'pagar';
  for (let pagina = 1; pagina <= 100; pagina++) {
    const q = new URLSearchParams({
      pagina: String(pagina), tamanho_pagina: '500',
      data_vencimento_de: alteradosDesde ? DESDE_SEMPRE : desde, data_vencimento_ate: limite || ate(),
    });
    if (alteradosDesde) {
      q.set('data_alteracao_de', alteradosDesde);
      q.set('data_alteracao_ate', horaSaoPaulo(new Date(Date.now() + 60_000)));
    }
    const { status, corpo } = await chamar(conexaoId, `/v1/financeiro/eventos-financeiros/contas-a-${lado}/buscar?${q}`);
    if (status !== 200) throw new Error(`Conta Azul respondeu ${status} na busca de contas a ${lado}`);
    const itens: ItemContaAzul[] = corpo?.itens || [];
    for (const it of itens) yield it;
    if (itens.length < 500) return;
  }
}

/** `data_alteracao_*` é date-time de São Paulo, sem fuso. */
function horaSaoPaulo(d: Date) {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19);
}

/** Cadastro da pessoa no Conta Azul (a busca só traz id e nome; CPF, e-mail e telefone vêm aqui). */
export interface PessoaContaAzul {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco?: { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string } | null;
}

const soDigitos = (x?: string | null) => String(x || '').replace(/\D/g, '');

async function pessoa(ctx: Contexto, ref?: { id: string; nome: string } | null): Promise<PessoaContaAzul | null> {
  if (!ref?.id) return null;
  if (ctx.pessoas.has(ref.id)) return ctx.pessoas.get(ref.id)!;
  let p: PessoaContaAzul = { id: ref.id, nome: ref.nome, documento: null, email: null, telefone: null };
  const { status, corpo } = await chamar(ctx.conf.conexao_id, `/v1/pessoas/${ref.id}`);
  if (status === 200 && corpo) {
    const e = corpo.enderecos?.[0];
    p = {
      id: ref.id,
      nome: String(corpo.nome || ref.nome).trim(),
      documento: [11, 14].includes(soDigitos(corpo.documento).length) ? soDigitos(corpo.documento) : null,
      email: String(corpo.email || '').trim().toLowerCase() || null,
      telefone: soDigitos(corpo.telefone_celular || corpo.telefone_comercial || corpo.contato_cobranca_faturamento?.whatsapp).slice(0, 20) || null,
      endereco: e || null,
    };
  }
  ctx.pessoas.set(ref.id, p);
  return p;
}

/**
 * Cliente do CRM, como no Asaas: pelo CPF/CNPJ, depois pelo e-mail, depois pelo nome igual (sem
 * caixa) quando há um só; nenhum → cria. Quem já existia ganha o CPF, e-mail e telefone que faltavam
 * (a Panteras tinha 97 clientes, nenhum com CPF). Sem vencimento: quem cobra é o Conta Azul.
 */
async function clienteDoCrm(db: PoolClient, conf: any, p: PessoaContaAzul | null): Promise<number | null> {
  if (!p?.nome) return null;
  // Duas parcelas da mesma pessoa ao mesmo tempo (job + "Conferir agora") não criam dois clientes.
  await db.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [conf.empresa_id, 'ca-cliente:' + p.id]);
  const achado = (await db.query(
    `SELECT id FROM clientes
      WHERE empresa_id = $1
        AND (($2 <> '' AND cpf_cnpj = $2) OR ($3 <> '' AND lower(trim(email)) = $3))
      ORDER BY ($2 <> '' AND cpf_cnpj = $2) DESC, id LIMIT 1`,
    [conf.empresa_id, p.documento || '', p.email || ''])).rows[0]
    || (await db.query(
      // Nome repetido no CRM (duas "Maria Silva") não decide: cria a do Conta Azul, com CPF.
      `SELECT MIN(id) AS id FROM clientes WHERE empresa_id = $1 AND lower(trim(nome)) = lower(trim($2))
       HAVING COUNT(*) = 1`, [conf.empresa_id, p.nome])).rows[0];
  if (achado?.id) {
    await db.query(
      `UPDATE clientes SET cpf_cnpj = COALESCE(NULLIF(cpf_cnpj, ''), $2), email = COALESCE(NULLIF(email, ''), $3),
              telefone = COALESCE(NULLIF(telefone, ''), $4), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`, [achado.id, p.documento, p.email, p.telefone]);
    return achado.id;
  }
  const e = p.endereco || {};
  const novo = await db.query(
    `INSERT INTO clientes (codigo, nome, email, telefone, cpf_cnpj, empresa_id, usuario_id, servico, cidade,
                           endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade,
                           endereco_estado, endereco_cep)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Conta Azul', $8, $9, $10, $11, $12, $8, $13, $14) RETURNING id`,
    [`CA-${p.id}`.slice(0, 20), p.nome.slice(0, 255), p.email, p.telefone, p.documento, conf.empresa_id, conf.usuario_id,
     (e.cidade || '').slice(0, 100) || null, (e.logradouro || '').slice(0, 200) || null, (e.numero || '').slice(0, 20) || null,
     (e.complemento || '').slice(0, 100) || null, (e.bairro || '').slice(0, 100) || null,
     /^[A-Z]{2}$/.test(e.estado || '') ? e.estado : null, soDigitos(e.cep).slice(0, 10) || null]);
  return novo.rows[0].id;
}

/**
 * O que foi vendido: os itens da venda que gerou a parcela (`evento.referencia`, origem VENDA…).
 * Mais de um item: o de maior valor. Lançamento que não veio de venda (feito direto no financeiro
 * do Conta Azul): null — a receita fica em "Outros".
 */
async function produtoDaParcela(ctx: Contexto, detalhe: any): Promise<string | null> {
  const ref = detalhe?.evento?.referencia;
  if (!ref?.id || !/VENDA/i.test(String(ref.origem || ''))) return null;
  if (ctx.vendas.has(ref.id)) return ctx.vendas.get(ref.id)!;
  const { status, corpo } = await chamar(ctx.conf.conexao_id, `/v1/venda/${ref.id}/itens`);
  const itens: any[] = status === 200 ? corpo?.itens || [] : [];
  const top = itens.filter((i) => i?.nome).sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))[0];
  const nome = top ? String(top.nome).trim().slice(0, 100) : null;
  ctx.vendas.set(ref.id, nome);
  return nome;
}

interface Contexto {
  conf: any;
  nome: string;
  pessoas: Map<string, PessoaContaAzul | null>;
  vendas: Map<string, string | null>;
}

/** Aplica uma parcela: cria, atualiza ou cancela o lançamento. Idempotente; serializado por parcela. */
async function aplicar(ctx: Contexto, tipo: Tipo, it: ItemContaAzul, excluido = false) {
  const { conf } = ctx;
  // Nada mudou desde a última vez (mesmo status, mesma data_alteracao): nem chama a API.
  if (!excluido && it.data_alteracao) {
    const ja = (await query(
      `SELECT 1 FROM contaazul_lancamentos
        WHERE conexao_id = $1 AND parcela_id = $2 AND status_ca = $3 AND data_alteracao = $4::timestamp`,
      [conf.conexao_id, it.id, it.status, it.data_alteracao])).rows[0];
    if (ja) return 'ignorada';
  }
  // A data de pagamento e a venda de origem só vêm na parcela por id: a receita sempre precisa
  // dela (produto); a despesa, só quando está paga.
  let pagoEm: string | null = null;
  let produto: string | null = null;
  let pessoaCa: PessoaContaAzul | null = null;
  const previa = lancamentoDoItem(it, ctx.nome, null, excluido);
  if (!excluido && (tipo === 'receita' || previa.status === 'pago')) {
    const { status, corpo } = await chamar(conf.conexao_id, `/v1/financeiro/eventos-financeiros/parcelas/${it.id}`);
    if (status === 200) {
      pagoEm = previa.status === 'pago' ? dataDaBaixa(corpo) : null;
      if (tipo === 'receita') produto = await produtoDaParcela(ctx, corpo);
    }
  }
  if (tipo === 'receita' && !excluido && previa.status !== 'cancelado') pessoaCa = await pessoa(ctx, it.cliente);
  const l = lancamentoDoItem(it, ctx.nome, pagoEm, excluido);
  const fonte = produto || 'Outros';

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [conf.conexao_id, it.id]);
    const vinculo = (await db.query(
      'SELECT receita_id, despesa_id, espelho_asaas FROM contaazul_lancamentos WHERE conexao_id = $1 AND parcela_id = $2',
      [conf.conexao_id, it.id])).rows[0];
    const marcar = (rid: string | null, did: string | null, espelho = false) => db.query(
      `INSERT INTO contaazul_lancamentos (conexao_id, parcela_id, tipo, receita_id, despesa_id, status_ca, data_alteracao,
                                         parte_nome, espelho_asaas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (conexao_id, parcela_id) DO UPDATE
         SET status_ca = EXCLUDED.status_ca, data_alteracao = EXCLUDED.data_alteracao,
             parte_nome = COALESCE(EXCLUDED.parte_nome, contaazul_lancamentos.parte_nome), atualizado_em = now()`,
      [conf.conexao_id, it.id, tipo, rid, did, excluido ? 'EXCLUIDO' : it.status, it.data_alteracao || null,
       l.parte, espelho]);

    // A receita é a do Asaas (gemeos-asaas.ts): quem manda nela é ele, aqui só se registra.
    if (vinculo?.espelho_asaas) {
      await marcar(vinculo.receita_id, null);
      await db.query('COMMIT');
      return 'espelho';
    }

    let id: string | null = vinculo ? (tipo === 'receita' ? vinculo.receita_id : vinculo.despesa_id) : null;
    if (id) {
      const tabela = tipo === 'receita' ? 'receitas' : 'despesas';
      const existe = await db.query(`SELECT 1 FROM ${tabela} WHERE id = $1`, [id]);
      if (!existe.rows[0]) {
        // Apagado à mão no Duo: a decisão da pessoa vale, não recriamos.
        await marcar(vinculo.receita_id, vinculo.despesa_id);
        await db.query('COMMIT');
        return 'ignorada';
      }
    }
    if (!id && !l.temParcela) { await db.query('COMMIT'); return 'ignorada'; } // nunca entrou e já morreu

    const pago = l.status === 'pago';
    if (id && l.status === 'cancelado') {
      // Perdida, renegociada ou excluída: o lançamento fica, com o valor que tinha, sem parcela.
      if (tipo === 'receita') {
        await db.query(`UPDATE receitas SET status = 'cancelado', recebido = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        await db.query('DELETE FROM parcelas_receitas WHERE receita_id = $1', [id]);
        await marcar(id, null);
      } else {
        await db.query(`UPDATE despesas SET status = 'cancelado', pago = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        await db.query('DELETE FROM parcelas_despesas WHERE despesa_id = $1', [id]);
        await marcar(null, id);
      }
      await db.query('COMMIT');
      return 'atualizada';
    }
    if (tipo === 'receita') {
      const clienteId = await clienteDoCrm(db, conf, pessoaCa);
      // O produto vendido entra na lista de produtos (que é por usuário) do dono dos lançamentos e
      // de quem administra a empresa — o filtro e a edição da receita leem dela; fora da lista, a
      // edição trocava o produto sem a pessoa ver.
      if (produto) {
        await db.query(
          `INSERT INTO categorias_receitas (nome, usuario_id)
           SELECT $1, u.id FROM usuarios u
            WHERE u.empresa_id = $3 AND u.ativo AND (u.id = $2 OR u.tipo_usuario IN ('master', 'creator'))
           ON CONFLICT (nome, usuario_id) DO NOTHING`,
          [produto, conf.usuario_id, conf.empresa_id]);
      }
      if (id) {
        await db.query(
          `UPDATE receitas SET descricao = $1, valor = $2, data = $3, status = $4, recebido = $5, produto = $6,
                  cliente_id = COALESCE(cliente_id, $7), fonte = $9, updated_at = CURRENT_TIMESTAMP
            WHERE id = $8`,
          [l.descricao, l.valor, l.data, l.status, pago, l.produto, clienteId, id, fonte]);
        await db.query('DELETE FROM parcelas_receitas WHERE receita_id = $1', [id]);
      } else {
        // A mesma conta a receber já está no Asaas: não duplica, a do Asaas vale.
        const gemea = l.temParcela
          ? await receitaAsaasGemea(db, conf.empresa_id, clienteId, l.parte, dinheiro(it.total), l.vencimento)
          : null;
        if (gemea) {
          await marcar(gemea, null, true);
          await db.query('COMMIT');
          return 'espelho';
        }
        if (l.temParcela) await absorverParcelaManual(db, conf.empresa_id, clienteId, l.valor, l.vencimento, 'ContaAzul');
        id = (await db.query(
          `INSERT INTO receitas (descricao, valor, data, fonte, tipo_pagamento, status, recebido, parcelado, usuario_id, cliente_id, produto)
           VALUES ($1, $2, $3, $9, 'a_vista', $4, $5, false, $6, $7, $8) RETURNING id`,
          [l.descricao, l.valor, l.data, l.status, pago, conf.usuario_id, clienteId, l.produto, fonte])).rows[0].id;
      }
      if (l.temParcela) {
        await db.query(
          `INSERT INTO parcelas_receitas (receita_id, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento)
           VALUES ($1, 1, 1, $2, $3, $4, $5)`,
          [id, l.valor, l.vencimento, pago ? 'PAGO' : 'PENDENTE', l.pagoEm]);
      }
      await marcar(id, null);
    } else {
      if (id) {
        await db.query(
          `UPDATE despesas SET descricao = $1, valor = $2, data = $3, status = $4, pago = $5, categoria = $6,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $7`,
          [l.descricao, l.valor, l.data, l.status, pago, l.categoria, id]);
        await db.query('DELETE FROM parcelas_despesas WHERE despesa_id = $1', [id]);
      } else {
        id = (await db.query(
          `INSERT INTO despesas (descricao, valor, data, categoria, tipo_pagamento, status, pago, parcelado, recorrente,
                                 usuario_id, origem, instituicao)
           VALUES ($1, $2, $3, $4, 'a_vista', $5, $6, false, false, $7, 'contaazul', $8) RETURNING id`,
          [l.descricao, l.valor, l.data, l.categoria, l.status, pago, conf.usuario_id, l.produto.slice(0, 120)])).rows[0].id;
      }
      if (l.temParcela) {
        await db.query(
          `INSERT INTO parcelas_despesas (despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento)
           VALUES ($1, 1, 1, $2, $3, $4, $5)`,
          [id, l.valor, l.vencimento, pago ? 'PAGO' : 'PENDENTE', l.pagoEm]);
      }
      await marcar(null, id);
    }
    await db.query('COMMIT');
    return vinculo ? 'atualizada' : 'criada';
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

async function contexto(conexaoId: number): Promise<Contexto | null> {
  const r = await query(
    `SELECT i.*, i.importar_desde::text AS desde, i.importar_ate::text AS ate, c.nome AS conexao_nome, c.ativo AS conexao_ativa
       FROM contaazul_importacao i JOIN contaazul_conexoes c ON c.id = i.conexao_id
      WHERE i.conexao_id = $1`, [conexaoId]);
  const conf = r.rows[0];
  if (!conf || !conf.ativo || !conf.conexao_ativa) return null;
  return { conf, nome: conf.conexao_nome, pessoas: new Map(), vendas: new Map() };
}

/**
 * Passada completa: tudo com vencimento desde `importar_desde`, mais as parcelas que já
 * entraram e não vieram na busca (excluídas no Conta Azul, ou com vencimento movido para trás).
 */
export async function sincronizar(conexaoId: number) {
  const ctx = await contexto(conexaoId);
  if (!ctx) return null;
  const inicio = new Date();
  const cont = { criada: 0, atualizada: 0, ignorada: 0, espelho: 0 };
  try {
    for (const tipo of ['receita', 'despesa'] as Tipo[]) {
      const vistas = new Set<string>();
      for await (const it of buscar(conexaoId, tipo, ctx.conf.desde, undefined, ctx.conf.ate)) {
        vistas.add(it.id);
        cont[await aplicar(ctx, tipo, it) as keyof typeof cont]++;
      }
      const vivas = await query(
        `SELECT parcela_id FROM contaazul_lancamentos WHERE conexao_id = $1 AND tipo = $2 AND status_ca <> 'EXCLUIDO'`,
        [conexaoId, tipo]);
      for (const { parcela_id } of vivas.rows) {
        if (vistas.has(parcela_id)) continue;
        const { status, corpo } = await chamar(conexaoId, `/v1/financeiro/eventos-financeiros/parcelas/${parcela_id}`);
        if (status === 404) {
          await aplicar(ctx, tipo, { id: parcela_id, status: 'EXCLUIDO', total: 0, pago: 0, nao_pago: 0, data_vencimento: ctx.conf.desde }, true);
        } else if (status === 200 && corpo) {
          const it = itemDaParcela(parcela_id, corpo);
          if (it) await aplicar(ctx, tipo, it);
        }
      }
    }
    await query(
      `UPDATE contaazul_importacao SET ultima_sync_em = now(), ultima_alteracao_em = $2, erro = NULL WHERE conexao_id = $1`,
      [conexaoId, inicio]);
    console.log(`[ContaAzulImport] conexão ${conexaoId} (${ctx.nome}): ${cont.criada} novos, ${cont.atualizada} atualizados, ${cont.ignorada} ignorados, ${cont.espelho} já no Asaas`);
    return cont;
  } catch (e: any) {
    await query('UPDATE contaazul_importacao SET erro = $1 WHERE conexao_id = $2', [e.message, conexaoId]);
    throw e;
  }
}

/** Só o que mudou desde a última passada (com 10 min de folga). */
export async function sincronizarAlteracoes(conexaoId: number) {
  const ctx = await contexto(conexaoId);
  if (!ctx) return null;
  if (!ctx.conf.ultima_alteracao_em) return sincronizar(conexaoId);
  const inicio = new Date();
  const desde = horaSaoPaulo(new Date(new Date(ctx.conf.ultima_alteracao_em).getTime() - 10 * 60_000));
  const cont = { criada: 0, atualizada: 0, ignorada: 0, espelho: 0 };
  try {
    for (const tipo of ['receita', 'despesa'] as Tipo[]) {
      for await (const it of buscar(conexaoId, tipo, ctx.conf.desde, desde)) {
        // Fora do período escolhido não entra, mas o que já entrou continua sendo atualizado.
        if (it.data_vencimento < ctx.conf.desde || (ctx.conf.ate && it.data_vencimento > ctx.conf.ate)) {
          const ja = await query('SELECT 1 FROM contaazul_lancamentos WHERE conexao_id = $1 AND parcela_id = $2', [conexaoId, it.id]);
          if (!ja.rows[0]) continue;
        }
        cont[await aplicar(ctx, tipo, it) as keyof typeof cont]++;
      }
    }
    await query('UPDATE contaazul_importacao SET ultima_alteracao_em = $2, erro = NULL WHERE conexao_id = $1', [conexaoId, inicio]);
    if (cont.criada || cont.atualizada) {
      console.log(`[ContaAzulImport] conexão ${conexaoId} (${ctx.nome}): ${cont.criada} novos, ${cont.atualizada} atualizados`);
    }
    return cont;
  } catch (e: any) {
    await query('UPDATE contaazul_importacao SET erro = $1 WHERE conexao_id = $2', [e.message, conexaoId]);
    throw e;
  }
}

/** A parcela por id tem outro formato que a busca; só o que `lancamentoDoItem` precisa. */
function itemDaParcela(id: string, p: any): ItemContaAzul | null {
  if (!p?.data_vencimento) return null;
  const total = Number(p.valor_composicao?.valor_bruto ?? p.valor ?? p.total ?? 0);
  const pago = (p.baixas || []).reduce((s: number, b: any) => s + Number(b?.valor_composicao?.valor_liquido || 0), 0);
  return {
    id, status: String(p.status || 'PENDING'), total, pago, nao_pago: Math.max(total - pago, 0),
    descricao: p.descricao || null, data_vencimento: String(p.data_vencimento).slice(0, 10),
    data_alteracao: p.data_alteracao || null,
  };
}

async function conexoesAtivas() {
  const r = await query(
    `SELECT i.conexao_id FROM contaazul_importacao i JOIN contaazul_conexoes c ON c.id = i.conexao_id
      WHERE i.ativo AND c.ativo ORDER BY i.conexao_id`);
  return r.rows.map((x: any) => x.conexao_id as number);
}

export async function sincronizarTodas(completa: boolean) {
  for (const id of await conexoesAtivas()) {
    try { completa ? await sincronizar(id) : await sincronizarAlteracoes(id); }
    catch (e: any) { console.error('[ContaAzulImport] sync', id, e.message); }
  }
}
