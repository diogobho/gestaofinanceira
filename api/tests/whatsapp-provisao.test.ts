/**
 * Provisão de porta do WhatsApp. Porta livre não é só "sem dono no banco": a 3016
 * está sem dono, mas com a sessão de outra pessoa guardada em disco — entregá-la a
 * uma conta nova subiria a instância logada no número alheio.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escolherPorta, portasComRastro } from '../src/services/whatsapp-provision.service';

describe('portasComRastro', () => {
  test('reconhece todo arquivo que uma instância deixa', () => {
    const nomes = [
      'session-whatsapp-3016',          // .baileys_auth/
      '.contacts-whatsapp-3011.json',
      '.lid-map-whatsapp-3018.json',
      '.webhook-config-whatsapp-3013.json',
      '.conn-status-whatsapp-3014.json',
      'ecosystem.porta-3021.config.js',
    ];
    assert.deepEqual([...portasComRastro(nomes)].sort(), [3011, 3013, 3014, 3016, 3018, 3021]);
  });

  test('ignora o que não é de porta numerada', () => {
    const nomes = [
      'session-whatsapp-api', '.lid-map-whatsapp-gestao-teste.json',
      '_backup_3016_20260811_145958', 'api-multi-baileys.js.bak.20260901135732',
      'ecosystem.config.js', 'create-instance.sh', 'logs',
    ];
    assert.equal(portasComRastro(nomes).size, 0);
  });
});

describe('escolherPorta', () => {
  test('pula as ocupadas e devolve a primeira livre', () => {
    const ocupadas = new Set([3013, 3014, 3015, 3016, 3017, 3018, 3019]);
    assert.equal(escolherPorta(ocupadas), 3020);
  });

  test('preenche buraco no meio da faixa', () => {
    assert.equal(escolherPorta(new Set([3013, 3015])), 3014);
  });

  test('faixa cheia devolve null', () => {
    assert.equal(escolherPorta(new Set([3013, 3014]), 3013, 3014), null);
  });
});
