/**
 * Testes da camada de APRESENTAÇÃO dos agendamentos.
 *
 * O que se testa aqui é só derivação pura — dado o registro do banco, qual estado a
 * tela mostra, que plano ela descreve e que ciclo de vida ela monta. Nada de motor:
 * `resolverEstado` não decide envio, só leitura.
 *
 * O frontend não tem runner próprio (nem vitest, nem jest). Em vez de introduzir um
 * framework inteiro para três funções puras, estes testes rodam no `tsx` que a API já
 * tem instalado:
 *
 *   cd frontend && npm test
 *
 * Os imports de `@/types/crm` são `import type` e somem na transpilação, então o alias
 * do Vite não precisa ser resolvido em tempo de execução.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolverEstado, APRESENTACAO, descreverPlano, montarCicloVida } from './followupStatus'

/** Último evento da trilha. Indexação em vez de `Array.at`: o alvo do build
 *  (tsconfig.app) não inclui a lib es2022. */
const ultimo = (c: ReturnType<typeof montarCicloVida>) => c[c.length - 1]

const AGORA = new Date('2026-08-26T12:00:00-03:00')
const base = {
  status: 'pendente' as const,
  agendado_para: '2026-08-27T09:00:00-03:00',
  created_at: '2026-08-20T09:00:00-03:00',
}

describe('resolverEstado — os 7 estados que o operador precisa distinguir', () => {
  test('pendente no futuro é Agendado', () => {
    assert.equal(resolverEstado(base, AGORA), 'agendado')
  })

  test('pendente com horário já passado é Atrasado, não falha', () => {
    const e = resolverEstado({ ...base, agendado_para: '2026-08-25T09:00:00-03:00' }, AGORA)
    assert.equal(e, 'atrasado')
    assert.equal(APRESENTACAO[e].terminal, false, 'atrasado ainda vai sair — não é terminal')
  })

  test('processando é estado próprio (reservado por um ciclo)', () => {
    assert.equal(resolverEstado({ ...base, status: 'processando' }, AGORA), 'processando')
  })

  test('enviado e cancelado são terminais', () => {
    assert.equal(resolverEstado({ ...base, status: 'enviado' }, AGORA), 'enviado')
    assert.equal(resolverEstado({ ...base, status: 'cancelado' }, AGORA), 'cancelado')
    assert.ok(APRESENTACAO.enviado.terminal && APRESENTACAO.cancelado.terminal)
  })

  test('falhou por conflito de configuração NÃO se mistura com falha de envio', () => {
    const conflito = resolverEstado(
      { ...base, status: 'falhou', erro_categoria: 'conflito_config' }, AGORA)
    const falha = resolverEstado(
      { ...base, status: 'falhou', erro_categoria: 'canal_bloqueado' }, AGORA)
    assert.equal(conflito, 'conflito')
    assert.equal(falha, 'falhou')
    assert.notEqual(APRESENTACAO[conflito].rotulo, APRESENTACAO[falha].rotulo)
  })

  test('um enviado com horário passado não vira Atrasado', () => {
    // A ordem dos testes em resolverEstado importa: status terminal vence a data.
    assert.equal(
      resolverEstado({ ...base, status: 'enviado', agendado_para: '2026-08-01T09:00:00-03:00' }, AGORA),
      'enviado'
    )
  })

  test('todo estado tem rótulo, significado e faixa próprios', () => {
    const rotulos = Object.values(APRESENTACAO).map((a) => a.rotulo)
    assert.equal(new Set(rotulos).size, rotulos.length, 'nenhum rótulo repetido')
    for (const [chave, ap] of Object.entries(APRESENTACAO)) {
      assert.ok(ap.significado.length > 10, `${chave} precisa explicar o que aconteceu`)
      // Ver nota de modo escuro em followupStatus.ts: `border` puro é sobrescrito
      // globalmente por html.dark e apagaria a cor do badge no tema escuro.
      assert.ok(ap.badge.includes('border-[1px]'), `${chave} não pode usar a classe 'border'`)
    }
  })
})

describe('descreverPlano — a REGRA por trás da próxima data', () => {
  test('atraso em dias com hora e dias da semana', () => {
    assert.equal(
      descreverPlano({ modo: 'dias', atraso_dias: 3, atraso_unidade: 'dia', hora_envio: '09:00', dias_semana: [1, 2, 3, 4, 5] }),
      'Após 3 dias, às 09:00, somente seg, ter, qua, qui, sex'
    )
  })

  test('singular e plural', () => {
    assert.match(descreverPlano({ modo: 'dias', atraso_dias: 1, atraso_unidade: 'dia' }), /Após 1 dia$/)
    assert.match(descreverPlano({ modo: 'dias', atraso_dias: 2, atraso_unidade: 'hora' }), /Após 2 horas$/)
  })

  test('zero é envio imediato na entrada, não "após 0 dias"', () => {
    assert.match(descreverPlano({ modo: 'dias', atraso_dias: 0 }), /^Imediatamente na entrada/)
  })

  test('data fixa aparece em pt-BR', () => {
    assert.match(descreverPlano({ modo: 'data', data_fixa: '2026-09-15', hora_envio: '14:30' }),
      /Na data fixa 15\/09\/2026, às 14:30/)
  })

  test('todos os sete dias não vira ruído na tela', () => {
    assert.ok(!descreverPlano({ modo: 'dias', atraso_dias: 1, dias_semana: [0, 1, 2, 3, 4, 5, 6] }).includes('somente'))
  })
})

describe('montarCicloVida — o que aconteceu com ESTE agendamento', () => {
  test('caminho feliz: criado → aguardando', () => {
    const c = montarCicloVida({ ...base, updated_at: base.created_at })
    assert.deepEqual(c.map((e) => e.rotulo), ['Criado', 'Aguardando envio'])
  })

  test('criado → tentativas → enviado', () => {
    const c = montarCicloVida({
      ...base, status: 'enviado', tentativas: 2,
      enviado_at: '2026-08-26T09:05:00-03:00', updated_at: '2026-08-26T09:05:00-03:00',
    })
    assert.deepEqual(c.map((e) => e.rotulo), ['Criado', '2 tentativas sem sucesso', 'Enviado'])
    assert.equal(c[2].tom, 'ok')
  })

  test('teto de tentativas é dito com todas as letras', () => {
    const c = montarCicloVida({
      ...base, status: 'falhou', tentativas: 8,
      erro: 'Instância seguiu indisponível. Encerrado após 8 tentativas. Último erro: 503',
      erro_categoria: 'canal_indefinido', updated_at: '2026-08-26T09:00:00-03:00',
    })
    assert.match(c[1].detalhe!, /limite de tentativas foi atingido/)
    assert.equal(c[2].tom, 'erro')
  })

  test('cancelamento do usuário mostra o motivo digitado', () => {
    const c = montarCicloVida({
      ...base, status: 'cancelado', erro_categoria: 'cancelado_usuario',
      erro: 'lead já respondeu por outro canal', updated_at: '2026-08-26T10:00:00-03:00',
    })
    assert.match(ultimo(c).detalhe!, /lead já respondeu por outro canal/)
  })

  test('cancelamento SEM categoria não inventa autoria', () => {
    // Cadência encerrada por mudança de estágio cai aqui. Dizer "cancelado por um
    // usuário" seria afirmar algo que o banco não registra.
    const c = montarCicloVida({ ...base, status: 'cancelado', updated_at: '2026-08-26T10:00:00-03:00' })
    const detalhe = ultimo(c).detalhe!
    assert.ok(!/usuário/i.test(detalhe), 'não pode atribuir a um usuário')
    assert.match(detalhe, /mudou de estágio/)
  })

  test('lead arquivado é explicado, não some', () => {
    const c = montarCicloVida({
      ...base, status: 'cancelado', erro_categoria: 'lead_arquivado',
      updated_at: '2026-08-26T10:00:00-03:00',
    })
    assert.match(ultimo(c).detalhe!, /arquivado/)
  })

  test('processando mostra a reserva do ciclo', () => {
    const c = montarCicloVida({
      ...base, status: 'processando', claim_at: '2026-08-26T12:00:00-03:00',
      updated_at: '2026-08-26T12:00:00-03:00',
    })
    assert.equal(ultimo(c).rotulo, 'Reservado pelo motor')
    assert.match(ultimo(c).detalhe!, /volta para a fila/)
  })
})
