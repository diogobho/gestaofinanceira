import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagensResponsivas } from '../src/modules/crm/disparos-email/disparos-email.service';

test('imagem sem estilo ganha max-width', () => {
  assert.equal(imagensResponsivas('<p><img src="a.png"></p>'), '<p><img style="max-width:100%;height:auto;" src="a.png"></p>');
});

test('imagem com estilo mantém o dela e ganha o limite', () => {
  assert.equal(imagensResponsivas('<img src="a.png" style="border:0">'), '<img src="a.png" style="max-width:100%;height:auto;border:0">');
});

test('imagem que já limita a largura não muda', () => {
  const html = '<img style="max-width: 600px" src="a.png">';
  assert.equal(imagensResponsivas(html), html);
});

test('texto sem imagem não muda', () => {
  assert.equal(imagensResponsivas('<p>Oi [Nome]</p>'), '<p>Oi [Nome]</p>');
});
