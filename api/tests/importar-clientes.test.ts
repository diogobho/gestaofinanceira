import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCpfCnpj, normalizarCep, normalizarUf, normalizarData } from '../src/modules/clientes/clientes.importacao';

test('CPF/CNPJ: só dígitos, e o zero que o Excel come volta', () => {
  assert.equal(normalizarCpfCnpj('123.456.789-01'), '12345678901');
  assert.equal(normalizarCpfCnpj(1234567890), '01234567890');
  assert.equal(normalizarCpfCnpj('12.345.678/0001-90'), '12345678000190');
  assert.equal(normalizarCpfCnpj(2345678000190), '02345678000190');
  assert.equal(normalizarCpfCnpj('123'), null);
  assert.equal(normalizarCpfCnpj(''), null);
});

test('CEP e UF inválidos ficam vazios em vez de barrar a linha', () => {
  assert.equal(normalizarCep('15500-000'), '15500000');
  assert.equal(normalizarCep(1310100), '01310100');
  assert.equal(normalizarCep('123'), null);
  assert.equal(normalizarUf(' sp '), 'SP');
  assert.equal(normalizarUf('São Paulo'), null);
});

test('aniversário: dd/mm/aaaa, dd/mm, ISO e data do Excel', () => {
  assert.equal(normalizarData('05/10/1985'), '1985-10-05');
  assert.equal(normalizarData('5/3'), '2000-03-05');
  assert.equal(normalizarData('1985-10-05'), '1985-10-05');
  assert.equal(normalizarData(31325), '1985-10-05');
  assert.equal(normalizarData('31/02/1990'), null);
  assert.equal(normalizarData('qualquer coisa'), null);
});
