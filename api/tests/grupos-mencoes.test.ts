import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMencoes, normalizarMencoes } from '../src/modules/grupos/mencoes';

const ana = { id: '5511999998888@s.whatsapp.net', numero: '5511999998888', rotulo: 'Ana Souza' };
const bia = { id: '123456789@lid', numero: '5521988887777', rotulo: 'Bia' };

test('menção vira o @número do jid com que o grupo lista a pessoa', () => {
  const r = aplicarMencoes('Oi @Ana Souza e @Bia!', [ana, bia],
    [{ id: '5511999998888@s.whatsapp.net', number: '5511999998888' }, { id: '123456789@lid', number: '5521988887777' }]);
  assert.equal(r.texto, 'Oi @5511999998888 e @123456789!');
  assert.deepEqual(r.jids, ['5511999998888@s.whatsapp.net', '123456789@lid']);
});

test('grupo que lista a pessoa pelo @lid casa pelo telefone', () => {
  const r = aplicarMencoes('@Ana Souza', [ana], [{ id: '999@lid', number: '5511999998888' }]);
  assert.equal(r.texto, '@999');
  assert.deepEqual(r.jids, ['999@lid']);
});

test('quem não está no grupo fica só com o nome, sem @', () => {
  const r = aplicarMencoes('Oi @Ana Souza e @Bia', [ana, bia], [{ id: '123456789@lid', number: '5521988887777' }]);
  assert.equal(r.texto, 'Oi Ana Souza e @123456789');
  assert.deepEqual(r.jids, ['123456789@lid']);
});

test('lista ilegível: todo mundo com o nome', () => {
  assert.deepEqual(aplicarMencoes('@Bia', [bia], null), { texto: 'Bia', jids: [] });
});

test('rótulo com $ não vira padrão de substituição', () => {
  const m = { ...ana, rotulo: 'Ana $&' };
  assert.equal(aplicarMencoes('@Ana $&', [m], null).texto, 'Ana $&');
});

test('normalizar tira o que saiu do texto, id inválido e rótulo repetido', () => {
  const r = normalizarMencoes([ana, bia, { ...ana, id: 'x@g.us', rotulo: 'Grupo' }, { ...ana }], 'Oi @Ana Souza');
  assert.deepEqual(r, [ana]);
  assert.deepEqual(normalizarMencoes('lixo', 'x'), []);
});
