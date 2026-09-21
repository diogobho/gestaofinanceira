import { Router, Request, Response } from 'express';
import { contaazulService } from './contaazul.service';
import { env } from '../../config/env';

const router = Router();

/**
 * Conta Azul — OAuth2.
 *
 * Fluxo (uma vez só, POR CONEXÃO — ver migration 066):
 *   1. abrir  /api/gestao/contaazul/authorize?secret=…&conexao=N → redireciona para o Conta Azul
 *   2. logar no Conta Azul e autorizar
 *   3. o Conta Azul devolve o navegador em /api/gestao/contaazul/callback?code=…&state=…
 *   4. o callback troca o code por tokens e guarda o refresh_token
 *
 * Daí em diante o backend renova sozinho — o access_token dura só 60 minutos.
 *
 * O /callback é público de propósito: quem chega nele é o navegador do usuário
 * vindo do Conta Azul, sem header de autenticação. A proteção é o `state`,
 * gerado no passo 1, de uso único e com validade curta. É o state que carrega a
 * conexão de destino — o Conta Azul não devolve o client_id no callback, então
 * sem ele não há como saber em qual conexão gravar o token.
 */

const EMPRESA_PADRAO = Number(process.env.CONTAAZUL_EMPRESA_ID) || 5; // 5 = Panteras

function autorizadoAdmin(req: Request): boolean {
  const segredo = env.CONTAAZUL_SETUP_SECRET;
  if (!segredo) return false;
  const informado = (req.query.secret as string) || (req.headers['x-setup-secret'] as string) || '';
  return informado === segredo;
}

function pagina(titulo: string, corpo: string, cor: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f6f7f9;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a2233}
.c{background:#fff;border:1px solid #dfe3ea;border-top:4px solid ${cor};border-radius:14px;
padding:30px 34px;max-width:520px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{margin:0 0 10px;font-size:20px;color:#13264C}p{margin:0 0 8px}
code{background:#f2f4f8;border:1px solid #dfe3ea;border-radius:5px;padding:2px 6px;
font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all}
.m{color:#5b6577;font-size:13.5px;margin-top:14px}</style></head>
<body><div class="c">${corpo}</div></body></html>`;
}

/** Passo 1 — leva o usuário para o consentimento do Conta Azul. */
router.get('/authorize', async (req: Request, res: Response) => {
  if (!autorizadoAdmin(req)) {
    return res.status(401).send(
      pagina('Não autorizado', '<h1>Não autorizado</h1><p>Informe <code>?secret=…</code> válido.</p>', '#a4262c')
    );
  }
  try {
    const empresaId = Number(req.query.empresa) || EMPRESA_PADRAO;
    const conexaoId = Number(req.query.conexao) || 0;

    // Sem `conexao` explícita: se há mais de uma, não adivinha — mostra a lista.
    // Autorizar a conexão errada grava o refresh_token de um produto no outro.
    if (!conexaoId) {
      const conexoes = await contaazulService.listarConexoes(empresaId);
      if (conexoes.length === 0) {
        return res.status(400).send(
          pagina('Nenhuma conexão',
            `<h1>Nenhuma conexão cadastrada</h1>
             <p>Cadastre em <code>contaazul_conexoes</code> (empresa ${empresaId}) antes de autorizar.</p>`,
            '#a4262c')
        );
      }
      if (conexoes.length > 1) {
        const secret = encodeURIComponent(String(req.query.secret ?? ''));
        const itens = conexoes
          .map(
            (c) =>
              `<li><a href="?secret=${secret}&empresa=${empresaId}&conexao=${c.id}">` +
              `${c.nome}</a> ${c.ativo ? '' : '<em>(inativa)</em>'}</li>`
          )
          .join('');
        return res.send(
          pagina('Qual conexão?',
            `<h1>Qual conta você vai autorizar?</h1><ul>${itens}</ul>
             <p class="m">Cada conta do Conta Azul tem o seu próprio app — o token de uma
             não serve para a outra.</p>`,
            '#13264C')
        );
      }
      const url = await contaazulService.iniciarAutorizacao(conexoes[0].id);
      return res.redirect(url);
    }

    const url = await contaazulService.iniciarAutorizacao(conexaoId);
    return res.redirect(url);
  } catch (err: any) {
    console.error('[ContaAzul] Falha ao iniciar autorização:', err.message);
    return res.status(500).send(
      pagina('Erro', `<h1>Não deu para iniciar</h1><p>${err.message}</p>`, '#a4262c')
    );
  }
});

/** Passo 3 — o Conta Azul devolve o navegador aqui. */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error(`[ContaAzul] Callback com erro: ${error} — ${error_description ?? ''}`);
    return res.status(400).send(
      pagina('Autorização negada',
        `<h1>Autorização negada</h1><p><code>${error}</code></p>
         <p class="m">${error_description ?? 'O Conta Azul recusou ou o usuário cancelou.'}</p>`,
        '#a4262c')
    );
  }

  if (!code || !state) {
    return res.status(400).send(
      pagina('Requisição incompleta',
        '<h1>Faltou <code>code</code> ou <code>state</code></h1><p class="m">Recomece pelo /authorize.</p>',
        '#a4262c')
    );
  }

  const registro = await contaazulService.consumirState(state);
  if (!registro) {
    return res.status(400).send(
      pagina('State inválido',
        `<h1>State inválido ou expirado</h1>
         <p class="m">Ele vale ${15} minutos e só pode ser usado uma vez. Recomece pelo /authorize.</p>`,
        '#a4262c')
    );
  }

  if (!registro.conexao_id) {
    return res.status(400).send(
      pagina('State sem conexão',
        `<h1>Este link é de antes da migration 066</h1>
         <p class="m">Recomece pelo /authorize para o state carregar a conexão de destino.</p>`,
        '#a4262c')
    );
  }

  try {
    const conexao = await contaazulService.obterConexao(registro.conexao_id);
    const t = await contaazulService.trocarCodePorTokens(code, registro.conexao_id);
    console.log(
      `[ContaAzul] Autorizado — empresa ${registro.empresa_id}, conexão ${conexao.id} ` +
      `"${conexao.nome}", access_token expira em ${t.expires_in ?? 3600}s, refresh_token guardado`
    );
    return res.send(
      pagina('Conta Azul conectado',
        `<h1>Conta Azul conectado ✓</h1>
         <p>Conexão <code>${conexao.nome}</code> (empresa ${registro.empresa_id}) autorizada com sucesso.</p>
         <p>O <code>refresh_token</code> foi guardado — a renovação passa a ser automática.</p>
         <p class="m">Pode fechar esta aba.</p>`,
        '#0f7a52')
    );
  } catch (err: any) {
    console.error('[ContaAzul] Falha ao trocar code por tokens:', err.message);
    return res.status(502).send(
      pagina('Falha na troca',
        `<h1>Não consegui trocar o código</h1><p><code>${err.message}</code></p>
         <p class="m">Verifique se a URL de redirecionamento cadastrada no Conta Azul é exatamente
         <code>${env.CONTAAZUL_REDIRECT_URI || '(não configurada)'}</code>.</p>`,
        '#a4262c')
    );
  }
});

/** Situação atual — sem expor token. */
router.get('/status', async (req: Request, res: Response) => {
  if (!autorizadoAdmin(req)) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const empresaId = Number(req.query.empresa) || EMPRESA_PADRAO;
    return res.json(await contaazulService.status(empresaId));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** Força uma renovação (diagnóstico). */
router.post('/renovar', async (req: Request, res: Response) => {
  if (!autorizadoAdmin(req)) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const empresaId = Number(req.query.empresa) || EMPRESA_PADRAO;
    const conexaoId = Number(req.query.conexao) || 0;

    // Sem `conexao`: renova todas as ativas e autorizadas, uma falha não derruba
    // as outras — é diagnóstico, interessa saber quais respondem.
    const alvos = conexaoId
      ? [await contaazulService.obterConexao(conexaoId)]
      : await contaazulService.listarConexoesAutorizadas(empresaId);

    const resultado: Array<{ conexao_id: number; nome: string; ok: boolean; erro?: string }> = [];
    for (const c of alvos) {
      try {
        await contaazulService.renovar(c.id);
        resultado.push({ conexao_id: c.id, nome: c.nome, ok: true });
      } catch (err: any) {
        resultado.push({ conexao_id: c.id, nome: c.nome, ok: false, erro: err.message });
      }
    }
    return res.json({
      ok: resultado.every((r) => r.ok),
      renovacoes: resultado,
      ...(await contaazulService.status(empresaId)),
    });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

export default router;
