/**
 * Criação de modelo pelo cliente (cabeçalho, rodapé e botões).
 *
 * A Meta recusa quase tudo com "Invalid parameter", sem dizer qual. O que fica
 * preso aqui é a frase certa ANTES da chamada e o formato que ela aceita:
 *
 *  1. limites de cabeçalho/rodapé/botões barrados com o motivo;
 *  2. resposta rápida antes dos botões de ação — a Meta exige os grupos separados;
 *  3. exemplo obrigatório para variável de cabeçalho e de corpo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  problemaNoTemplate,
  componentesDoTemplate,
  NovoTemplate,
} from '../src/modules/whatsapp/meta/meta-whatsapp.service';

const base: NovoTemplate = { nome: 'promo_setembro', categoria: 'MARKETING', idioma: 'pt_BR', corpo: 'Oi {{1}}, tudo bem?' };

describe('problemaNoTemplate', () => {
  test('modelo simples passa', () => {
    assert.equal(problemaNoTemplate(base), null);
  });

  test('nome com maiúscula ou espaço é recusado', () => {
    assert.match(problemaNoTemplate({ ...base, nome: 'Promo Setembro' }) ?? '', /minúsculas/);
  });

  test('cabeçalho com variável exige exemplo, e só aceita uma', () => {
    assert.match(problemaNoTemplate({ ...base, cabecalho: 'Oi {{1}}' }) ?? '', /exemplo/);
    assert.equal(problemaNoTemplate({ ...base, cabecalho: 'Oi {{1}}', exemploCabecalho: 'Ana' }), null);
    assert.match(problemaNoTemplate({ ...base, cabecalho: '{{1}} e {{2}}', exemploCabecalho: 'x' }) ?? '', /uma variável/);
  });

  test('rodapé não aceita variável nem passa de 60', () => {
    assert.match(problemaNoTemplate({ ...base, rodape: 'Tchau {{1}}' }) ?? '', /variável/);
    assert.match(problemaNoTemplate({ ...base, rodape: 'x'.repeat(61) }) ?? '', /60/);
  });

  test('botões: texto até 25, link https fixo, telefone com DDI, tetos por tipo', () => {
    assert.match(problemaNoTemplate({ ...base, botoes: [{ tipo: 'QUICK_REPLY', texto: 'x'.repeat(26) }] }) ?? '', /25/);
    assert.match(problemaNoTemplate({ ...base, botoes: [{ tipo: 'URL', texto: 'Site', url: 'http://a.com' }] }) ?? '', /https/);
    assert.match(
      problemaNoTemplate({ ...base, botoes: [{ tipo: 'URL', texto: 'Site', url: 'https://a.com/{{1}}' }] }) ?? '',
      /variável/
    );
    assert.match(
      problemaNoTemplate({ ...base, botoes: [{ tipo: 'PHONE_NUMBER', texto: 'Ligar', telefone: '11999999999' }] }) ?? '',
      /DDI/
    );
    const tresLinks = Array.from({ length: 3 }, () => ({ tipo: 'URL' as const, texto: 'Site', url: 'https://a.com' }));
    assert.match(problemaNoTemplate({ ...base, botoes: tresLinks }) ?? '', /2 botões de link/);
  });
});

describe('componentesDoTemplate', () => {
  test('monta cabeçalho, corpo com exemplo, rodapé e botões na ordem da Meta', () => {
    const comps = componentesDoTemplate(
      {
        ...base,
        cabecalho: 'Novidade para {{1}}',
        exemploCabecalho: 'Ana',
        rodape: 'Responda SAIR para não receber',
        botoes: [
          { tipo: 'URL', texto: 'Ver site', url: 'https://duofuturo.tech' },
          { tipo: 'QUICK_REPLY', texto: 'Parar promoções' },
          { tipo: 'PHONE_NUMBER', texto: 'Ligar', telefone: '+5511999999999' },
        ],
      },
      ['Ana']
    );
    assert.deepEqual(
      comps.map((c) => c.type),
      ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']
    );
    assert.deepEqual(comps[0].example, { header_text: ['Ana'] });
    assert.deepEqual(comps[1].example, { body_text: [['Ana']] });
    assert.deepEqual(
      comps[3].buttons.map((b: any) => b.type),
      ['QUICK_REPLY', 'URL', 'PHONE_NUMBER']
    );
    assert.equal(comps[3].buttons[2].phone_number, '+5511999999999');
  });

  test('sem extras sai só o corpo', () => {
    const comps = componentesDoTemplate({ ...base, corpo: 'Olá!' }, []);
    assert.deepEqual(comps, [{ type: 'BODY', text: 'Olá!' }]);
  });
});

// Os modelos prontos da tela (frontend) têm que passar pelo mesmo crivo: um deles
// editado de um jeito que a Meta recusa chegaria ao cliente como "Invalid parameter".
import { MODELOS_PRONTOS } from '../../frontend/src/pages/whatsapp/oficial/modelosProntos';

describe('modelos prontos da tela', () => {
  for (const { modelo } of MODELOS_PRONTOS) {
    test(`${modelo.nome} passa na conferência`, () => {
      assert.equal(problemaNoTemplate({ ...modelo, idioma: 'pt_BR', botoes: [] }), null);
      assert.match(modelo.nome, /^[a-z0-9_]+$/);
    });
  }
  test('nomes não se repetem', () => {
    const nomes = MODELOS_PRONTOS.map((m) => m.modelo.nome);
    assert.equal(new Set(nomes).size, nomes.length);
  });
});
