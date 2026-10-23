import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passoValeParaOrigem } from '../src/modules/crm/_shared/agendamento';

test('passo sem filtro de origem vale para todos', () => {
  assert.equal(passoValeParaOrigem({}, 'Workshop'), true);
  assert.equal(passoValeParaOrigem({ origens: { modo: 'so', contem: [] } }, null), true);
});

test('só Clube do Livro e Desafio (sem acento e sem caixa)', () => {
  const p = { origens: { modo: 'so', contem: ['clube do livro', 'desafio'] } };
  assert.equal(passoValeParaOrigem(p, 'Clube do Livro'), true);
  assert.equal(passoValeParaOrigem(p, 'Desafio 52 semanas'), true);
  assert.equal(passoValeParaOrigem(p, 'Workshop Lidere Sua Vida'), false);
  assert.equal(passoValeParaOrigem(p, null), false);
});

test('exceto Clube do Livro e Desafio', () => {
  const p = { origens: { modo: 'exceto', contem: ['clube do livro', 'desafio'] } };
  assert.equal(passoValeParaOrigem(p, 'Clube do livro'), false);
  assert.equal(passoValeParaOrigem(p, 'Indicação'), true);
  assert.equal(passoValeParaOrigem(p, null), true);
});
