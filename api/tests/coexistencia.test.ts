import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherNumeroCoexistencia } from '../src/modules/whatsapp/meta/embedded-signup.service';
import { textoDoHistorico } from '../src/modules/whatsapp/canal/coexistencia';

test('WABA com um número só: é ele', () => {
  assert.equal(escolherNumeroCoexistencia([{ id: '111' }]), '111');
});

test('vários números: vale o que a Meta marca como do app', () => {
  assert.equal(
    escolherNumeroCoexistencia([{ id: '111' }, { id: '222', is_on_biz_app: true }]),
    '222'
  );
});

test('vários números sem marca: recusa em vez de adivinhar', () => {
  assert.throws(() => escolherNumeroCoexistencia([{ id: '111' }, { id: '222' }]), /mais de um número/);
});

test('WABA vazia: recusa', () => {
  assert.throws(() => escolherNumeroCoexistencia([]), /nenhum número/);
});

test('número informado pela janela precisa estar na WABA', () => {
  assert.equal(escolherNumeroCoexistencia([{ id: '111' }, { id: '222' }], '222'), '222');
  assert.throws(() => escolherNumeroCoexistencia([{ id: '111' }], '999'), /não está nesta conta/);
});

test('histórico: texto passa como veio', () => {
  assert.equal(textoDoHistorico({ type: 'text', text: { body: 'Oi, tudo bem?' } }), 'Oi, tudo bem?');
});

test('histórico: mídia vira aviso, com legenda e nome do arquivo', () => {
  assert.equal(
    textoDoHistorico({ type: 'image', image: { id: 'x', caption: 'o comprovante' } }),
    '📷 Foto (do histórico do celular): o comprovante'
  );
  assert.equal(
    textoDoHistorico({ type: 'document', document: { id: 'x', filename: 'contrato.pdf' } }),
    '📄 Documento (do histórico do celular): contrato.pdf'
  );
  assert.equal(textoDoHistorico({ type: 'audio', audio: { id: 'x' } }), '🎤 Áudio (do histórico do celular)');
});

test('histórico: reação e mensagem de sistema não viram balão', () => {
  assert.equal(textoDoHistorico({ type: 'reaction', reaction: { emoji: '👍' } }), null);
  assert.equal(textoDoHistorico({ type: 'system' }), null);
  assert.equal(textoDoHistorico({}), null);
});
