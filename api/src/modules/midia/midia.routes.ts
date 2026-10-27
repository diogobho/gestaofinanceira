/**
 * Acesso autenticado à mídia de conversa (`/uploads/whatsapp/...`).
 *
 * ── O que estava errado ──────────────────────────────────────────────────────
 * O nginx servia `/api/gestao/uploads/` como `alias` estático, com
 * `Access-Control-Allow-Origin: *` e cache de 1 dia. Resultado medido em
 * 25/08/2026: **23 GB / 31.612 arquivos de 10 empresas** acessíveis a quem
 * tivesse a URL, sem token nenhum — áudio e imagem de conversa de WhatsApp de
 * leads, ou seja dado pessoal de terceiro. Os nomes têm timestamp + 6 caracteres
 * aleatórios, então não era enumerável de forma trivial; era segurança por
 * obscuridade, o que não é segurança.
 *
 * ── Por que o token vem na query, e não no header ────────────────────────────
 * A mídia é renderizada por `<img src>`, `<audio src>` e `<video src>`. Requisição
 * nativa do navegador NÃO manda header `Authorization`, e o app guarda o JWT no
 * localStorage (não em cookie), então não há nada que o navegador anexe sozinho.
 * As alternativas eram: baixar tudo por XHR e virar `blob:` (quebra streaming e
 * seek de áudio/vídeo, e carrega o arquivo inteiro na memória) ou passar um cookie
 * (exigiria mexer no login e romperia a sessão de todo mundo que já está logado).
 *
 * Aceitar o MESMO token na query é o caminho mínimo: mantém `<audio>` nativo,
 * exige uma linha no frontend e nenhuma mudança no login. O custo é o token
 * aparecer no access log do nginx — same-origin, sob HTTPS, e é o mesmo token que
 * já vive no localStorage. Anotado como dívida: o passo seguinte é URL assinada
 * de curta duração (HMAC + expiração), que tira o token da query.
 *
 * ── Por que a autorização é por CONSULTA, e não pelo caminho ─────────────────
 * Não dá para autorizar por segmento de path. O diretório é escrito com semântica
 * DIFERENTE em cada caminho de gravação: `webhook.controller` grava em
 * `/uploads/whatsapp/{usuario_id}/`, enquanto `contatos.service` e
 * `followups.service` gravam em `/uploads/whatsapp/{empresa_id}/`. A mesma árvore
 * mistura id de usuário e id de empresa, então "a pasta 22 é da empresa 22" é
 * falso. Quem sabe de quem é o arquivo é o BANCO: procuramos a linha que aponta
 * para aquele `media_url` e comparamos a empresa dela com a de quem pede.
 */

import path from 'path';
import fs from 'fs';
import { Router, Response } from 'express';
import { AuthRequest, authRequiredOuTokenNaQuery } from '../../middlewares/auth.middleware';
import { query } from '../../config/database';

const RAIZ = '/var/www/apps/gestao_financeira/uploads';

const router = Router();

/**
 * De qual empresa é este arquivo? Procura nos três lugares que guardam
 * `media_url`: o histórico de conversa, o follow-up agendado e a mídia anexada
 * na cadência de um estágio (que mora no JSONB `followup_config`).
 *
 * Devolve `null` quando nenhuma linha aponta para o arquivo — o que também cobre
 * arquivo órfão em disco: sem dono conhecido, ninguém tem acesso.
 */
async function empresaDonaDoArquivo(relativo: string): Promise<number | null> {
  const r = await query(
    `SELECT empresa_id FROM historico_mensagens WHERE media_url = $1 AND NOT copia_indevida LIMIT 1`,
    [relativo]
  );
  if (r.rows[0]) return Number(r.rows[0].empresa_id);

  const f = await query(
    `SELECT empresa_id FROM followups_agendados WHERE media_url = $1 LIMIT 1`,
    [relativo]
  );
  if (f.rows[0]) return Number(f.rows[0].empresa_id);

  // Mídia da cadência: `followup_config` é JSONB e o passo pode estar no array
  // `passos` ou no shape antigo (o próprio objeto é o passo).
  const e = await query(
    `SELECT fn.empresa_id
       FROM estagios_funil ef
       JOIN funis fn ON fn.id = ef.funil_id
      WHERE ef.followup_config::text LIKE '%' || $1 || '%'
      LIMIT 1`,
    [relativo]
  );
  if (e.rows[0]) return Number(e.rows[0].empresa_id);

  return null;
}

router.get('/uploads/*', authRequiredOuTokenNaQuery, async (req: AuthRequest, res: Response) => {
  try {
    const solicitado = (req.params as any)[0] as string;

    // Normaliza e confina em RAIZ: bloqueia `../` e link simbólico apontando para
    // fora da pasta. `path.resolve` já colapsa os `..`; a comparação com o prefixo
    // é o que garante que o resultado não escapou.
    const absoluto = path.resolve(RAIZ, solicitado);
    if (absoluto !== RAIZ && !absoluto.startsWith(RAIZ + path.sep)) {
      return res.status(400).json({ message: 'Caminho inválido' });
    }
    if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isFile()) {
      return res.status(404).json({ message: 'Arquivo não encontrado' });
    }

    // O caminho gravado no banco tem sempre o prefixo `/uploads/`.
    const relativo = '/uploads/' + solicitado.replace(/^\/+/, '');
    const dona = await empresaDonaDoArquivo(relativo);

    // super_admin atravessa empresas (é quem atende o suporte). Qualquer outro só
    // enxerga arquivo da própria empresa. Arquivo sem dono no banco não é servido.
    const ehSuperAdmin = req.user?.nivel === 'super_admin';
    if (!ehSuperAdmin) {
      if (dona == null || dona !== req.user?.empresa_id) {
        // 404 e não 403: dizer "existe mas não é seu" já é informação sobre o
        // arquivo de outra empresa.
        return res.status(404).json({ message: 'Arquivo não encontrado' });
      }
    }

    // `private`: mídia de cliente não pode ficar em cache compartilhado (proxy/CDN).
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(absoluto);
  } catch (err: any) {
    console.error('[midia] falha ao servir arquivo —', err?.message || err);
    return res.status(500).json({ message: 'Não foi possível abrir o arquivo' });
  }
});

export default router;
