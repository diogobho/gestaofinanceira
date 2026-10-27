/**
 * Boas-vindas no privado dividida entre números da equipe (07/10/2026). O ponteiro anda
 * a cada envio; quem está desconectado ou no teto do dia sai da vez sem travar a roda.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escolherDaRoda } from '../src/modules/grupos/grupos.service';

describe('escolherDaRoda', () => {
  test('alterna na ordem marcada', () => {
    const lista = [45, 46, 50];
    assert.deepEqual([1, 2, 3, 4, 5].map((p) => escolherDaRoda(lista, lista, p)), [45, 46, 50, 45, 46]);
  });

  test('quem está fora da vez é pulado', () => {
    const lista = [45, 46, 50];
    assert.deepEqual([1, 2, 3, 4].map((p) => escolherDaRoda(lista, [45, 50], p)), [45, 50, 45, 50]);
  });

  test('ninguém disponível devolve null', () => {
    assert.equal(escolherDaRoda([45, 46], [], 3), null);
    assert.equal(escolherDaRoda([], [45], 1), null);
  });

  test('disponível fora da lista não entra', () => {
    assert.equal(escolherDaRoda([45], [45, 99], 2), 45);
  });
});
