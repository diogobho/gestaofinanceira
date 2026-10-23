import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcosDoFunil, mesCorrente, umIndicadorPorCard } from '../src/modules/crm/dashboard/produtividade';

const escola = [
  { id: 208, nome: 'Entrada de Leads', is_ganho: false },
  { id: 211, nome: 'Reunião agendada', is_ganho: false },
  { id: 212, nome: 'Reunião Realizada', is_ganho: false },
  { id: 232, nome: 'Objeção', is_ganho: false },
  { id: 233, nome: 'Fechamento', is_ganho: false },
  { id: 234, nome: 'Ganho', is_ganho: true },
  { id: 235, nome: 'Perda', is_ganho: false, is_perdido: true },
];

test('etapas do funil Escola: oferta = realizada + objeção + fechamento', () => {
  assert.deepEqual(marcosDoFunil(escola), {
    agendada: [211], realizada: [212], oferta: [212, 232, 233], venda: [234], perda: [235],
  });
});

test('nome sem acento e com outra caixa também casa', () => {
  const m = marcosDoFunil([{ id: 1, nome: 'REUNIAO AGENDADA', is_ganho: false }, { id: 2, nome: 'Objecao', is_ganho: false }]);
  assert.deepEqual(m.agendada, [1]);
  assert.deepEqual(m.oferta, [2]);
});

test('funil sem as etapas devolve listas vazias', () => {
  assert.deepEqual(marcosDoFunil([{ id: 9, nome: 'Novo', is_ganho: false }]), { agendada: [], realizada: [], oferta: [], venda: [], perda: [] });
});

test('mês corrente é o de Brasília, não o de UTC', () => {
  // 01/10 02:00 UTC ainda é 30/09 23:00 em Brasília
  assert.deepEqual(mesCorrente(new Date('2026-10-01T02:00:00Z')), { inicio: '2026-09-01', fim: '2026-09-30' });
  assert.deepEqual(mesCorrente(new Date('2026-02-10T12:00:00Z')), { inicio: '2026-02-01', fim: '2026-02-28' });
});

test('um card, um indicador: fica só no mais avançado que alcançou', () => {
  const reg: Record<string, Set<number>> = {
    contatos_novos: new Set([1, 2, 3]),
    retornos: new Set([1, 3]),
    fup_leads: new Set([3, 4, 5, 6]),
    fup_responderam: new Set([4, 5]),
    perdas: new Set([6]),
    reunioes_agendadas: new Set([7]),
    reunioes_realizadas: new Set([5, 8]),
    ofertas: new Set([5, 8]),
    vendas: new Set([8]),
  };
  umIndicadorPorCard(reg);
  const lista = (k: string) => [...reg[k]].sort();
  assert.deepEqual(lista('contatos_novos'), [1, 2]);     // 3 virou FUP
  assert.deepEqual(lista('retornos'), [1]);
  assert.deepEqual(lista('fup_leads'), [3, 4]);          // 5 virou oferta, 6 perda
  assert.deepEqual(lista('fup_responderam'), [4]);
  assert.deepEqual(lista('perdas'), [6]);
  assert.deepEqual(lista('reunioes_agendadas'), [7]);
  assert.deepEqual(lista('ofertas'), [5]);               // 8 virou venda
  assert.deepEqual(lista('reunioes_realizadas'), [5]);
  assert.deepEqual(lista('vendas'), [8]);
  // Os grupos somam o total de cards, sem repetir.
  const soma = ['contatos_novos', 'fup_leads', 'perdas', 'reunioes_agendadas', 'ofertas', 'vendas'].reduce((n, k) => n + reg[k].size, 0);
  assert.equal(soma, 8);
});
