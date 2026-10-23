import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir, vencimento, REGRAS_ENTRADA } from '../src/modules/crm/cadencia-entrada/cadencia-entrada';

const r = REGRAS_ENTRADA[0];
const agora = new Date('2026-10-06T15:00:00Z');
const t = (iso: string) => new Date(iso);
const base = { primeiroContato: null, resposta: null, entrouNaEtapa: null, tarefaPendente: false, criadoEm: new Date('2026-09-20T18:00:00Z') };

test('origens: Clube do Livro (qualquer caixa) e Desafio 52 semanas', () => {
  for (const o of ['Clube do Livro', 'Clube do livro', 'Desafio 52 semanas']) assert.ok(r.origens.test(o), o);
  for (const o of ['importacao', 'whatsapp', 'Leads E-mail']) assert.ok(!r.origens.test(o), o);
});

test('entrada: respondeu → Conexão, tarefa 1 semana depois da RESPOSTA (já acumula)', () => {
  const d = decidir({ ...base, estagioId: 208, primeiroContato: t('2026-10-03T11:00:00Z'), resposta: t('2026-10-04T13:32:00Z') }, r, agora);
  assert.equal(d.mover, 310);
  assert.deepEqual(d.tarefa?.vencimento, t('2026-10-11T12:00:00Z'));
});

test('entrada: sem resposta depois de 24h → Tentativa, tarefa 2 dias depois do contato', () => {
  const d = decidir({ ...base, estagioId: 208, primeiroContato: t('2026-10-04T11:00:00Z') }, r, agora);
  assert.equal(d.mover, 209);
  assert.deepEqual(d.tarefa?.vencimento, t('2026-10-06T12:00:00Z'));
});

test('entrada: contato há menos de 24h → espera', () => {
  assert.deepEqual(decidir({ ...base, estagioId: 208, primeiroContato: t('2026-10-06T01:00:00Z') }, r, agora), {});
});

test('entrada sem nenhum contato: fica, com tarefa de primeiro contato do dia em que entrou', () => {
  const d = decidir({ ...base, estagioId: 208 }, r, agora);
  assert.equal(d.mover, undefined);
  assert.deepEqual(d.tarefa?.vencimento, t('2026-09-20T12:00:00Z'));
  assert.deepEqual(decidir({ ...base, estagioId: 208, tarefaPendente: true }, r, agora), {});
});

test('tentativa: respondeu depois de entrar → Conexão; antes de entrar, não', () => {
  const s = { ...base, estagioId: 209, primeiroContato: t('2026-09-01T11:00:00Z'), entrouNaEtapa: t('2026-09-10T11:00:00Z') };
  assert.equal(decidir({ ...s, resposta: t('2026-10-05T11:00:00Z') }, r, agora).mover, 310);
  const antes = decidir({ ...s, resposta: t('2026-09-02T11:00:00Z') }, r, agora);
  assert.equal(antes.mover, undefined);
  assert.ok(antes.tarefa);
});

test('quem já tem tarefa pendente não ganha outra', () => {
  const d = decidir({ ...base, estagioId: 208, primeiroContato: t('2026-10-03T11:00:00Z'), resposta: t('2026-10-04T13:00:00Z'), tarefaPendente: true }, r, agora);
  assert.equal(d.mover, 310);
  assert.equal(d.tarefa, undefined);
  assert.deepEqual(decidir({ ...base, estagioId: 310, resposta: t('2026-10-04T13:00:00Z'), tarefaPendente: true }, r, agora), {});
});

test('conexão sem tarefa ganha a de 1 semana', () => {
  assert.deepEqual(decidir({ ...base, estagioId: 310, resposta: t('2026-10-01T20:00:00Z') }, r, agora).tarefa?.vencimento, t('2026-10-08T12:00:00Z'));
});

test('vencimento cai às 09:00 de Brasília', () => {
  assert.deepEqual(vencimento(t('2026-10-06T23:30:00Z'), 0), t('2026-10-06T12:00:00Z'));
});
