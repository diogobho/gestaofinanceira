/**
 * `reancorarCadencia` (#77): regra pura de quanto os passos seguintes andam depois que
 * um passo sai atrasado. Os cenários do motor usam só base 'entrada'; aqui ficam os
 * outros formatos de cadência que existem em produção.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { reancorarCadencia } from '../src/modules/crm/_shared/agendamento';

const sp = (iso: string) => new Date(`${iso}-03:00`);

describe('reancorarCadencia', () => {
  test('base "anterior": o passo conta o PRÓPRIO atraso a partir do envio real', () => {
    const mover = reancorarCadencia(
      { passo_ordem: 0, atraso_dias: 1 },
      [{ id: 2, passo_ordem: 1, atraso_dias: 2, hora_envio: '10:00', agendado_para: sp('2026-08-20T10:00:00') }],
      [{ base: 'entrada' }, { base: 'anterior' }],
      sp('2026-09-15T11:12:00'),
    );
    assert.deepEqual(mover, [{ id: 2, agendadoPara: sp('2026-09-17T10:00:00') }]);
  });

  test('unidades diferentes (dia → hora) comparam em minutos', () => {
    const mover = reancorarCadencia(
      { passo_ordem: 0, atraso_dias: 1, atraso_unidade: 'dia' },
      [{ id: 2, passo_ordem: 1, atraso_dias: 30, atraso_unidade: 'hora', agendado_para: sp('2026-08-01T00:00:00') }],
      [],
      sp('2026-09-15T11:00:00'),
    );
    // 30h − 24h = 6h depois do envio
    assert.deepEqual(mover, [{ id: 2, agendadoPara: sp('2026-09-15T17:00:00') }]);
  });

  test('data fixa é absoluta: não anda', () => {
    const mover = reancorarCadencia(
      { passo_ordem: 0, atraso_dias: 1 },
      [{ id: 2, passo_ordem: 1, modo: 'data', agendado_para: sp('2026-09-01T09:00:00') }],
      [],
      sp('2026-09-15T11:00:00'),
    );
    assert.deepEqual(mover, []);
  });

  test('nunca puxa para trás um passo que já está mais adiante', () => {
    const mover = reancorarCadencia(
      { passo_ordem: 0, atraso_dias: 1, hora_envio: '09:00' },
      [{ id: 2, passo_ordem: 1, atraso_dias: 2, hora_envio: '09:00', agendado_para: sp('2026-10-01T09:00:00') }],
      [],
      sp('2026-09-15T11:00:00'),
    );
    assert.deepEqual(mover, []);
  });
});
