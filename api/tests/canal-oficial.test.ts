/**
 * Canal oficial do cliente (Embedded Signup, migration 084).
 *
 * O que fica preso aqui é o que não dá para descobrir olhando a tela:
 *
 *  1. **configuração ausente não vira botão quebrado.** Sem o app da Meta no `.env`
 *     a janela não abre — e a API tem que dizer QUAL variável falta, senão o
 *     diagnóstico vira tentativa e erro no painel da Meta;
 *  2. **quem pode conectar por quem.** O número é do operador; um usuário comum
 *     não conecta o número de outro, e o administrador conecta pela equipe;
 *  3. **a ordem dos três passos do onboarding.** Inscrever o app na WABA ANTES de
 *     registrar o número é o passo que não avisa quando falta: a conexão parece
 *     pronta, o envio funciona e nenhuma mensagem chega. Foi o que deixou a nossa
 *     própria WABA muda até 09/09/2026;
 *  4. **a migration e o código concordam** sobre a conta ser por número.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = join(__dirname, '..', 'migrations', '084_whatsapp_cloud_por_numero.sql');

const envOriginal = { ...process.env };
afterEach(() => {
  process.env = { ...envOriginal };
});

describe('configuração do Embedded Signup', () => {
  test('sem nada no .env, diz exatamente o que falta', async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_ES_CONFIG_ID;
    const { configES } = await import('../src/modules/whatsapp/meta/embedded-signup.service');

    const cfg = configES();
    assert.equal(cfg.configurado, false);
    assert.deepEqual(cfg.faltando, ['META_APP_ID', 'META_APP_SECRET', 'META_ES_CONFIG_ID']);
    assert.equal(cfg.appId, null);
  });

  test('faltando só o config id, só ele é apontado', async () => {
    process.env.META_APP_ID = '1927360974611513';
    process.env.META_APP_SECRET = 'segredo';
    delete process.env.META_ES_CONFIG_ID;
    const { configES } = await import('../src/modules/whatsapp/meta/embedded-signup.service');

    const cfg = configES();
    assert.equal(cfg.configurado, false);
    assert.deepEqual(cfg.faltando, ['META_ES_CONFIG_ID']);
  });

  test('com tudo preenchido, a tela recebe o que precisa para abrir a janela', async () => {
    process.env.META_APP_ID = '1927360974611513';
    process.env.META_APP_SECRET = 'segredo';
    process.env.META_ES_CONFIG_ID = '123456';
    const { configES } = await import('../src/modules/whatsapp/meta/embedded-signup.service');

    const cfg = configES();
    assert.equal(cfg.configurado, true);
    assert.deepEqual(cfg.faltando, []);
    assert.equal(cfg.appId, '1927360974611513');
    assert.equal(cfg.configId, '123456');
    // A versão vem do mesmo lugar que todo o resto da Graph API — trocar de versão
    // não pode exigir mexer em dois arquivos.
    assert.match(cfg.graphVersion, /^v\d+\.\d+$/);
  });

  test('a troca do code recusa antes de sair da máquina quando falta configuração', async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_ES_CONFIG_ID;
    const { trocarCodePorToken } = await import('../src/modules/whatsapp/meta/embedded-signup.service');

    await assert.rejects(() => trocarCodePorToken('AQD...'), /META_APP_ID/);
  });

  test('o PIN do /register tem 6 dígitos', async () => {
    const { gerarPin } = await import('../src/modules/whatsapp/meta/embedded-signup.service');
    for (let i = 0; i < 200; i++) assert.match(gerarPin(), /^\d{6}$/);
  });
});

describe('quem conecta por quem', () => {
  const req = (user: any, body: any = {}) => ({ user, body }) as any;

  test('o usuário conecta o próprio número', async () => {
    const { _alvoPermitido } = await import('../src/modules/whatsapp/canal/oficial.controller');
    const r = _alvoPermitido(req({ userId: 7, tipo_usuario: 'comum' }));
    assert.deepEqual(r, { ok: true, usuarioId: 7 });
  });

  test('usuário comum NÃO conecta o número de outro', async () => {
    const { _alvoPermitido } = await import('../src/modules/whatsapp/canal/oficial.controller');
    const r = _alvoPermitido(req({ userId: 7, tipo_usuario: 'comum' }, { usuario_id: 9 }));
    assert.equal(r.ok, false);
  });

  test('master e creator conectam pela equipe', async () => {
    const { _alvoPermitido } = await import('../src/modules/whatsapp/canal/oficial.controller');
    for (const tipo of ['master', 'creator']) {
      const r = _alvoPermitido(req({ userId: 7, tipo_usuario: tipo }, { usuario_id: 9 }));
      assert.deepEqual(r, { ok: true, usuarioId: 9 }, tipo);
    }
  });

  test('super_admin também, mesmo sendo "comum" na empresa', async () => {
    const { _alvoPermitido } = await import('../src/modules/whatsapp/canal/oficial.controller');
    const r = _alvoPermitido(req({ userId: 12, tipo_usuario: 'comum', nivel: 'super_admin' }, { usuario_id: 9 }));
    assert.equal(r.ok, true);
  });
});

describe('a conta é por número (migration 084)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  test('a trava de "uma conta por empresa" sai', () => {
    assert.match(sql, /DROP CONSTRAINT IF EXISTS whatsapp_cloud_contas_empresa_id_key/);
  });

  test('o número ganha dono', () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS usuario_id\s+integer REFERENCES usuarios\(id\)/);
  });

  test('um número por usuário, e um número "da empresa" por empresa', () => {
    assert.match(sql, /idx_wa_cloud_conta_por_usuario[\s\S]*?WHERE usuario_id IS NOT NULL/);
    assert.match(sql, /idx_wa_cloud_conta_da_empresa[\s\S]*?WHERE usuario_id IS NULL/);
  });

  test('guarda o que o Embedded Signup traz', () => {
    for (const coluna of ['business_id', 'pin_enc', 'origem', 'pagamento_ok', 'conectado_em']) {
      assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${coluna}`), coluna);
    }
  });
});

describe('a ordem do onboarding', () => {
  test('inscrever o app na WABA vem ANTES de registrar o número', async () => {
    const fonte = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'whatsapp', 'meta', 'embedded-signup.service.ts'),
      'utf8'
    );
    const corpo = fonte.slice(fonte.indexOf('export async function onboardingDoNumero'));
    const troca = corpo.indexOf('trocarCodePorToken');
    const assina = corpo.indexOf('assinarAppNaWaba');
    const registra = corpo.indexOf('registrarNumero');
    assert.ok(troca >= 0 && assina >= 0 && registra >= 0, 'os três passos existem');
    assert.ok(troca < assina, 'o token vem primeiro — os outros dois falam com a conta do cliente');
    assert.ok(assina < registra, 'a inscrição na WABA vem antes do registro do número');
  });
});
