import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoNumero, ehPedidoDeSaida } from '../src/modules/crm/optout/optout.service';

describe('parar de receber', () => {
  test('o mesmo número com/sem 55 e com/sem o 9º dígito tem a mesma chave', () => {
    const k = chaveDoNumero('5524981213371');
    assert.equal(k, '2481213371');
    assert.equal(chaveDoNumero('24981213371'), k);
    assert.equal(chaveDoNumero('552481213371@s.whatsapp.net'), k);
    assert.equal(chaveDoNumero('+55 (24) 98121-3371'), k);
  });

  test('grupo ou número curto não tem chave', () => {
    assert.equal(chaveDoNumero('120363025@g.us'), null);
    assert.equal(chaveDoNumero('12345'), null);
  });

  test('clique: só o botão "Parar de receber"', () => {
    assert.equal(ehPedidoDeSaida('Parar de receber', true), true);
    assert.equal(ehPedidoDeSaida('Quero entender', true), false);
  });

  test('texto: a mensagem inteira tem que ser o pedido', () => {
    assert.equal(ehPedidoDeSaida('Parar', false), true);
    assert.equal(ehPedidoDeSaida('sair!', false), true);
    assert.equal(ehPedidoDeSaida('Não quero mais receber', false), true);
    assert.equal(ehPedidoDeSaida('vou sair do trabalho às 18h e te respondo', false), false);
    assert.equal(ehPedidoDeSaida('como faço para cancelar a compra?', false), false);
  });
});
