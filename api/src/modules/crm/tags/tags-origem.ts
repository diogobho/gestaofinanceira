/**
 * Tags de origem — só na Panteras (empresa 5), a pedido do dono (30/09/2026).
 *
 * Cada lead ganha a tag da campanha/canal de onde veio, e uma a mais para cada
 * caminho que as NOTAS provam que ele percorreu depois: os webhooks anexam em vez de
 * duplicar (formulário do Caixa Rápido num card do Desafio, grupo do Clube do Livro
 * num card importado…), e a origem sozinha mostraria só o primeiro toque. É a mesma
 * leitura do dashboard de Integrações (`lerNotas`).
 *
 * Formas de entrada (importacao, planilha, manual, whatsapp, CRM) e `lancamento` ficam
 * FORA por escolha do dono — não são campanha.
 *
 * Quem aplica é o job `jobs/tags-origem-scheduler.ts`, e não cada ponto que cria lead:
 * são mais de dez caminhos (webhooks, importação, auto-lead, grupos, tela), e um que
 * ficasse de fora nasceria sem tag, calado. O job olha os leads alterados nos últimos
 * minutos — `updated_at` sobe também quando um webhook anexa nas notas.
 *
 * **Tag tirada à mão não volta.** `lead_tags_origem` guarda cada par (lead, tag) que
 * este módulo já aplicou uma vez; o par que está lá não é reaplicado, mesmo que o
 * operador tenha removido a tag do card.
 */

import { query } from '../../../config/database';
import { lerNotas } from '../integracoes/notas';
import { campanhaDoEvento } from '../_shared/sendflow';

export interface RegraTag {
  /** Nome da tag como aparece no card. */
  tag: string;
  /** Valores de origem que levam a esta tag (comparados sem caixa e sem acento). */
  origens: string[];
  /** Origem com sufixo variável — o Caixa Rápido carimba a semana do utm. */
  prefixos?: string[];
}

export const REGRAS_POR_EMPRESA: Record<number, RegraTag[]> = {
  5: [
    { tag: 'Cliente Existente', origens: ['cliente_existente'] },
    { tag: 'Clube do Livro', origens: ['Clube do Livro'] },
    { tag: 'Desafio 52 Semanas', origens: ['Desafio 52 semanas'] },
    { tag: 'Embaixadores 5 Milhões', origens: ['Embaixadores 5 Milhões'] },
    { tag: 'Workshop Empreendedora Milionária', origens: ['Workshop Empreendedora Milionária'] },
    { tag: 'Caixa Rápido', origens: ['Caixa Rápido'], prefixos: ['Caixa Rápido - '] },
    { tag: 'Campanha Agosto', origens: ['Campanha Agosto'] },
    { tag: 'Treinamento Mapa do Empreendedor', origens: ['Treinamento Mapa Do Empreendedor'] },
    { tag: 'Treinamento Eu Sou Empreendedora', origens: ['Treinamento Eu Sou Empreendedora'] },
    { tag: 'Sucessores Club', origens: ['Sucessores Club'] },
    { tag: 'Workshop Lidere Sua Vida', origens: ['Workshop Lidere Sua Vida'] },
    { tag: 'Maratona Já É Permitido', origens: ['Maratona Já É Permitido'] },
    { tag: 'Leads E-mail', origens: ['Leads E-mail'] },
    { tag: 'Diagnóstico', origens: ['diagnostico'] },
    { tag: 'Indicação', origens: ['indicacao'] },
    { tag: 'Hotmart', origens: ['Hotmart'] },
    { tag: 'Networking', origens: ['networking'] },
    { tag: 'Instagram', origens: ['instagram'] },
    { tag: 'Parceria', origens: ['parceria'] },
    { tag: 'Site Escola', origens: ['Site Escola'] },
    { tag: 'Leadership (Form Site)', origens: ['Leadership (form site)'] },
    { tag: 'Site Leadership', origens: ['Site Leadership'] },
    { tag: 'Abandono de Carrinho', origens: ['Abandono carrinho'] },
  ],
};

/** Paleta das tags novas — a tag que já existe mantém a cor que tem. */
const CORES = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Origens que o card carrega: a gravada em `leads.origem` (primeiro toque) e as que os
 * blocos anexados nas notas provam. Bloco de Embaixadores fica de fora: o marcador é o
 * mesmo para "Campanha Agosto" e "Embaixadores 5 Milhões", e só a origem separa os dois.
 */
export function origensDoLead(origem: string | null, notas: string | null): string[] {
  const origens: string[] = origem ? [origem] : [];
  for (const bloco of lerNotas(notas)) {
    const campo = (chave: string) => bloco.campos.find((c) => c.chave === chave)?.valor || '';
    switch (bloco.integracao) {
      case 'caixa_rapido': origens.push('Caixa Rápido'); break;
      case 'sendflow':
        // Mesma decisão do webhook: o nome do grupo ou da campanha diz qual é.
        origens.push(campanhaDoEvento(campo('campanha'), campo('grupo'),
          { origem: 'Desafio 52 semanas', campanha: 'Desafio 52 semanas' }).origem);
        break;
      case 'hotmart': origens.push('Hotmart'); break;
      case 'hotmart_abandono': origens.push('Abandono carrinho'); break;
      case 'diagnostico': origens.push('diagnostico'); break;
      case 'leadership_form': origens.push('Leadership (form site)'); break;
    }
  }
  return origens;
}

/** Tags que o lead deve ter, sem repetição, na ordem das regras. */
export function tagsDoLead(empresaId: number, origem: string | null, notas: string | null): string[] {
  const regras = REGRAS_POR_EMPRESA[empresaId];
  if (!regras) return [];
  const origens = origensDoLead(origem, notas).map(normalizar);
  return regras
    .filter((r) =>
      origens.some((o) =>
        r.origens.some((x) => normalizar(x) === o) ||
        (r.prefixos || []).some((p) => o.startsWith(normalizar(p)))
      )
    )
    .map((r) => r.tag);
}

/**
 * Id de cada tag da empresa, criando a que falta. A que já existe com outra caixa
 * ("Clube do livro") é renomeada para a grafia da regra e mantém cor e leads.
 */
export async function idsDasTags(empresaId: number, nomes: string[]): Promise<Map<string, number>> {
  const dono = await query(
    `SELECT id FROM usuarios
      WHERE empresa_id = $1 AND ativo = true AND tipo_usuario IN ('creator', 'master')
      ORDER BY (tipo_usuario = 'creator') DESC, id LIMIT 1`,
    [empresaId]
  );
  const ids = new Map<string, number>();
  for (const [i, nome] of nomes.entries()) {
    const existente = await query(
      `SELECT id, nome FROM tags WHERE empresa_id = $1 AND lower(nome) = lower($2) ORDER BY id LIMIT 1`,
      [empresaId, nome]
    );
    if (existente.rows[0]) {
      if (existente.rows[0].nome !== nome) {
        await query(`UPDATE tags SET nome = $1 WHERE id = $2`, [nome, existente.rows[0].id]);
      }
      ids.set(nome, existente.rows[0].id);
      continue;
    }
    if (!dono.rows[0]) throw new Error(`empresa ${empresaId} sem creator/master ativo para ser dono das tags`);
    const criada = await query(
      `INSERT INTO tags (empresa_id, usuario_id, nome, cor) VALUES ($1, $2, $3, $4) RETURNING id`,
      [empresaId, dono.rows[0].id, nome, CORES[i % CORES.length]]
    );
    ids.set(nome, criada.rows[0].id);
  }
  return ids;
}

export interface ResultadoTagsOrigem {
  empresaId: number;
  leadsLidos: number;
  /** Pares (lead, tag) que entraram agora no card. */
  aplicadas: number;
}

/**
 * Aplica as tags de origem nos leads da empresa alterados nos últimos `minutos`
 * (null = todos, a carga inicial). Idempotente.
 */
export async function aplicarTagsDeOrigem(
  empresaId: number,
  minutos: number | null
): Promise<ResultadoTagsOrigem> {
  const regras = REGRAS_POR_EMPRESA[empresaId];
  if (!regras) return { empresaId, leadsLidos: 0, aplicadas: 0 };

  const leads = await query(
    `SELECT id, origem, notas FROM leads
      WHERE empresa_id = $1
        AND ($2::int IS NULL OR updated_at >= NOW() - make_interval(mins => $2::int))`,
    [empresaId, minutos]
  );

  const pares: Array<[number, string]> = [];
  for (const l of leads.rows) {
    for (const tag of tagsDoLead(empresaId, l.origem, l.notas)) pares.push([l.id, tag]);
  }
  if (!pares.length) return { empresaId, leadsLidos: leads.rows.length, aplicadas: 0 };

  const ids = await idsDasTags(empresaId, [...new Set(pares.map(([, t]) => t))]);

  let aplicadas = 0;
  for (let i = 0; i < pares.length; i += 5000) {
    const lote = pares.slice(i, i + 5000);
    const r = await query(
      `WITH novos AS (
         INSERT INTO lead_tags_origem (lead_id, tag_id)
         SELECT * FROM unnest($1::int[], $2::int[])
         ON CONFLICT DO NOTHING
         RETURNING lead_id, tag_id
       )
       INSERT INTO lead_tags (lead_id, tag_id)
       SELECT lead_id, tag_id FROM novos
       ON CONFLICT DO NOTHING
       RETURNING lead_id`,
      [lote.map(([l]) => l), lote.map(([, t]) => ids.get(t)!)]
    );
    aplicadas += r.rowCount || 0;
  }
  return { empresaId, leadsLidos: leads.rows.length, aplicadas };
}

export const EMPRESAS_COM_TAGS_DE_ORIGEM = Object.keys(REGRAS_POR_EMPRESA).map(Number);
