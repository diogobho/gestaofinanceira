import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDaOrigem, modeloDaOrigem, modeloSemNome, temNomeDeVerdade, varianteDoLead } from '../src/jobs/followup/origem';
import { aplicarVariaveisLead } from '../src/modules/crm/_shared/agendamento';

const FRASES = {
  regras: [
    { contem: 'clube do livro', frase: 'no clube do livro' },
    { contem: 'desafio', frase: 'no desafio das 52 semanas' },
  ],
  padrao: 'na Escola de Empreendedorismo',
};

describe('origem do lead nos modelos', () => {
  test('frase pela origem, sem caixa nem acento, e o padrão para as demais', () => {
    assert.equal(fraseDaOrigem(FRASES, 'Clube do livro'), 'no clube do livro');
    assert.equal(fraseDaOrigem(FRASES, 'Desafio 52 semanas'), 'no desafio das 52 semanas');
    assert.equal(fraseDaOrigem(FRASES, 'Caixa Rápido - outros'), 'na Escola de Empreendedorismo');
  });

  test('empresa sem configuração: vazio, que barra o modelo', () => {
    assert.equal(fraseDaOrigem(null, 'Clube do Livro'), '');
  });

  test('abertura escolhida pela origem; sem regra, fica a do passo', () => {
    const m = {
      nome: 'abr_ger_v1',
      variaveis: ['[PrimeiroNome]'],
      por_origem: [{ contem: 'clube do livro', nome: 'abr_liv_v1' }, { contem: 'caixa rapido', nome: 'abr_cr_v1' }],
    };
    assert.equal(modeloDaOrigem(m, 'Clube do Livro').nome, 'abr_liv_v1');
    assert.equal(modeloDaOrigem(m, 'Caixa Rápido - semana2').nome, 'abr_cr_v1');
    assert.equal(modeloDaOrigem(m, 'manual').nome, 'abr_ger_v1');
    assert.equal(modeloDaOrigem({ nome: 'x' }, 'Clube do Livro').nome, 'x');
  });

  test('card sem nome usa a versão sem nome da origem', () => {
    const m = {
      nome: 'abr_ger_v1', variaveis: ['[PrimeiroNome]'],
      por_origem: [
        { contem: 'clube do livro', nome: 'abr_liv_v3', sem_nome: 'abr_liv_v2' },
        { contem: 'workshop', nome: 'abr_wor_v1' },
      ],
    };
    assert.equal(temNomeDeVerdade('5511963658408'), false);
    assert.equal(temNomeDeVerdade(''), false);
    assert.equal(temNomeDeVerdade('Ana Paula'), true);
    const semNome = modeloDaOrigem(m, 'Clube do Livro', false);
    assert.equal(semNome.nome, 'abr_liv_v2');
    assert.deepEqual(semNome.variaveis, []);
    assert.equal(modeloDaOrigem(m, 'Clube do Livro', true).nome, 'abr_liv_v3');
    // sem versão sem nome configurada: segue o modelo com nome
    assert.equal(modeloDaOrigem(m, 'Workshop', false).nome, 'abr_wor_v1');
  });

  test('variáveis do playbook saem dos campos do card', () => {
    const lead = { nome: 'Ana Souza', objetivo: 'faturar 15 mil por mês', desafio: 'organizar o caixa', origem_frase: 'no clube do livro' };
    assert.equal(
      aplicarVariaveisLead('[PrimeiroNome] [Objetivo] / [Desafio] / [OrigemFrase] / [Negocio]', lead),
      'Ana faturar 15 mil por mês / organizar o caixa / no clube do livro / '
    );
  });

  test('A/B: lead par fica com A, ímpar com B, e a mesma escolha em todo passo', () => {
    const m = { nome: 'ten_3a_v1', variaveis: ['[PrimeiroNome]', '[OrigemFrase]'], variante_b: { nome: 'ten_3b_v1', variaveis: ['[PrimeiroNome]', '[OrigemFrase]'] } };
    assert.deepEqual([varianteDoLead(m, 10).variante, varianteDoLead(m, 10).modelo.nome], ['A', 'ten_3a_v1']);
    assert.deepEqual([varianteDoLead(m, 11).variante, varianteDoLead(m, 11).modelo.nome], ['B', 'ten_3b_v1']);
    const c = { nome: 'con_7a_v1', variaveis: ['a', 'b', 'c'], variante_b: { nome: 'con_7b_v1', variaveis: ['a', 'c'] } };
    assert.deepEqual(varianteDoLead(c, 11).modelo.variaveis, ['a', 'c']);
    assert.equal(varianteDoLead({ nome: 'obj_1_v1' }, 11).variante, null);
  });
  test('card sem nome: a versão sem nome da variante certa, e só quando falta o nome', () => {
    const m = {
      nome: 'ten_3a_v3', variaveis: ['[PrimeiroNome]', '[OrigemFrase]'],
      sem_nome: { nome: 'ten_3a_sn', variaveis: ['[OrigemFrase]'] },
      variante_b: { nome: 'ten_3b_v3', sem_nome: { nome: 'ten_3b_sn', variaveis: ['[OrigemFrase]'] } },
    };
    assert.equal(modeloSemNome(varianteDoLead(m, 10).modelo, true).nome, 'ten_3a_v3');
    assert.deepEqual(modeloSemNome(varianteDoLead(m, 10).modelo, false).variaveis, ['[OrigemFrase]']);
    assert.equal(modeloSemNome(varianteDoLead(m, 10).modelo, false).nome, 'ten_3a_sn');
    assert.equal(modeloSemNome(varianteDoLead(m, 11).modelo, false).nome, 'ten_3b_sn');
    assert.equal(modeloSemNome({ nome: 'con_3a_v3' }, false).nome, 'con_3a_v3');
  });
});
