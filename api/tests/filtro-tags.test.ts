import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTagIds } from '../src/modules/crm/leads/leads.controller';

test('?tags= vira lista de ids, sem lixo nem repetição', () => {
  assert.deepEqual(lerTagIds('12,25'), [12, 25]);
  assert.deepEqual(lerTagIds(' 12 , 12,x, -3, 0,7'), [12, 7]);
  assert.deepEqual(lerTagIds(['4', '5,6']), [4, 5, 6]);
  assert.equal(lerTagIds(''), undefined);
  assert.equal(lerTagIds(undefined), undefined);
  assert.equal(lerTagIds('1); DROP TABLE leads;--'), undefined);
});
