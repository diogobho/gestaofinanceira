import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarDDI, ErroPortfolioErrado } from '../src/modules/whatsapp/meta/embedded-signup.service';

test('número com DDD vira DDI 55 + nacional', () => {
  assert.deepEqual(separarDDI('(11) 91234-5678'), { cc: '55', nacional: '11912345678' });
  assert.deepEqual(separarDDI('11 3456-7890'), { cc: '55', nacional: '1134567890' });
});

test('número já com 55 não ganha outro', () => {
  assert.deepEqual(separarDDI('+55 11 91234-5678'), { cc: '55', nacional: '11912345678' });
});

test('número sem DDD ou estrangeiro é recusado', () => {
  assert.equal(separarDDI('91234-5678'), null);
  assert.equal(separarDDI('+1 415 555 0100 22'), null);
  assert.equal(separarDDI(''), null);
});

test('portfólio errado diz qual foi escolhido e qual é o da empresa', () => {
  const e = new ErroPortfolioErrado('Jéssica Machado', 'Escola Panthers');
  assert.match(e.message, /"Jéssica Machado"/);
  assert.match(e.message, /"Escola Panthers"/);
});
