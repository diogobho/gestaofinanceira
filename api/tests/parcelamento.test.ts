import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularParcelamento } from '../src/modules/assinaturas/assinaturas.service';

test('1x é à vista: sem juros', () => {
  const r = calcularParcelamento(1134, 1, 0.0199);
  assert.deepEqual(r, { parcelas: 1, valorParcela: 1134, total: 1134, juros: 0 });
});

test('semestral do Profissional em 6x pela tabela Price a 1,99% a.m.', () => {
  const r = calcularParcelamento(1134, 6, 0.0199);
  assert.equal(r.valorParcela, 202.38);
  assert.equal(r.total, 1214.28);
  assert.equal(r.juros, 80.28);
});

test('o total é sempre parcela × n (o que o cartão cobra de fato)', () => {
  for (const n of [2, 3, 7, 12]) {
    const r = calcularParcelamento(2028, n, 0.0199);
    assert.equal(r.total, Math.round(r.valorParcela * n * 100) / 100);
    assert.ok(r.total > 2028);
  }
});
