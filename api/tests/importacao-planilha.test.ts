/**
 * Importação de leads: o que a planilha do cliente diz tem que chegar ao card.
 *
 * Os dois casos vieram da Anchor (empresa 38, chamados #175/#176, 22/09/2026):
 * 873 leads importados com a origem trocada por "importacao" e 21 nomes com o
 * acento quebrado ("MENDONÃ\u0087A") — o CSV era UTF-8 e foi lido como Latin-1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { lerPlanilha, normalizarOrigem } from '../src/modules/crm/importacao/importacao.service';

const linhas = (wb: XLSX.WorkBook) => XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];

test('lerPlanilha', async (t) => {
  const csv = 'nome,telefone,origem\nJULLIETH MENDONÇA,11987654321,Diagnóstico\n';

  await t.test('CSV UTF-8 (o que o Excel e o Google Planilhas exportam) mantém o acento', () => {
    const [l] = linhas(lerPlanilha(Buffer.from(csv, 'utf-8')));
    assert.equal(l.nome, 'JULLIETH MENDONÇA');
    assert.equal(l.origem, 'Diagnóstico');
  });

  await t.test('CSV UTF-8 com BOM não gruda o BOM no nome da primeira coluna', () => {
    const [l] = linhas(lerPlanilha(Buffer.from('﻿' + csv, 'utf-8')));
    assert.equal(l.nome, 'JULLIETH MENDONÇA');
  });

  await t.test('CSV Latin-1 (o antigo do Excel no Windows) também chega certo', () => {
    const [l] = linhas(lerPlanilha(Buffer.from(csv, 'latin1')));
    assert.equal(l.nome, 'JULLIETH MENDONÇA');
  });

  await t.test('xlsx segue pelo caminho binário', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['nome', 'origem'], ['Ângela', 'Evento']]), 'A');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const [l] = linhas(lerPlanilha(buf));
    assert.equal(l.nome, 'Ângela');
  });
});

test('normalizarOrigem', async (t) => {
  await t.test('vazio é "importacao"', () => {
    assert.equal(normalizarOrigem(''), 'importacao');
    assert.equal(normalizarOrigem(null), 'importacao');
    assert.equal(normalizarOrigem('   '), 'importacao');
  });

  await t.test('chave conhecida vira a chave, com qualquer caixa ou acento', () => {
    assert.equal(normalizarOrigem('Instagram'), 'instagram');
    assert.equal(normalizarOrigem('Indicação'), 'indicacao');
  });

  await t.test('origem do cliente fica como ele escreveu — era trocada por "importacao"', () => {
    assert.equal(normalizarOrigem('  Evento   Maio '), 'Evento Maio');
  });

  await t.test('nome já no catálogo da empresa usa a grafia do catálogo', () => {
    assert.equal(normalizarOrigem('caixa rapido', ['Caixa Rápido']), 'Caixa Rápido');
  });

  await t.test('cabe em leads.origem (VARCHAR 50)', () => {
    assert.equal(normalizarOrigem('x'.repeat(80)).length, 50);
  });
});
