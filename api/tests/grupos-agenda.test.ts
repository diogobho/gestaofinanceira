/**
 * Página de Grupos: a recorrência em Brasília e a boas-vindas agrupada.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { proximaRecorrencia, montarBoasVindas, juntarNomes, horaValida, diasValidos } from '../src/modules/grupos/agenda';

describe('recorrência', () => {
  // Segunda, 28/09/2026, 10:00 em Brasília = 13:00Z
  const segunda10h = new Date('2026-09-28T13:00:00Z');

  test('mais tarde no mesmo dia', () => {
    assert.equal(proximaRecorrencia([1], '18:30', segunda10h).toISOString(), '2026-09-28T21:30:00.000Z');
  });

  test('horário que já passou hoje vai para a próxima semana', () => {
    assert.equal(proximaRecorrencia([1], '09:00', segunda10h).toISOString(), '2026-10-05T12:00:00.000Z');
  });

  test('próximo dia da lista', () => {
    assert.equal(proximaRecorrencia([3, 5], '09:00', segunda10h).toISOString(), '2026-09-30T12:00:00.000Z');
  });

  test('o dia é o de Brasília: 22h de domingo em Brasília já é segunda em UTC', () => {
    const domingo22h = new Date('2026-09-28T01:00:00Z'); // 27/09 22:00 BRT
    assert.equal(proximaRecorrencia([0], '23:00', domingo22h).toISOString(), '2026-09-28T02:00:00.000Z');
  });

  test('exatamente no horário não repete o mesmo instante', () => {
    assert.equal(proximaRecorrencia([1], '10:00', segunda10h).toISOString(), '2026-10-05T13:00:00.000Z');
  });

  test('validações', () => {
    assert.equal(horaValida('09:05'), true);
    assert.equal(horaValida('24:00'), false);
    assert.equal(diasValidos([0, 6]), true);
    assert.equal(diasValidos([]), false);
    assert.equal(diasValidos([7]), false);
  });
});

describe('boas-vindas', () => {
  const ana = { jid: '5511999990001@s.whatsapp.net', nome: 'Ana Souza' };
  const bia = { jid: '5511999990002@s.whatsapp.net', nome: null };

  test('nomes em português', () => {
    assert.equal(juntarNomes(['Ana', 'Bia', 'Carla']), 'Ana, Bia e Carla');
  });

  test('uma mensagem para todos, marcando cada um', () => {
    const r = montarBoasVindas('Bem-vindos ao {{nome_grupo}}, {{primeiro_nome}}!', [ana, bia], 'Desafio', true);
    assert.deepEqual(r.mencoes, [ana.jid, bia.jid]);
    assert.ok(r.texto.includes('@5511999990001') && r.texto.includes('@5511999990002'));
    assert.match(r.texto, /Bem-vindos ao Desafio, Ana e @5511999990002!/);
  });

  test('{{mencoes}} decide onde as menções entram', () => {
    const r = montarBoasVindas('Oi {{mencoes}}!', [ana], null, true);
    assert.equal(r.texto, 'Oi @5511999990001!');
  });

  test('sem marcar, nada de @ e ninguém em mentions', () => {
    const r = montarBoasVindas('Oi {{nome}} {{mencoes}}', [ana], null, false);
    assert.equal(r.texto, 'Oi Ana Souza');
    assert.deepEqual(r.mencoes, []);
  });
});
