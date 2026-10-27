import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTarefasEntrada, vencimentoDaTarefa } from '../src/modules/crm/leads/tarefas-estagio';

describe('tarefas ao entrar no estágio', () => {
  test('sem título cai; tipo reunião e prioridade inválida voltam ao padrão', () => {
    const r = normalizarTarefasEntrada([
      { titulo: '  ' },
      { titulo: 'Convidar', tipo: 'reuniao', prioridade: 'maxima', prazo: '2', hora: 'x' },
    ]);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0], {
      titulo: 'Convidar', descricao: null, tipo: 'follow_up', prioridade: 'normal', prazo: 2, unidade: 'dia', hora: '09:00',
    });
  });

  test('prazo em dias pula o fim de semana e vence no horário de Brasília', () => {
    // sexta 16/10/2026 15h BRT + 1 dia útil → segunda 19/10 09h BRT (12h UTC)
    const v = vencimentoDaTarefa({ titulo: 't', prazo: 1, unidade: 'dia', hora: '09:00' }, new Date('2026-10-16T18:00:00Z'));
    assert.equal(v, '2026-10-19T12:00:00.000Z');
  });

  test('prazo em horas é o instante exato', () => {
    const v = vencimentoDaTarefa({ titulo: 't', prazo: 2, unidade: 'hora' }, new Date('2026-10-13T15:00:00Z'));
    assert.equal(v, '2026-10-13T17:00:00.000Z');
  });
});
