import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lancamentoDoItem, dataDaBaixa, ItemContaAzul } from '../src/modules/contaazul/contaazul.importacao.service';

const base: ItemContaAzul = {
  id: 'p1', status: 'PENDING', status_traduzido: 'EM_ABERTO', total: 100, pago: 0, nao_pago: 100,
  descricao: 'Mensalidade', data_vencimento: '2026-10-10', cliente: { id: 'c', nome: 'Ana' },
  categorias: [{ id: 'k', nome: 'Cursos' }],
};

test('em aberto: pendente, valor da parcela, no vencimento', () => {
  const l = lancamentoDoItem(base, 'Totem', null);
  assert.equal(l.status, 'pendente');
  assert.equal(l.valor, 100);
  assert.equal(l.data, '2026-10-10');
  assert.equal(l.pagoEm, null);
  assert.equal(l.temParcela, true);
  assert.equal(l.descricao, 'Mensalidade — Ana');
  assert.equal(l.produto, 'Totem');
  assert.equal(l.categoria, 'Cursos');
});

test('recebido: valor que entrou (com juros) no dia da baixa', () => {
  const l = lancamentoDoItem({ ...base, status: 'ACQUITTED', status_traduzido: 'RECEBIDO', pago: 103.5, nao_pago: 0 }, 'Totem', '2026-10-12');
  assert.equal(l.status, 'pago');
  assert.equal(l.valor, 103.5);
  assert.equal(l.data, '2026-10-12');
  assert.equal(l.pagoEm, '2026-10-12');
});

test('recebido sem data de baixa cai no vencimento', () => {
  const l = lancamentoDoItem({ ...base, status: 'ACQUITTED', pago: 100 }, 'Totem', null);
  assert.equal(l.pagoEm, '2026-10-10');
});

test('perdido, renegociado e excluído: cancelado, sem parcela', () => {
  for (const status of ['LOST', 'RENEGOTIATED']) {
    const l = lancamentoDoItem({ ...base, status, status_traduzido: undefined }, 'Totem', null);
    assert.equal(l.status, 'cancelado'); assert.equal(l.temParcela, false);
  }
  assert.equal(lancamentoDoItem(base, 'Totem', null, true).status, 'cancelado');
});

test('atrasado e parcial', () => {
  assert.equal(lancamentoDoItem({ ...base, status: 'OVERDUE', status_traduzido: 'ATRASADO' }, 'T', null).status, 'atrasado');
  const p = lancamentoDoItem({ ...base, status: 'PARTIAL', status_traduzido: 'RECEBIDO_PARCIAL', pago: 40, nao_pago: 60 }, 'T', null);
  assert.equal(p.status, 'pendente');
  assert.equal(p.valor, 100);
  assert.match(p.descricao, /já recebido R\$ 40,00/);
});

test('nome do cliente não se repete se já está na descrição', () => {
  assert.equal(lancamentoDoItem({ ...base, descricao: 'Curso da Ana' }, 'T', null).descricao, 'Curso da Ana');
});

test('despesa usa o fornecedor', () => {
  const l = lancamentoDoItem({ ...base, cliente: null, fornecedor: { id: 'f', nome: 'Google' }, descricao: 'Workspace' }, 'T', null);
  assert.equal(l.descricao, 'Workspace — Google');
});

test('data da baixa: a mais recente', () => {
  assert.equal(dataDaBaixa({ baixas: [{ data_pagamento: '2026-09-01' }, { data_pagamento: '2026-09-15' }] }), '2026-09-15');
  assert.equal(dataDaBaixa({ baixas: [] }), null);
  assert.equal(dataDaBaixa(null), null);
});
