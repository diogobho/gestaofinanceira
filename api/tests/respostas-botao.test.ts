import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherRegra, problemaNasRegras, dataDaqui, type RegraResposta } from '../src/modules/crm/respostas-botao/regras';

const r = (origem: string | null, botao: string, extra: Partial<RegraResposta> = {}): RegraResposta & { id: number } =>
  ({ id: Math.random(), origem, botao, passos: [{ texto: 'x' }], tarefa_dias: 3, ativa: true, ...extra });

test('o fluxo da Panteras: origem + botão escolhem a sequência', () => {
  const regras = [
    r('Clube do Livro', 'Ainda não', { id: 1 } as any), r('Clube do Livro', 'Sim, conheço', { id: 2 } as any),
    r('Desafio 52 semanas', 'Ainda não', { id: 3 } as any), r('Desafio 52 semanas', 'Sim, conheço', { id: 4 } as any),
  ];
  assert.equal(escolherRegra(regras, 'Clube do Livro', 'Ainda não')?.id, 1);
  assert.equal(escolherRegra(regras, 'Desafio 52 semanas', 'Sim, conheço')?.id, 4);
  assert.equal(escolherRegra(regras, 'Workshop Liberdade Financeira', 'Ainda não'), null);
});

test('botão e origem comparam sem caixa, acento nem espaço sobrando', () => {
  const regras = [r('Desafio 52 Semanas', 'Sim, conheço')];
  assert.ok(escolherRegra(regras, 'desafio 52 semanas', ' SIM,  CONHECO '));
});

test('regra com origem vence a genérica; a genérica cobre as outras origens', () => {
  const geral = { ...r(null, 'Ainda não'), id: 10 };
  const livro = { ...r('Clube do Livro', 'Ainda não'), id: 11 };
  assert.equal(escolherRegra([geral, livro], 'Clube do Livro', 'Ainda não')?.id, 11);
  assert.equal(escolherRegra([geral, livro], 'Workshop', 'Ainda não')?.id, 10);
});

test('regra desligada não dispara', () => {
  assert.equal(escolherRegra([r(null, 'Sim', { ativa: false })], null, 'Sim'), null);
});

test('validação: botão vazio, duplicata e mensagem vazia são recusados', () => {
  assert.match(problemaNasRegras([r(null, '  ')])!, /texto do botão/);
  assert.match(problemaNasRegras([r('A', 'Sim'), r('a', 'sim')])!, /mesmo botão/);
  assert.match(problemaNasRegras([r(null, 'Sim', { passos: [{ texto: ' ' }] })])!, /texto ou anexe/);
  assert.match(problemaNasRegras([r(null, 'Sim', { passos: [], tarefa_dias: null })])!, /ao menos uma/);
  assert.match(problemaNasRegras([r(null, 'Sim', { passos: [{ media_url: 'http://fora/x.mp3' }] })])!, /anexo inválido/);
  assert.equal(problemaNasRegras([r(null, 'Sim', { passos: [{ media_url: '/uploads/followups/5/a.m4a', media_mimetype: 'audio/mp4' }] })]), null);
});

test('a tarefa vence no dia de Brasília, não no de UTC', () => {
  // 01/10 23:30 em Brasília = 02/10 02:30 UTC: daqui a 3 dias é 04/10, não 05/10.
  assert.equal(dataDaqui(3, new Date('2026-10-02T02:30:00Z')), '2026-10-04');
});

test('botões da mensagem (QR, 05/10): até 3, 1 a 20 caracteres, só em texto', () => {
  const com = (botoes: string[], extra = {}) => problemaNasRegras([r(null, 'SIM', { passos: [{ texto: 'Quer novidades?', botoes, ...extra }] })]);
  assert.equal(com(['Quero', 'Não, obrigado']), null);
  assert.match(com(['a', 'b', 'c', 'd']) || '', /no máximo 3 botões/);
  assert.match(com(['']) || '', /1 a 20/);
  assert.match(com(['um texto longo demais p/ botão']) || '', /1 a 20/);
  assert.match(com(['Sim'], { texto: null, media_url: '/uploads/whatsapp/1/a.ogg' }) || '', /só em mensagem de texto/);
});

test('só mover para outra etapa já é uma regra válida', () => {
  assert.equal(problemaNasRegras([r(null, 'NÃO', { passos: [], tarefa_dias: null, mover_para_estagio_id: 99 })]), null);
  assert.match(problemaNasRegras([r(null, 'NÃO', { passos: [], tarefa_dias: null })]) || '', /etapa para onde mover/);
});

test('resposta escrita: só regra com aceita_texto, frase curta igual ao botão', async () => {
  const { regraDaRespostaEscrita } = await import('../src/modules/crm/respostas-botao/regras');
  const regras = [r(null, 'SIM', { aceita_texto: true }), r(null, 'NÃO', { aceita_texto: true }), r(null, 'Ainda não')];
  const b = (t: string) => regraDaRespostaEscrita(regras, null, t)?.botao ?? null;
  assert.equal(b('sim'), 'SIM');
  assert.equal(b('Sim!! 😊'), 'SIM');
  assert.equal(b('sim, quero'), 'SIM');
  assert.equal(b('nao'), 'NÃO');
  assert.equal(b('Não, obrigado'), 'NÃO');
  assert.equal(b('não sei se agora dá'), null);
  assert.equal(b('simone'), null);
  assert.equal(b('ainda não'), null); // regra sem aceita_texto: só o clique
});
