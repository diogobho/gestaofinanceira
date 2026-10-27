import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoParaModelo, modeloParaTexto, proximaVersao } from '../src/modules/whatsapp/canal/versao-modelo';

test('campos do card viram {{n}} na ordem da primeira aparição, repetido reaproveita', () => {
  const r = textoParaModelo('Oi [PrimeiroNome]! Você entrou [OrigemFrase]. Até logo, [PrimeiroNome].');
  assert.equal(r.corpo, 'Oi {{1}}! Você entrou {{2}}. Até logo, {{1}}.');
  assert.deepEqual(r.variaveis, ['[PrimeiroNome]', '[OrigemFrase]']);
  assert.deepEqual(r.exemplos, ['Maria', 'no Clube do Livro']);
});

test('o caminho de volta mostra o texto com os campos', () => {
  assert.equal(modeloParaTexto('Oi {{1}}, {{2}}', ['[PrimeiroNome]', '[OrigemFrase]']), 'Oi [PrimeiroNome], [OrigemFrase]');
});

test('próxima versão: v1 → v2, pulando nome que já existe', () => {
  assert.equal(proximaVersao('abr_ger_v1', ['abr_ger_v1']), 'abr_ger_v2');
  assert.equal(proximaVersao('abr_ger_v1', ['abr_ger_v1', 'abr_ger_v2', 'abr_ger_v3']), 'abr_ger_v4');
  assert.equal(proximaVersao('boas_vindas', ['boas_vindas']), 'boas_vindas_v2');
});
