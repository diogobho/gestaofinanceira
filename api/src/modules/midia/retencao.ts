/**
 * Cota de mídia do WhatsApp por empresa (migration 076).
 *
 * Cada empresa guarda até `empresas.limite_midia_mb` (1 GB por padrão) de mídia de
 * conversa 1:1. Passou disso, sai o ARQUIVO mais antigo — a mensagem fica no
 * histórico, com texto e legenda, marcada em `midia_expirada_em`, e o balão diz que
 * a mídia expirou. Mídia de grupo não é guardada (não aparece no card).
 *
 * A unidade é o ARQUIVO, não a linha: o follow-up com anexo grava no histórico o
 * mesmo `media_url` do anexo da cadência, e apagar esse arquivo tiraria o anexo de
 * todos os envios seguintes. Por isso ficam fora da cota, e nunca são apagados:
 *   - arquivo citado por follow-up agendado, cadência, lembrete de reunião,
 *     automação ou disparo (é configuração, não conversa);
 *   - arquivo que outra empresa também referencia;
 *   - as cópias do vazamento (`copia_indevida`, migration 075), separadas e mantidas.
 *
 * Nada é apagado sem backup de arquivos bem-sucedido nas últimas 26h
 * (`api/scripts/backup_diario.sh` grava o ULTIMO_OK) — todo arquivo que sai daqui
 * ainda existe por 7 dias em /var/backups/gestao_financeira/arquivos/.
 */

import fs from 'fs';
import path from 'path';
import { query } from '../../config/database';

const RAIZ_APP = '/var/www/apps/gestao_financeira';
const RAIZ_MIDIA = path.join(RAIZ_APP, 'uploads', 'whatsapp') + path.sep;
const MARCA_BACKUP = '/var/backups/gestao_financeira/ULTIMO_OK';
const BACKUP_VALIDO_MS = 26 * 3600 * 1000;
const LOTE = 500;

// Todo caminho de arquivo que a automação reutiliza. Os JSONB são varridos como texto:
// o formato do passo de cadência mudou mais de uma vez, e o que importa é o caminho.
const SQL_PROTEGIDOS = `
  SELECT media_url AS url FROM followups_agendados WHERE media_url IS NOT NULL
  UNION SELECT (regexp_matches(followup_config::text,   '/uploads/[^"\\s\\\\]+', 'g'))[1] FROM estagios_funil WHERE followup_config IS NOT NULL
  UNION SELECT (regexp_matches(reuniao_lembretes::text, '/uploads/[^"\\s\\\\]+', 'g'))[1] FROM estagios_funil WHERE reuniao_lembretes IS NOT NULL
  UNION SELECT (regexp_matches(config::text,            '/uploads/[^"\\s\\\\]+', 'g'))[1] FROM automacoes WHERE config IS NOT NULL
  UNION SELECT (regexp_matches(configuracao_json::text, '/uploads/[^"\\s\\\\]+', 'g'))[1] FROM disparos_crm WHERE configuracao_json IS NOT NULL
  UNION SELECT media_url FROM grupos_mensagens WHERE media_url IS NOT NULL`;

export interface RelatorioEmpresa {
  empresa_id: number;
  empresa: string;
  limite_mb: number;
  usado_mb: number;
  arquivos_apagados: number;
  liberado_mb: number;
}

export interface RelatorioRetencao {
  simulacao: boolean;
  bloqueado?: string;
  grupos: { arquivos: number; liberado_mb: number };
  empresas: RelatorioEmpresa[];
  falhas: number;
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

/** Backup de arquivos terminou bem nas últimas 26h? */
export function backupRecente(): { ok: boolean; motivo?: string } {
  try {
    const idade = Date.now() - fs.statSync(MARCA_BACKUP).mtimeMs;
    if (idade > BACKUP_VALIDO_MS) {
      return { ok: false, motivo: `último backup ok há ${Math.round(idade / 3600000)}h` };
    }
    return { ok: true };
  } catch {
    return { ok: false, motivo: `sem ${MARCA_BACKUP} — o backup nunca terminou` };
  }
}

/** Apaga os arquivos; ENOENT conta como apagado (o objetivo é o arquivo não existir). */
async function apagarArquivos(urls: string[]): Promise<{ apagados: string[]; falhas: number }> {
  const apagados: string[] = [];
  let falhas = 0;
  for (const url of urls) {
    const abs = path.resolve(RAIZ_APP, '.' + url);
    // Só dentro de uploads/whatsapp — um media_url estranho nunca pode virar rm fora dali.
    if (!abs.startsWith(RAIZ_MIDIA)) { falhas++; continue; }
    try {
      await fs.promises.unlink(abs);
      apagados.push(url);
    } catch (err: any) {
      if (err.code === 'ENOENT') apagados.push(url);
      else { falhas++; console.error(`[RetencaoMidia] não apagou ${url}: ${err.message}`); }
    }
  }
  return { apagados, falhas };
}

async function marcarExpiradas(urls: string[], empresaId: number | null): Promise<void> {
  for (let i = 0; i < urls.length; i += LOTE) {
    await query(
      `UPDATE historico_mensagens SET midia_expirada_em = now()
        WHERE media_url = ANY($1::text[]) AND midia_expirada_em IS NULL
          AND ($2::int IS NULL OR empresa_id = $2)`,
      [urls.slice(i, i + LOTE), empresaId]
    );
  }
}

export async function aplicarRetencaoMidia(opcoes: { simular?: boolean } = {}): Promise<RelatorioRetencao> {
  const simular = !!opcoes.simular;
  const relatorio: RelatorioRetencao = { simulacao: simular, grupos: { arquivos: 0, liberado_mb: 0 }, empresas: [], falhas: 0 };

  if (!simular) {
    const backup = backupRecente();
    if (!backup.ok) {
      relatorio.bloqueado = `nada apagado: ${backup.motivo}`;
      return relatorio;
    }
  }

  // ── Grupo: não guarda mídia ────────────────────────────────────────────────
  const grupos = await query(
    `WITH protegidos AS (${SQL_PROTEGIDOS})
     SELECT h.media_url, max(COALESCE(h.media_tamanho, 0))::bigint AS tamanho
       FROM historico_mensagens h
      WHERE h.grupo_whatsapp_id IS NOT NULL AND h.media_url IS NOT NULL AND h.midia_expirada_em IS NULL
        AND NOT EXISTS (SELECT 1 FROM protegidos p WHERE p.url = h.media_url)
        AND NOT EXISTS (SELECT 1 FROM historico_mensagens o
                         WHERE o.media_url = h.media_url AND o.grupo_whatsapp_id IS NULL)
      GROUP BY h.media_url`
  );
  const bytesGrupo = grupos.rows.reduce((s: number, r: any) => s + Number(r.tamanho), 0);
  relatorio.grupos = { arquivos: grupos.rows.length, liberado_mb: mb(bytesGrupo) };
  if (!simular && grupos.rows.length) {
    const r = await apagarArquivos(grupos.rows.map((x: any) => x.media_url));
    await marcarExpiradas(r.apagados, null);
    relatorio.falhas += r.falhas;
  }

  // ── Conversa 1:1: cota por empresa, o mais antigo sai primeiro ─────────────
  const empresas = await query(
    `SELECT e.id, e.nome, e.limite_midia_mb FROM empresas e
      WHERE EXISTS (SELECT 1 FROM historico_mensagens h
                     WHERE h.empresa_id = e.id AND h.media_url IS NOT NULL AND h.midia_expirada_em IS NULL)
      ORDER BY e.id`
  );
  for (const e of empresas.rows) {
    const limiteBytes = Number(e.limite_midia_mb) * 1048576;
    const arquivos = await query(
      `WITH protegidos AS (${SQL_PROTEGIDOS}),
       arquivos AS (
         SELECT h.media_url, max(h.enviado_at) AS ultimo, max(COALESCE(h.media_tamanho, 0))::bigint AS tamanho
           FROM historico_mensagens h
          WHERE h.empresa_id = $1 AND h.media_url IS NOT NULL AND h.midia_expirada_em IS NULL
            AND h.grupo_whatsapp_id IS NULL AND NOT h.copia_indevida
            AND NOT EXISTS (SELECT 1 FROM protegidos p WHERE p.url = h.media_url)
            AND NOT EXISTS (SELECT 1 FROM historico_mensagens o
                             WHERE o.media_url = h.media_url AND o.empresa_id <> $1)
          GROUP BY h.media_url
       )
       SELECT media_url, tamanho,
              sum(tamanho) OVER (ORDER BY ultimo DESC, media_url) AS acumulado
         FROM arquivos`,
      [e.id]
    );
    const usado = arquivos.rows.reduce((s: number, r: any) => s + Number(r.tamanho), 0);
    const excedentes = arquivos.rows.filter((r: any) => Number(r.acumulado) > limiteBytes);
    const liberado = excedentes.reduce((s: number, r: any) => s + Number(r.tamanho), 0);

    let apagados = excedentes.length;
    if (!simular && excedentes.length) {
      const r = await apagarArquivos(excedentes.map((x: any) => x.media_url));
      await marcarExpiradas(r.apagados, e.id);
      relatorio.falhas += r.falhas;
      apagados = r.apagados.length;
    }
    relatorio.empresas.push({
      empresa_id: e.id, empresa: e.nome, limite_mb: Number(e.limite_midia_mb),
      usado_mb: mb(usado), arquivos_apagados: apagados, liberado_mb: mb(liberado),
    });
  }

  return relatorio;
}
