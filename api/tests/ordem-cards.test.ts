/**
 * Ordem dos cards do CRM (#59). O valor vem da query string e vira ORDER BY, então
 * `normalizarOrdem` é a única porta: tudo o que não for uma ordem conhecida cai em
 * 'manual' — inclusive nomes que existem em QUALQUER objeto JS ("constructor").
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarOrdem } from '../src/modules/crm/leads/leads.service';

describe('normalizarOrdem', () => {
  test('aceita todas as ordens da tela', () => {
    for (const o of ['manual', 'recentes', 'antigos', 'mensagem', 'mais_recebidas',
      'nome_az', 'nome_za', 'valor', 'temperatura']) {
      assert.equal(normalizarOrdem(o), o);
    }
  });

  test('qualquer outra coisa vira manual', () => {
    for (const o of [undefined, null, '', 'NOME_AZ', 'l.nome; DROP TABLE leads', 42, ['nome_az']]) {
      assert.equal(normalizarOrdem(o), 'manual');
    }
  });

  test('propriedade herdada de objeto não passa', () => {
    for (const o of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(normalizarOrdem(o), 'manual');
    }
  });
});
