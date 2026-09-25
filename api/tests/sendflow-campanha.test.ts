import test from 'node:test';
import assert from 'node:assert/strict';
import { campanhaDoEvento, donoPedidoNaUrl } from '../src/modules/crm/_shared/sendflow';

const PADRAO = { origem: 'Desafio 52 semanas', campanha: 'Desafio 52 Semanas' };

test('campanhaDoEvento', async (t) => {
  await t.test('grupo do Club do Livro ganha a origem dos leads já cadastrados', () => {
    assert.deepEqual(
      campanhaDoEvento('Grupos LEADS', 'Club do Livro #1 📚', PADRAO),
      { origem: 'Clube do Livro', campanha: 'Clube do Livro' }
    );
  });

  await t.test('também reconhece pela campanha, sem acento nem caixa', () => {
    assert.equal(campanhaDoEvento('CLUBE DO LIVRO', '', PADRAO).origem, 'Clube do Livro');
  });

  await t.test('os grupos que já chegam continuam no Desafio 52 Semanas', () => {
    for (const grupo of [
      'Desafio 52 Semanas - Vida Próspera',
      '#03 Já é permitido prosperar! ✨',
      'Workshop Gratuito Liberdade Financeira',
    ]) {
      assert.deepEqual(campanhaDoEvento('Grupos LEADS', grupo, PADRAO), PADRAO, grupo);
    }
  });

  await t.test('a origem cabe em leads.origem', () => {
    assert.ok(campanhaDoEvento('', 'livro', PADRAO).origem.length <= 50);
  });
});

test('donoPedidoNaUrl', async (t) => {
  await t.test('lê o id de qualquer um dos nomes aceitos', () => {
    assert.equal(donoPedidoNaUrl({ dono: '45' }), 45);
    assert.equal(donoPedidoNaUrl({ responsavel: '22' }), 22);
    assert.equal(donoPedidoNaUrl({ proprietario: ['56', '1'] }), 56);
  });

  await t.test('sem id válido não inventa dono', () => {
    for (const q of [{}, { dono: '' }, { dono: 'debora' }, { dono: '0' }, { dono: '-3' }, { dono: '4 5' }]) {
      assert.equal(donoPedidoNaUrl(q), null, JSON.stringify(q));
    }
  });
});
