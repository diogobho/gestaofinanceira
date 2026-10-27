import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comDDIParaEnvio } from '../src/modules/crm/_shared/telefone';

test('celular brasileiro sem DDI ganha o 55', () => {
  assert.equal(comDDIParaEnvio('11963658408'), '5511963658408');
  assert.equal(comDDIParaEnvio('1133334444'), '551133334444');
});

test('11 dígitos que não são celular brasileiro ficam como vieram (#419)', () => {
  assert.equal(comDDIParaEnvio('16195775201'), '16195775201'); // EUA
  assert.equal(comDDIParaEnvio('55219733445'), '55219733445'); // BR de 8 dígitos já com 55
});

test('número com DDI completo não muda', () => {
  assert.equal(comDDIParaEnvio('5511963658408'), '5511963658408');
});
