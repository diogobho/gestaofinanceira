import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximosHorarios } from '../src/modules/grupos/horarios.service';

// #420: fecha no sábado às 18h e abre na segunda às 9h (Brasília).
const regra = { fechar_dias: [6], fechar_hora: '18:00', abrir_dias: [1], abrir_hora: '09:00' };

test('numa quarta, fecha no sábado e abre na segunda seguinte', () => {
  const p = proximosHorarios(regra, new Date('2026-10-14T11:00:00Z')); // qua 08:00 BRT
  assert.equal(p.fechar.toISOString(), '2026-10-17T21:00:00.000Z');
  assert.equal(p.abrir.toISOString(), '2026-10-19T12:00:00.000Z');
});

test('logo depois de fechar, o próximo fechar é o sábado seguinte', () => {
  const p = proximosHorarios(regra, new Date('2026-10-17T21:00:00Z')); // sáb 18:00 BRT em ponto
  assert.equal(p.fechar.toISOString(), '2026-10-24T21:00:00.000Z');
  assert.equal(p.abrir.toISOString(), '2026-10-19T12:00:00.000Z');
});
