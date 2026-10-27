import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerValorBR, valorParaCampo } from './moeda'

test('lerValorBR: formatos brasileiros', () => {
  assert.equal(lerValorBR('9700'), 9700)
  assert.equal(lerValorBR('9.700'), 9700)
  assert.equal(lerValorBR('9700,50'), 9700.5)
  assert.equal(lerValorBR('9.700,50'), 9700.5)
  assert.equal(lerValorBR('1.234.567,89'), 1234567.89)
  assert.equal(lerValorBR('R$ 9.700,00'), 9700)
  assert.equal(lerValorBR('0,99'), 0.99)
})

test('lerValorBR: ponto decimal de quem usava o campo antigo', () => {
  assert.equal(lerValorBR('9700.50'), 9700.5)
  assert.equal(lerValorBR('9700.5'), 9700.5)
  assert.equal(lerValorBR('12.5'), 12.5)
})

test('lerValorBR: vazio ou ilegível é não informado', () => {
  assert.equal(lerValorBR(''), undefined)
  assert.equal(lerValorBR('   '), undefined)
  assert.equal(lerValorBR('abc'), undefined)
  assert.equal(lerValorBR('9,7,0'), undefined)
})

test('valorParaCampo: numeric do pg chega como string', () => {
  assert.equal(valorParaCampo('9700.00'), '9.700,00')
  assert.equal(valorParaCampo(9700.5), '9.700,50')
  assert.equal(valorParaCampo('0.00'), '')
  assert.equal(valorParaCampo(null), '')
  assert.equal(valorParaCampo(undefined), '')
})

test('ida e volta não muda o valor', () => {
  for (const v of [9700, 9700.5, 1234567.89, 0.99]) {
    assert.equal(lerValorBR(valorParaCampo(v)), v)
  }
})
