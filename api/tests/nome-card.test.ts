import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeEhSoTelefone, nomeDoPush } from '../src/modules/crm/_shared/nome';

test('nomeEhSoTelefone', () => {
  for (const n of ['5511999999999', '+55 85 9176-2563', '', null, undefined]) assert.ok(nomeEhSoTelefone(n), String(n));
  for (const n of ['Ana', 'Débora 2', 'Érika']) assert.ok(!nomeEhSoTelefone(n), n);
});

test('nomeDoPush', () => {
  assert.equal(nomeDoPush('  Maria   Clara '), 'Maria Clara');
  assert.equal(nomeDoPush('Zé 🐆'), 'Zé 🐆');
  for (const p of ['.', '🐆', '123', '', null, undefined]) assert.equal(nomeDoPush(p), null, String(p));
  assert.equal(nomeDoPush('a'.repeat(300))?.length, 255);
});
