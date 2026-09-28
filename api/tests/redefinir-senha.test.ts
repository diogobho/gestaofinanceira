/**
 * Esqueci minha senha: as regras que não dependem do banco.
 *
 * O token nunca vai ao banco em claro (só o SHA-256), token malformado nem chega
 * a virar consulta, a régua da senha é a mesma do perfil, e o e-mail leva o link
 * inteiro com o molde preenchido (o marcador sobrando já deixou um e-mail sem
 * miolo — ver o CLAUDE.md da app).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarToken,
  hashDoToken,
  tokenBemFormado,
  problemaNaSenha,
  mascararEmail,
  montarEmail,
} from '../src/modules/auth/redefinir-senha';

describe('token', () => {
  test('o hash guardado não é o token e é reprodutível', () => {
    const { token, hash } = gerarToken();
    assert.notEqual(hash, token);
    assert.equal(hash, hashDoToken(token));
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('dois tokens nunca se repetem', () => {
    assert.notEqual(gerarToken().token, gerarToken().token);
  });

  test('só a forma de um token nosso passa', () => {
    assert.equal(tokenBemFormado(gerarToken().token), true);
    assert.equal(tokenBemFormado(''), false);
    assert.equal(tokenBemFormado("' OR 1=1 --"), false);
    assert.equal(tokenBemFormado(undefined), false);
    assert.equal(tokenBemFormado('a'.repeat(44)), false);
  });
});

describe('senha nova', () => {
  test('mínimo de 8, teto de 72 (bcrypt)', () => {
    assert.ok(problemaNaSenha('1234567'));
    assert.equal(problemaNaSenha('12345678'), null);
    assert.ok(problemaNaSenha('x'.repeat(73)));
    assert.ok(problemaNaSenha(undefined));
    assert.ok(problemaNaSenha(12345678));
  });
});

describe('e-mail mascarado', () => {
  test('mostra o começo e o domínio', () => {
    assert.equal(mascararEmail('diogo@escolapanthers.com.br'), 'di***@escolapanthers.com.br');
    assert.equal(mascararEmail('ab@x.com'), 'a***@x.com');
    assert.equal(mascararEmail('semarroba'), '');
  });
});

describe('e-mail do link', () => {
  test('leva o link, o primeiro nome e nenhum marcador sobrando', async () => {
    const link = 'https://duofuturo.tech/gestao/redefinir-senha?token=abc';
    const { assunto, html, texto } = await montarEmail('Débora Bogiani', link);
    assert.match(assunto, /senha nova/);
    assert.ok(html.includes(link));
    assert.ok(html.includes('Oi Débora'));
    assert.ok(!/<!--(TITULO|CONTEUDO|ASSINATURA)-->/.test(html));
    assert.ok(texto.includes(link));
  });

  test('nome com HTML não vira HTML', async () => {
    const { html } = await montarEmail('<script>x</script>', 'https://x/y');
    assert.ok(!html.includes('<script>x'));
  });
});
