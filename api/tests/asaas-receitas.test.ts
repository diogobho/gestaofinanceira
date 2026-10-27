/**
 * Receitas do Asaas (105) — como a cobrança vira receita. A regra que importa: estornada ou
 * excluída fica SEM parcela, senão o dashboard (que só conhece PAGO/PENDENTE) a contaria
 * como dinheiro a receber.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { receitaDaCobranca, linhaDoExtrato, CobrancaAsaas } from '../src/modules/asaas-receitas/asaas-receitas.service';

const base: CobrancaAsaas = { id: 'pay_1', customer: 'cus_1', value: 197.5, status: 'PENDING', dueDate: '2026-10-10' };

describe('receitaDaCobranca', () => {
  test('pendente fica no vencimento, com parcela a receber', () => {
    const r = receitaDaCobranca(base, 'Ana');
    assert.equal(r.status, 'pendente');
    assert.equal(r.data, '2026-10-10');
    assert.equal(r.pagoEm, null);
    assert.equal(r.temParcela, true);
    assert.equal(r.descricao, 'Cobrança Asaas — Ana');
  });

  test('paga fica no dia em que o dinheiro caiu', () => {
    const r = receitaDaCobranca({ ...base, status: 'RECEIVED', paymentDate: '2026-10-09', clientPaymentDate: '2026-10-08' });
    assert.equal(r.status, 'pago');
    assert.equal(r.data, '2026-10-09');
    assert.equal(r.vencimento, '2026-10-10');
  });

  test('parcela de cartão confirmada segue a receber até cair', () => {
    const r = receitaDaCobranca({ ...base, status: 'CONFIRMED', confirmedDate: '2026-10-05', dueDate: '2027-03-10' });
    assert.equal(r.status, 'pendente');
    assert.equal(r.data, '2027-03-10');
    assert.equal(r.temParcela, true);
  });

  test('antecipada conta como recebida no dia em que a antecipação creditou', () => {
    const r = receitaDaCobranca({ ...base, status: 'CONFIRMED', dueDate: '2026-10-11', anticipated: true, antecipadaEm: '2026-08-14' });
    assert.equal(r.status, 'pago');
    assert.equal(r.data, '2026-08-14');
    assert.equal(r.pagoEm, '2026-08-14');
    // Boleto antecipado que o cliente não pagou: volta a ser atrasado (o Asaas debita a antecipação).
    assert.equal(receitaDaCobranca({ ...base, status: 'OVERDUE', anticipated: true, antecipadaEm: '2026-08-14' }).status, 'atrasado');
  });

  test('vencida vira atrasado e continua a receber', () => {
    const r = receitaDaCobranca({ ...base, status: 'OVERDUE' });
    assert.equal(r.status, 'atrasado');
    assert.equal(r.temParcela, true);
  });

  test('estornada e excluída ficam sem parcela', () => {
    assert.deepEqual([receitaDaCobranca({ ...base, status: 'REFUNDED' }).status, receitaDaCobranca({ ...base, status: 'REFUNDED' }).temParcela], ['estornado', false]);
    const exc = receitaDaCobranca({ ...base, status: 'RECEIVED', deleted: true });
    assert.equal(exc.status, 'cancelado');
    assert.equal(exc.temParcela, false);
  });

  test('descrição traz a parcela do parcelamento', () => {
    assert.equal(receitaDaCobranca({ ...base, description: 'Plano anual', installmentNumber: 3 }).descricao, 'Plano anual (parcela 3)');
  });
});

test('linha do extrato: taxa é todo tipo com FEE; saída só na conta que pediu', () => {
  const l = (type: string, value: number, saidas = false) => linhaDoExtrato({ id: 'ft_1', type, value, date: '2026-10-20' }, saidas);
  assert.equal(l('PAYMENT_FEE', -1.99), 'taxa');
  assert.equal(l('INSTANT_TEXT_MESSAGE_FEE', -0.55), 'taxa');
  assert.equal(l('PAYMENT_MESSAGING_NOTIFICATION_FEE', -0.89), 'taxa');
  assert.equal(l('INVOICE_FEE', -0.49), 'taxa');
  assert.equal(l('RECEIVABLE_ANTICIPATION_FEE', -30.6), 'taxa');
  assert.equal(l('PAYMENT_FEE_REVERSAL', 1.99), 'estorno_taxa');
  assert.equal(l('PAYMENT_RECEIVED', 500, true), null);
  assert.equal(l('TRANSFER', -115.67), null);
  assert.equal(l('TRANSFER', -115.67, true), 'saida');
  assert.equal(l('BILL_PAYMENT', -902.57, true), 'saida');
  assert.equal(l('ASAAS_CARD_BILL_PAYMENT', -35, true), 'saida');
  assert.equal(l('PIX_TRANSACTION_DEBIT_REFUND', 1072.85, true), 'estorno_saida');
  assert.equal(l('RECEIVABLE_ANTICIPATION_DEBIT', -585, true), null);
  assert.equal(l('RECEIVABLE_ANTICIPATION_GROSS_CREDIT', 5490, true), null);
});
