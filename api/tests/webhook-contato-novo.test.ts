/**
 * Primeira mensagem de um número desconhecido (chamado #177, Anchor, 22/09/2026).
 *
 * O "Criar lead automaticamente" do estágio só alcançava quem já era contato — a
 * mensagem de quem escrevia pela primeira vez era descartada antes. Agora ela vira
 * contato, mas só quando o remetente é um TELEFONE: id interno (@lid) ou grupo
 * gerariam um card com número que não recebe mensagem.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeSerContatoNovo } from '../src/modules/crm/_shared/telefone';

test('podeSerContatoNovo', async (t) => {
  await t.test('o caso real: a Flaviane, celular de MG', () => {
    assert.equal(podeSerContatoNovo('553397058165@s.whatsapp.net', '553397058165'), true);
    assert.equal(podeSerContatoNovo('5511975714494@c.us', '5511975714494'), true);
  });

  await t.test('@lid sem resolução não é telefone, mesmo com 14 dígitos', () => {
    assert.equal(podeSerContatoNovo('72478193909984@lid', '72478193909984'), false);
  });

  await t.test('grupo, lista e canal ficam de fora', () => {
    assert.equal(podeSerContatoNovo('120363428971580082@g.us', '120363428971580082'), false);
    assert.equal(podeSerContatoNovo('status@broadcast', 'status'), false);
  });

  await t.test('placeholder e número brasileiro de tamanho errado ficam de fora', () => {
    assert.equal(podeSerContatoNovo('0000000000000@c.us', '0000000000000'), false);
    assert.equal(podeSerContatoNovo('55119876@c.us', '55119876'), false);
  });
});
