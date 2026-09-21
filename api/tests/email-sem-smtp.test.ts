/**
 * E-mail de cliente só sai pelo SMTP da própria empresa. Sem ele, erro com aviso —
 * nunca pelo SMTP do servidor (que, até 16/09/2026, era a conta Brevo de outra empresa).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { enviarEmail, enviarEmailCobrancaParcela, ERRO_SEM_SMTP } from '../src/services/email.service';

describe('envio sem SMTP da empresa', () => {
  test('enviarEmail recusa mesmo com SMTP no ambiente', async () => {
    process.env.SMTP_USER = 'servidor@exemplo';
    process.env.SMTP_PASS = 'segredo';
    await assert.rejects(() => enviarEmail('a@b.com', 'x', '<p>x</p>'), { message: ERRO_SEM_SMTP });
  });

  test('credencial incompleta também é recusada', async () => {
    await assert.rejects(
      () => enviarEmail('a@b.com', 'x', '<p>x</p>', {
        smtp_host: 'smtp-relay.brevo.com', smtp_port: 587, smtp_user: 'u', smtp_pass: '',
        email_from: 'a@b.com', email_from_name: 'A',
      }),
      { message: ERRO_SEM_SMTP }
    );
  });

  test('cobrança de parcela recusa sem SMTP', async () => {
    await assert.rejects(() => enviarEmailCobrancaParcela({
      clienteNome: 'C', clienteEmail: 'c@d.com', valorParcela: 10, numeroParcela: 1,
      totalParcelas: 1, diasAtraso: 3, descricao: 'x',
    }), { message: ERRO_SEM_SMTP });
  });
});
