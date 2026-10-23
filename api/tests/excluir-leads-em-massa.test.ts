/**
 * Exclusão em massa de leads (estágio ou funil inteiro). O alvo vem do cliente e vira
 * filtro de DELETE: sem funil válido não há exclusão, e estágio inválido nunca pode
 * cair para "funil inteiro".
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lerAlvoEmMassa } from '../src/modules/crm/leads/leads.controller';

describe('lerAlvoEmMassa', () => {
  test('funil inteiro', () => {
    assert.deepEqual(lerAlvoEmMassa({ funil_id: 24 }), { funilId: 24, estagioId: undefined });
    assert.deepEqual(lerAlvoEmMassa({ funil_id: '24', estagio_id: '' }), { funilId: 24, estagioId: undefined });
  });

  test('estágio do funil (query string chega como texto)', () => {
    assert.deepEqual(lerAlvoEmMassa({ funil_id: '24', estagio_id: '208' }), { funilId: 24, estagioId: 208 });
  });

  test('sem funil válido, recusa', () => {
    for (const f of [undefined, null, '', 'abc', 0, -1, 1.5]) {
      assert.equal(lerAlvoEmMassa({ funil_id: f }), null, String(f));
    }
    assert.equal(lerAlvoEmMassa(undefined), null);
  });

  test('estágio inválido recusa em vez de virar funil inteiro', () => {
    for (const e of ['abc', 0, -3, 2.5]) {
      assert.equal(lerAlvoEmMassa({ funil_id: 24, estagio_id: e }), null, String(e));
    }
  });
});
