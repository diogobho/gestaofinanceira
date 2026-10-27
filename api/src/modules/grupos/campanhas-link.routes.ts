import { Router, Request, Response } from 'express';
import { resolverLink } from './campanhas.service';
import { ehRobo } from './campanhas-regras';

/**
 * Link público da campanha de grupo (migration 089): `duofuturo.tech/gestao/g/<slug>`
 * (o nginx repassa para `/api/grupos-link/<slug>`). Sem login — é o link que vai no
 * anúncio, na bio e no e-mail.
 *
 * Responde 302 para `chat.whatsapp.com/<convite>` do grupo com vaga. Robô de
 * pré-visualização (o próprio WhatsApp, Facebook, Telegram…) segue o mesmo caminho,
 * mas não conta como clique: senão cada link colado numa conversa inflaria o painel.
 */
const router = Router();

const pagina = (titulo: string, texto: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif;
         background: #f5f7fb; color: #13264C; padding: 16px; }
  main { max-width: 420px; text-align: center; background: #fff; border-radius: 16px; padding: 32px 24px;
         box-shadow: 0 8px 24px rgba(19,38,76,.08); }
  h1 { font-size: 20px; margin: 0 0 8px; } p { margin: 0; color: #4b5563; line-height: 1.5; }
  @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #e5e7eb; } main { background: #111827; } p { color: #9ca3af; } }
</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const robo = ehRobo(req.headers['user-agent']);
    const { convite, campanha } = await resolverLink(
      String(req.params.slug || ''),
      { source: req.query.utm_source, medium: req.query.utm_medium, campaign: req.query.utm_campaign },
      !robo
    );
    res.set('Cache-Control', 'no-store');
    if (!campanha) {
      return res.status(404).type('html').send(pagina('Link não encontrado', 'Este link de grupo não existe ou foi encerrado.'));
    }
    if (!convite) {
      return res.status(503).type('html').send(pagina('Grupo lotado no momento',
        'As vagas deste grupo acabaram agora há pouco. Tente de novo em alguns minutos — um grupo novo está sendo aberto.'));
    }
    return res.redirect(302, `https://chat.whatsapp.com/${encodeURIComponent(convite)}`);
  } catch (e: any) {
    console.error('[Campanhas] link:', e?.message || e);
    return res.status(500).type('html').send(pagina('Não foi possível abrir agora', 'Tente de novo em alguns instantes.'));
  }
});

export default router;
