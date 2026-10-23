import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBoasVindas } from '../src/modules/grupos/agenda';
import { horaDeBrasilia, JANELA_PRIVADO, TETO_PRIVADO_POR_CHIP_DIA } from '../src/modules/grupos/grupos.service';

test('no privado a mensagem é da pessoa, sem @ nem menção', () => {
  const { texto, mencoes } = montarBoasVindas(
    'Oi {{primeiro_nome}}, bem-vinda ao {{nome_grupo}}! {{mencoes}}',
    [{ jid: '5511999998888@s.whatsapp.net', nome: 'Ana Souza' }], 'Desafio', false
  );
  assert.equal(texto, 'Oi Ana, bem-vinda ao Desafio!');
  assert.deepEqual(mencoes, []);
});

test('no privado, sem nome, a frase perde o nome em vez de virar "pessoal" (#322)', () => {
  const sem = (modelo: string) =>
    montarBoasVindas(modelo, [{ jid: '5511999998888@s.whatsapp.net', nome: null }], 'Clube', false, true).texto;
  assert.equal(sem('Olá {{primeiro_nome}}, Como você está?💫'), 'Olá, Como você está?💫');
  assert.equal(sem('Seja bem-vindo ao *{{nome_grupo}}*, {{primeiro_nome}}! 👋'), 'Seja bem-vindo ao *Clube*! 👋');
  assert.equal(sem('{{nome}}, que bom te ver'), 'que bom te ver');
  // No grupo continua "pessoal".
  assert.equal(
    montarBoasVindas('Olá {{primeiro_nome}}!', [{ jid: '5511999998888@s.whatsapp.net', nome: null }], 'Clube', false).texto,
    'Olá pessoal!'
  );
});

test('hora de Brasília decide a janela do privado', () => {
  assert.equal(horaDeBrasilia(new Date('2026-09-30T10:59:00Z')), 7);  // 07:59 BRT: fora
  assert.equal(horaDeBrasilia(new Date('2026-09-30T11:00:00Z')), 8);  // 08:00 BRT: dentro
  assert.equal(horaDeBrasilia(new Date('2026-10-01T00:30:00Z')), 21); // 21:30 BRT: fora
  assert.deepEqual([...JANELA_PRIVADO], [8, 21]);
  assert.equal(TETO_PRIVADO_POR_CHIP_DIA, 40);
});
