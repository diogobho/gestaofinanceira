import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarBotao, textoComLink, MAX_TEXTO_BOTAO } from '../src/modules/grupos/grupos.service';

test('sem texto e sem link não há botão', () => {
  assert.equal(normalizarBotao(null, 'oi'), null);
  assert.equal(normalizarBotao({ texto: ' ', url: '' }, 'oi'), null);
});

test('botão válido sai aparado', () => {
  assert.deepEqual(
    normalizarBotao({ texto: ' Quero participar ', url: ' https://escolapanthers.com.br/desafio ' }, 'Vem!'),
    { texto: 'Quero participar', url: 'https://escolapanthers.com.br/desafio' }
  );
});

test('recusa o que viraria um botão quebrado', () => {
  assert.throws(() => normalizarBotao({ texto: '', url: 'https://x.com' }, 'oi'), /texto do botão/);
  assert.throws(() => normalizarBotao({ texto: 'x'.repeat(MAX_TEXTO_BOTAO + 1), url: 'https://x.com' }, 'oi'), /no máximo/);
  assert.throws(() => normalizarBotao({ texto: 'Abrir', url: 'escolapanthers.com.br' }, 'oi'), /https:\/\//);
  assert.throws(() => normalizarBotao({ texto: 'Abrir', url: 'https://x.com/a b' }, 'oi'), /espaços/);
  assert.throws(() => normalizarBotao({ texto: 'Abrir', url: 'javascript:alert(1)' }, 'oi'), /https:\/\//);
  assert.throws(() => normalizarBotao({ texto: 'Abrir', url: 'https://x.com' }, '  '), /precisa de texto/);
});

test('o link vai também no texto, uma vez só', () => {
  assert.equal(textoComLink('Inscreva-se\n', 'https://x.com'), 'Inscreva-se\n\n👉 https://x.com');
  assert.equal(textoComLink('Link: https://x.com', 'https://x.com'), 'Link: https://x.com');
});

test('enquete: pergunta e 2 a 12 opções diferentes (#265, #295)', async () => {
  const { normalizarEnquete } = await import('../src/modules/grupos/grupos.service');
  assert.equal(normalizarEnquete(null), null);
  assert.equal(normalizarEnquete({ pergunta: ' ', opcoes: ['', ' '] }), null);
  assert.deepEqual(normalizarEnquete({ pergunta: ' Qual dia? ', opcoes: ['Seg', ' Ter ', 'Seg', ''] }), { pergunta: 'Qual dia?', opcoes: ['Seg', 'Ter'] });
  assert.throws(() => normalizarEnquete({ pergunta: 'Qual dia?', opcoes: ['Seg', 'Seg'] }), /duas opções/);
  assert.throws(() => normalizarEnquete({ pergunta: '', opcoes: ['A', 'B'] }), /pergunta/);
  assert.throws(() => normalizarEnquete({ pergunta: 'P', opcoes: Array.from({ length: 13 }, (_, i) => `o${i}`) }), /no máximo 12/);
});
