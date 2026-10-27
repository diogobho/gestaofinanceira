import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagsDoLead } from '../src/modules/crm/tags/tags-origem';

test('origem vira a tag com a grafia da regra, sem caixa nem acento', () => {
  assert.deepEqual(tagsDoLead(5, 'indicacao', null), ['Indicação']);
  assert.deepEqual(tagsDoLead(5, 'Indicação', null), ['Indicação']);
  assert.deepEqual(tagsDoLead(5, 'Desafio 52 semanas', ''), ['Desafio 52 Semanas']);
});

test('todas as variações do Caixa Rápido caem numa tag só', () => {
  for (const o of ['Caixa Rápido', 'Caixa Rápido - outros', 'Caixa Rápido - alunas', 'Caixa Rápido - semana2']) {
    assert.deepEqual(tagsDoLead(5, o, null), ['Caixa Rápido']);
  }
});

test('forma de entrada e lançamento não viram tag', () => {
  for (const o of ['importacao', 'planilha', 'planilha-panthers', 'manual', 'whatsapp', 'CRM', 'lancamento', null]) {
    assert.deepEqual(tagsDoLead(5, o, null), []);
  }
});

test('caminho anexado nas notas vira tag a mais', () => {
  const notas =
    'Lead importado.\n' +
    '\n' +
    '[18/09/2026, 10:00:00] Formulário Caixa Rápido\n' +
    'Faturamento hoje: R$ 5k - R$ 10k\n' +
    '\n' +
    '[20/09/2026, 11:00:00] Campanha Comercial - Clube do Livro (SendFlow)\n' +
    'Grupo: Clube do Livro #2';
  assert.deepEqual(tagsDoLead(5, 'Desafio 52 semanas', notas), ['Clube do Livro', 'Desafio 52 Semanas', 'Caixa Rápido']);
  assert.deepEqual(tagsDoLead(5, 'importacao', notas), ['Clube do Livro', 'Caixa Rápido']);
});

test('grupo do SendFlow sem nome de campanha conhecido segue o Desafio, como no webhook', () => {
  const notas = 'Campanha Grupos LEADS (SendFlow)\nGrupo: Desafio 52 Semanas - Vida Próspera';
  assert.deepEqual(tagsDoLead(5, 'manual', notas), ['Desafio 52 Semanas']);
});

test('só a Panteras tem regra', () => {
  assert.deepEqual(tagsDoLead(32, 'indicacao', null), []);
});
