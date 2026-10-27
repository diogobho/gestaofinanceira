/**
 * Janela operacional de envio, por empresa.
 *
 * Uma única configuração governa TODA automação de saída da empresa:
 *  - o follow-up agendado (followup-scheduler);
 *  - o agente reativo (agente-ia.queue), que antes tinha 08h–20h chumbado no código.
 *
 * Mora em `empresas.config` (mesmo JSONB do intervalo anti-ban) para não exigir
 * tabela nova: é configuração de comportamento da empresa, não entidade.
 *
 * Chaves: janela_envio_inicio ('HH:MM'), janela_envio_fim ('HH:MM'),
 *         janela_envio_dias (int[] 0=Dom..6=Sáb; ausente = todos os dias).
 *
 * Empresa sem configuração recebe JANELA_PADRAO (08:00–20:00, todos os dias), que é
 * exatamente o comportamento que o agente reativo já tinha — ligar isto não muda
 * nada para quem não configurar.
 */

import { query } from '../../../config/database';
import { JanelaOperacional, JANELA_PADRAO, normalizarJanela, normalizarDias } from './agendamento';

/** SELECT dos três campos da janela a partir de empresas.config. */
const SELECT_JANELA = `
  config->>'janela_envio_inicio' AS inicio,
  config->>'janela_envio_fim'    AS fim,
  config->'janela_envio_dias'    AS dias`;

function montar(row: any): JanelaOperacional {
  if (!row) return { ...JANELA_PADRAO };
  return normalizarJanela({
    inicio: row.inicio ?? JANELA_PADRAO.inicio,
    fim: row.fim ?? JANELA_PADRAO.fim,
    dias: Array.isArray(row.dias) ? row.dias : null,
  });
}

export async function getJanelaEmpresa(empresaId: number): Promise<JanelaOperacional> {
  const r = await query(`SELECT ${SELECT_JANELA} FROM empresas WHERE id = $1`, [empresaId]);
  return montar(r.rows[0]);
}

/** Janela de todas as empresas de uma vez (o scheduler roda por empresa a cada ciclo). */
export async function janelasPorEmpresa(): Promise<Record<number, JanelaOperacional>> {
  const r = await query(`SELECT id, ${SELECT_JANELA} FROM empresas`, []);
  const map: Record<number, JanelaOperacional> = {};
  for (const row of r.rows) map[row.id] = montar(row);
  return map;
}

/** Grava a janela (normalizada) em empresas.config e devolve o que ficou salvo. */
export async function setJanelaEmpresa(
  empresaId: number,
  bruta: Partial<JanelaOperacional>
): Promise<JanelaOperacional> {
  const janela = normalizarJanela(bruta);
  await query(
    `UPDATE empresas
        SET config = COALESCE(config, '{}'::jsonb)
                     || jsonb_build_object('janela_envio_inicio', $2::text,
                                           'janela_envio_fim',    $3::text,
                                           'janela_envio_dias',   $4::jsonb),
            updated_at = NOW()
      WHERE id = $1`,
    [
      empresaId,
      janela.inicio,
      janela.fim,
      JSON.stringify(normalizarDias(janela.dias)),
    ]
  );
  return janela;
}

/**
 * Passos de cadência cujos dias não têm interseção com a janela da empresa.
 *
 * Conflito de configuração é detectado onde a configuração é ESCRITA — é lá que o
 * administrador está olhando e pode corrigir. Deixar para o momento do envio
 * significa descobrir o problema quando o follow-up já deveria ter saído.
 *
 * Usado nos dois lados do conflito: ao salvar a cadência de um estágio (rejeita) e
 * ao salvar a janela da empresa (avisa quais estágios passariam a conflitar).
 */
import { conflitoDeDias, nomearDias, extrairPassosFollowup } from './agendamento';

export interface ConflitoJanela {
  estagio_id: number;
  estagio_nome: string;
  passo: number;
  dias_passo: string;
  dias_janela: string;
}

/** Passos de UM followup_config que conflitam com a janela. */
export function conflitosDoConfig(
  followupConfig: any,
  janela: JanelaOperacional
): Array<{ passo: number; dias_passo: string }> {
  const passos = extrairPassosFollowup(followupConfig);
  const out: Array<{ passo: number; dias_passo: string }> = [];
  passos.forEach((p: any, i: number) => {
    if (conflitoDeDias(janela, p?.dias_semana)) {
      out.push({ passo: i + 1, dias_passo: nomearDias(p?.dias_semana) });
    }
  });
  return out;
}

/** Todos os estágios ATIVOS da empresa que conflitariam com a janela informada. */
export async function conflitosDaEmpresa(
  empresaId: number,
  janela: JanelaOperacional
): Promise<ConflitoJanela[]> {
  const r = await query(
    `SELECT ef.id, ef.nome, ef.followup_config AS cfg
       FROM estagios_funil ef
       JOIN funis f ON f.id = ef.funil_id
      WHERE f.empresa_id = $1
        AND ef.followup_config IS NOT NULL
        AND (ef.followup_config->>'ativo') = 'true'`,
    [empresaId]
  );
  const janelaNorm = normalizarJanela(janela);
  const conflitos: ConflitoJanela[] = [];
  for (const row of r.rows) {
    for (const c of conflitosDoConfig(row.cfg, janelaNorm)) {
      conflitos.push({
        estagio_id: row.id,
        estagio_nome: row.nome,
        passo: c.passo,
        dias_passo: c.dias_passo,
        dias_janela: nomearDias(janelaNorm.dias),
      });
    }
  }
  return conflitos;
}
