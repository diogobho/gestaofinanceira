/**
 * Capacidades por plano. Três coisas precisam ficar presas por teste, porque as
 * três já quebraram produtos parecidos antes:
 *
 *  1. o catálogo e a migration têm que falar a MESMA língua — chave escrita
 *     errada num dos dois lados vira capacidade que nunca existe, e o efeito é
 *     um botão que some sem ninguém entender por quê;
 *  2. o Enterprise tem que conter o Profissional, que tem que conter o Starter:
 *     plano de cima com menos que o de baixo é o tipo de erro que só aparece no
 *     cliente que fez upgrade e perdeu tela;
 *  3. a lista do banco é DADO — pode vir com lixo, chave antiga ou não ser uma
 *     lista. Nada disso pode virar capacidade concedida.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO, ehCapacidade, recusa, type Capacidade } from '../src/shared/capacidades';

const MIGRATIONS = join(__dirname, '..', 'migrations');

/**
 * As listas que as migrations gravam, por plano (id → chaves). A 081 criou as três;
 * migration posterior que regrava um plano (a 089 deu `grupos_campanhas` ao
 * Enterprise) vence, na ordem dos arquivos — é o estado que o banco tem.
 */
function capacidadesDaMigration(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /UPDATE planos SET capacidades = '(\[[\s\S]*?\])'::jsonb WHERE id = (\d+);/g;
  for (const arquivo of readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) {
    const sql = readFileSync(join(MIGRATIONS, arquivo), 'utf8');
    for (const m of sql.matchAll(re)) out[m[2]] = JSON.parse(m[1]);
  }
  return out;
}

describe('catálogo × migration', () => {
  test('a migration grava as três listas', () => {
    const m = capacidadesDaMigration();
    assert.deepEqual(Object.keys(m).sort(), ['1', '2', '3']);
  });

  test('toda chave da migration existe no catálogo', () => {
    for (const [plano, chaves] of Object.entries(capacidadesDaMigration())) {
      for (const c of chaves) {
        assert.ok(ehCapacidade(c), `plano ${plano}: "${c}" não está no CATALOGO`);
      }
    }
  });

  test('toda capacidade do catálogo é concedida por algum plano', () => {
    const todas = new Set(Object.values(capacidadesDaMigration()).flat());
    for (const c of Object.keys(CATALOGO)) {
      assert.ok(todas.has(c), `"${c}" está no catálogo e nenhum plano a inclui`);
    }
  });

  test('o plano mínimo do catálogo bate com quem realmente a concede', () => {
    const m = capacidadesDaMigration();
    const porPlano: Record<string, Set<string>> = {
      Starter: new Set(m['1']), Profissional: new Set(m['2']), Enterprise: new Set(m['3']),
    };
    for (const [chave, item] of Object.entries(CATALOGO)) {
      assert.ok(porPlano[item.planoMinimo].has(chave),
        `"${chave}" diz ser de ${item.planoMinimo}, mas esse plano não a inclui`);
      if (item.planoMinimo === 'Enterprise') {
        assert.ok(!porPlano.Profissional.has(chave), `"${chave}" deveria ser só do Enterprise`);
      }
      if (item.planoMinimo === 'Profissional') {
        assert.ok(!porPlano.Starter.has(chave), `"${chave}" deveria começar no Profissional`);
      }
    }
  });
});

describe('a escada dos planos', () => {
  test('cada plano contém o anterior', () => {
    const m = capacidadesDaMigration();
    for (const c of m['1']) assert.ok(m['2'].includes(c), `Profissional não tem "${c}" do Starter`);
    for (const c of m['2']) assert.ok(m['3'].includes(c), `Enterprise não tem "${c}" do Profissional`);
  });

  test('o que separa Profissional de Enterprise é quem fala primeiro', () => {
    const m = capacidadesDaMigration();
    const so3 = m['3'].filter((c) => !m['2'].includes(c)).sort();
    // `grupos_campanhas` (089) entra aqui por produto, não por risco: é o que substitui
    // o SendFlow para quem já paga por ele, e o básico de grupos segue no Profissional.
    assert.deepEqual(so3, [
      'agente_proativo', 'conversa_fria', 'disparo_whatsapp', 'grupos_campanhas',
      'modelos_meta', 'smtp_proprio', 'whatsapp_oficial',
    ]);
  });

  test('o Starter não tem CRM nem WhatsApp', () => {
    const starter = capacidadesDaMigration()['1'];
    for (const c of ['crm', 'whatsapp_qr', 'whatsapp_oficial', 'disparo_whatsapp', 'conversa_fria']) {
      assert.ok(!starter.includes(c), `Starter não deveria ter "${c}"`);
    }
  });
});

describe('ehCapacidade', () => {
  test('aceita só chave do catálogo', () => {
    assert.ok(ehCapacidade('disparo_whatsapp'));
    assert.ok(!ehCapacidade('disparo'));
    assert.ok(!ehCapacidade(''));
    assert.ok(!ehCapacidade(null));
    assert.ok(!ehCapacidade(42));
  });

  test('herança do Object não vira capacidade', () => {
    // `'constructor' in {}` é true — `hasOwnProperty` é o que salva aqui, o mesmo
    // cuidado de `normalizarOrdem` com a lista branca do ORDER BY.
    for (const v of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.ok(!ehCapacidade(v), `"${v}" não é capacidade`);
    }
  });
});

describe('recusa', () => {
  test('carrega o que a tela precisa para oferecer o upgrade', () => {
    const r = recusa('disparo_whatsapp' as Capacidade);
    assert.equal(r.code, 'PLANO_SEM_CAPACIDADE');
    assert.equal(r.capacidade, 'disparo_whatsapp');
    assert.equal(r.plano_minimo, 'Enterprise');
    assert.ok(r.message.length > 20, 'o motivo vai direto para a tela');
  });

  test('todo item do catálogo tem motivo escrito para o cliente', () => {
    for (const [chave, item] of Object.entries(CATALOGO)) {
      assert.ok(item.rotulo.length > 2, `"${chave}" sem rótulo`);
      assert.ok(item.motivo.length > 20, `"${chave}" sem motivo legível`);
    }
  });
});
