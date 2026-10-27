/**
 * Campanhas de grupo (089): para onde o link manda, quando abrir o próximo grupo,
 * qual chip cria, as variações de texto e o que conta como clique.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugDe, slugValido, nomeDoGrupo, grupoComVaga, precisaDeGrupoNovo, chipDaVez, aplicarVariacoes, ehRobo, utmLimpo,
} from '../src/modules/grupos/campanhas-regras';

const g = (over: Partial<Parameters<typeof grupoComVaga>[0][0]> = {}) => ({
  grupo_id: 'x@g.us', convite: 'ABC', participantes: 0, ordem: 1, cheio: false, ativo: true, ...over,
});

describe('link e slug', () => {
  test('slug sem acento, minúsculo e com hífen', () => {
    assert.equal(slugDe('Lançamento Outubro 2026!'), 'lancamento-outubro-2026');
    assert.equal(slugDe('  --Club do Livro--  '), 'club-do-livro');
  });
  test('slug válido: 3 a 60, sem hífen nas pontas', () => {
    assert.ok(slugValido('club-do-livro'));
    assert.ok(!slugValido('ab'));
    assert.ok(!slugValido('-club'));
    assert.ok(!slugValido('Club'));
    assert.ok(!slugValido('a'.repeat(61)));
  });
});

describe('nome do grupo', () => {
  test('{{n}} vira o número; sem {{n}}, vai no fim', () => {
    assert.equal(nomeDoGrupo('Turma {{n}} - Outubro', 3), 'Turma 3 - Outubro');
    assert.equal(nomeDoGrupo('Club do Livro', 2), 'Club do Livro 2');
  });
  test('teto de 100 caracteres do WhatsApp', () => {
    assert.equal(nomeDoGrupo('x'.repeat(150), 1).length, 100);
  });
});

describe('para onde o link manda', () => {
  test('enche um de cada vez, pela ordem', () => {
    const r = grupoComVaga([g({ grupo_id: 'b', ordem: 2 }), g({ grupo_id: 'a', ordem: 1, participantes: 10 })], 100);
    assert.equal(r?.grupo_id, 'a');
  });
  test('pula cheio, inativo, sem convite e no limite', () => {
    const r = grupoComVaga([
      g({ grupo_id: 'cheio', ordem: 1, cheio: true }),
      g({ grupo_id: 'inativo', ordem: 2, ativo: false }),
      g({ grupo_id: 'sem-convite', ordem: 3, convite: null }),
      g({ grupo_id: 'no-limite', ordem: 4, participantes: 100 }),
      g({ grupo_id: 'ok', ordem: 5 }),
    ], 100);
    assert.equal(r?.grupo_id, 'ok');
  });
  test('sem vaga nenhuma → null', () => {
    assert.equal(grupoComVaga([g({ cheio: true })], 100), null);
    assert.equal(grupoComVaga([], 100), null);
  });
});

describe('quando abrir o próximo grupo', () => {
  test('campanha sem grupo precisa de um', () => {
    assert.ok(precisaDeGrupoNovo([], 900));
  });
  test('abre antes de encher: dentro da folga já pede o próximo', () => {
    assert.ok(!precisaDeGrupoNovo([g({ participantes: 800 })], 900));
    assert.ok(precisaDeGrupoNovo([g({ participantes: 885 })], 900));
  });
  test('folga proporcional em grupo pequeno', () => {
    // limite 10 → folga 1: com 8 ainda não, com 9 sim
    assert.ok(!precisaDeGrupoNovo([g({ participantes: 8 })], 10));
    assert.ok(precisaDeGrupoNovo([g({ participantes: 9 })], 10));
  });
  test('um grupo com folga basta, mesmo com outros cheios', () => {
    assert.ok(!precisaDeGrupoNovo([g({ cheio: true }), g({ participantes: 10 })], 900));
  });
});

describe('chip que cria', () => {
  test('o que tem menos grupos; empate vai para o primeiro da lista', () => {
    assert.equal(chipDaVez([5, 7], { 5: 2, 7: 1 }), 7);
    assert.equal(chipDaVez([5, 7], {}), 5);
    assert.equal(chipDaVez([], {}), null);
  });
});

describe('variações de texto', () => {
  test('{a|b|c} vira uma das opções', () => {
    assert.equal(aplicarVariacoes('{Oi|Olá|E aí}, pessoal', () => 0), 'Oi, pessoal');
    assert.equal(aplicarVariacoes('{Oi|Olá|E aí}, pessoal', () => 0.99), 'E aí, pessoal');
  });
  test('chave sem | e {{variável}} ficam intactas', () => {
    assert.equal(aplicarVariacoes('Olá {{nome}}, veja {isto}', () => 0), 'Olá {{nome}}, veja {isto}');
  });
  test('várias no mesmo texto', () => {
    assert.equal(aplicarVariacoes('{a|b} e {c|d}', () => 0.6), 'b e d');
  });
});

describe('clique e utm', () => {
  test('robô de pré-visualização não conta', () => {
    assert.ok(ehRobo('WhatsApp/2.23.20.0'));
    assert.ok(ehRobo('facebookexternalhit/1.1'));
    assert.ok(!ehRobo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'));
  });
  test('utm vira chave de relatório', () => {
    assert.equal(utmLimpo(' Instagram '), 'instagram');
    assert.equal(utmLimpo('Semana 2'), 'semana-2');
    assert.equal(utmLimpo(['a', 'b']), 'a');
    assert.equal(utmLimpo(''), null);
    assert.equal(utmLimpo(undefined), null);
  });
});
