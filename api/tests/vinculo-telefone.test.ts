/**
 * O guard de vínculo lead ↔ contato: para onde a mensagem REALMENTE vai.
 *
 * Casos tirados da base de produção da Panteras (empresa 5), porque o custo de
 * errar aqui é dos dois lados: apertar demais bloqueia a operação inteira
 * (2.690 vínculos legítimos diferem por 9º dígito ou DDI 55), e afrouxar deixa
 * a mensagem sair para um número que não existe — os tickets #44 e #45.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  vinculoDivergente,
  divergenciaApenasNoPrefixo,
} from '../src/modules/crm/_shared/telefone';

describe('vinculoDivergente — bloqueia o destino errado', () => {
  test('DDI de Portugal grudado num número brasileiro (ticket #44)', () => {
    assert.equal(vinculoDivergente('555191070326', '3515191070326', '3515191070326@c.us'), true);
  });

  test('DDD trocado: 21 gravado como 55 (ticket #45)', () => {
    assert.equal(vinculoDivergente('5521973587656', '5555973587656', '5555973587656@c.us'), true);
  });

  test('DDD diferente entre card e conversa (41 contra 49)', () => {
    assert.equal(vinculoDivergente('554191755733', '554991755733', '554991755733@c.us'), true);
  });

  test('conversa de outra pessoa — nada em comum', () => {
    assert.equal(vinculoDivergente('55991474311', '5521997461155', '5521997461155@c.us'), true);
  });
});

describe('vinculoDivergente — NÃO atrapalha o que é o mesmo número', () => {
  test('9º dígito presente de um lado só', () => {
    assert.equal(vinculoDivergente('5551999618218', '555199618218', '555199618218@c.us'), false);
  });

  test('DDI 55 ausente no card (cadastro por importação)', () => {
    assert.equal(vinculoDivergente('11969693585', '5511969693585', '5511969693585@c.us'), false);
  });

  test('DDI 55 sobrando na frente de número que já tinha o seu', () => {
    assert.equal(vinculoDivergente('5513016139577', '13016139577', '13016139577@c.us'), false);
    assert.equal(vinculoDivergente('5531994770550', '555531994770550', '555531994770550@c.us'), false);
    assert.equal(vinculoDivergente('555511976809759', '5511976809759', '5511976809759@c.us'), false);
  });

  test('estrangeiro idêntico dos dois lados', () => {
    assert.equal(vinculoDivergente('351912920338', '351912920338', '351912920338@c.us'), false);
  });

  test('@lid e @g.us não carregam telefone: nada a comparar', () => {
    assert.equal(vinculoDivergente('5521973587656', '351932639568', '257303068565712@lid'), false);
    assert.equal(vinculoDivergente('5521973587656', '120363000000', '120363000000@g.us'), false);
  });

  test('número incompleto ou lixo: a resposta é "não sei", e não sei não bloqueia', () => {
    assert.equal(vinculoDivergente('', '5521973587656', '5521973587656@c.us'), false);
    assert.equal(vinculoDivergente('123', '5521973587656', '5521973587656@c.us'), false);
    assert.equal(vinculoDivergente('5521973587656', null, null), false);
  });
});

describe('divergenciaApenasNoPrefixo — gradua a isenção por resposta recebida', () => {
  test('mesmo assinante, começo do número errado: uma resposta pode isentar', () => {
    assert.equal(divergenciaApenasNoPrefixo('555191070326', '3515191070326'), true);
    assert.equal(divergenciaApenasNoPrefixo('5521973587656', '5555973587656'), true);
  });

  test('outra pessoa: nem resposta isenta', () => {
    assert.equal(divergenciaApenasNoPrefixo('55991474311', '5521997461155'), false);
    assert.equal(divergenciaApenasNoPrefixo('21969959229', '5511961881492'), false);
  });
});
