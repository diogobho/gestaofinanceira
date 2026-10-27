import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarUtmSource } from '../src/modules/crm/_shared/utm';

/**
 * O `utm_source` chega da barra de endereços da landing, ou seja, de quem quiser.
 * O que ele vira é chave de relatório — e o relatório quebra em dois se a mesma
 * campanha aparecer como "Semana2", "semana 2" e "semana2".
 */
test('normalizarUtmSource', async (t) => {
  await t.test('o caso do dia a dia passa intacto', () => {
    assert.equal(normalizarUtmSource('semana2'), 'semana2');
  });

  await t.test('caixa alta, acento e espaço convergem para a mesma chave', () => {
    assert.equal(normalizarUtmSource('  Semana 3 ÇÃO!! '), 'semana-3-cao');
    assert.equal(normalizarUtmSource('SEMANA2'), 'semana2');
  });

  await t.test('sem utm na URL o lead vai para o balde "outros"', () => {
    for (const vazio of ['', '   ', '!!!', '---']) {
      assert.equal(normalizarUtmSource(vazio), 'outros', JSON.stringify(vazio));
    }
  });

  await t.test('o resultado cabe em leads.origem com o prefixo', () => {
    const utm = normalizarUtmSource('a'.repeat(120));
    assert.equal(utm.length, 30);
    assert.ok(`Caixa Rápido - ${utm}`.length <= 50);
  });

  await t.test('não sobra separador solto na ponta cortada', () => {
    // 30 caracteres cairiam no meio do "-": o corte não pode deixar "semana-".
    assert.equal(normalizarUtmSource(`${'x'.repeat(29)}-semana`), 'x'.repeat(29));
  });
});
