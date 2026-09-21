import { query } from '../../../config/database';
import {
  CATALOGO,
  DefinicaoIntegracao,
  ORIGENS_CONHECIDAS,
  ORIGENS_PREFIXOS,
  REGEX_NOTAS_SQL,
  integracaoDaOrigem,
} from './catalogo';
import { lerNotas } from './notas';

/** Teto de segurança: hoje a maior empresa tem ~1.100 linhas e 87 kB de notas. */
const MAX_LINHAS = 20000;

export interface ToqueIntegracao {
  integracao: string;
  /** `dd/mm/yyyy, hh:mm:ss` (São Paulo) — null no bloco que nasceu com o lead. */
  carimbo: string | null;
  titulo: string;
}

export interface LeadIntegracao {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  origem: string | null;
  /** Integração do PRIMEIRO toque (quem trouxe o lead). */
  integracao: string | null;
  /** Toda integração que tocou o card — é por aqui que o filtro casa. */
  integracoes: string[];
  toques: ToqueIntegracao[];
  funil_id: number | null;
  funil_nome: string | null;
  estagio_id: number | null;
  estagio_nome: string | null;
  estagio_cor: string | null;
  ganho: boolean;
  perdido: boolean;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  temperatura: string | null;
  valor_potencial: number;
  arquivado: boolean;
  /** ISO do timestamp gravado (UTC). */
  criado_em: string;
  /** Dia em São Paulo — `leads.created_at` é naive em UTC, e 02:33Z é ontem aqui. */
  criado_em_dia: string;
  /** `caixa_rapido.faturamento_hoje` → ['R$ 5k - R$ 10k']. Lista porque um card pode ter o mesmo toque duas vezes. */
  campos: Record<string, string[]>;
}

export interface CampoDisponivel {
  chave: string;
  rotulo: string;
  integracao: string;
  /** Quantos leads têm este campo preenchido. */
  leads: number;
  /** Quantos valores diferentes ele assume — o que separa "faixa de faturamento" de "texto livre". */
  valores: number;
}

export interface DashboardIntegracoes {
  gerado_em: string;
  /** Hoje em São Paulo, calculado no servidor: não confiar no relógio do navegador. */
  hoje: string;
  catalogo: (Omit<DefinicaoIntegracao, 'marcador' | 'marcadorCorpo'> & { origens: string[] })[];
  campos_disponiveis: CampoDisponivel[];
  leads: LeadIntegracao[];
  truncado: boolean;
}

const SQL = `
  SELECT
    l.id, l.nome, l.telefone, l.email, l.empresa, l.origem, l.notas,
    l.funil_id, f.nome  AS funil_nome,
    l.estagio_id, e.nome AS estagio_nome, e.cor AS estagio_cor,
    COALESCE(e.is_ganho, false)   AS ganho,
    COALESCE(e.is_perdido, false) AS perdido,
    l.responsavel_id, u.nome AS responsavel_nome,
    l.temperatura, l.valor_potencial, l.arquivado,
    l.created_at,
    (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS criado_em_dia
  FROM leads l
  LEFT JOIN funis          f ON f.id = l.funil_id
  LEFT JOIN estagios_funil e ON e.id = l.estagio_id
  LEFT JOIN usuarios       u ON u.id = l.responsavel_id
  WHERE l.empresa_id = $1
    AND (l.origem = ANY($2::text[]) OR l.origem LIKE ANY($4::text[]) OR l.notas ~ $3)
  ORDER BY l.created_at DESC
  LIMIT ${MAX_LINHAS + 1}
`;

function dia(valor: any): string {
  if (valor instanceof Date) {
    // A coluna já vem como date em São Paulo; o driver a monta à meia-noite local.
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(
      valor.getDate()
    ).padStart(2, '0')}`;
  }
  return String(valor ?? '').slice(0, 10);
}

export const integracoesService = {
  /**
   * Tudo que as integrações geraram para a empresa, já normalizado.
   *
   * Devolve a lista inteira de uma vez e **toda** filtragem é no cliente — são ~1.100
   * linhas e 87 kB na maior empresa, e trocar filtro sem ir à rede é o que faz o
   * dashboard responder na hora. O mesmo desenho do dashboard do Conta Azul.
   */
  async getDashboard(empresaId: number): Promise<DashboardIntegracoes> {
    const result = await query(SQL, [empresaId, ORIGENS_CONHECIDAS, REGEX_NOTAS_SQL, ORIGENS_PREFIXOS]);
    const truncado = result.rows.length > MAX_LINHAS;
    const linhas = truncado ? result.rows.slice(0, MAX_LINHAS) : result.rows;

    // rótulo por chave, para o dashboard mostrar "Faturamento hoje" e não "faturamento_hoje"
    const rotulos = new Map<string, string>();
    const leadsPorCampo = new Map<string, number>();
    const valoresPorCampo = new Map<string, Set<string>>();

    const leads: LeadIntegracao[] = linhas.map((r: any) => {
      const blocos = lerNotas(r.notas);
      const daOrigem = integracaoDaOrigem(r.origem, r.nome);

      const toques: ToqueIntegracao[] = blocos
        .filter((b) => b.integracao)
        .map((b) => ({ integracao: b.integracao!, carimbo: b.carimbo, titulo: b.titulo }));

      // O primeiro toque é a origem quando ela é conhecida; senão, o primeiro bloco
      // reconhecido — é o caso do lead importado que só depois recebeu um formulário.
      const principal = daOrigem ?? toques[0]?.integracao ?? null;

      const campos: Record<string, string[]> = {};
      for (const bloco of blocos) {
        // Bloco sem integração reconhecida fica de fora: seus rótulos são texto do
        // operador, e misturá-los com dado de webhook faria o explorador de campos
        // prometer estrutura onde não há.
        if (!bloco.integracao) continue;
        for (const campo of bloco.campos) {
          const chave = `${bloco.integracao}.${campo.chave}`;
          rotulos.set(chave, campo.rotulo);
          (campos[chave] ||= []).push(campo.valor);
        }
      }

      for (const [chave, valores] of Object.entries(campos)) {
        leadsPorCampo.set(chave, (leadsPorCampo.get(chave) ?? 0) + 1);
        const set = valoresPorCampo.get(chave) ?? new Set<string>();
        valores.forEach((v) => set.add(v));
        valoresPorCampo.set(chave, set);
      }

      const integracoes = Array.from(
        new Set([principal, ...toques.map((t) => t.integracao)].filter(Boolean) as string[])
      );

      return {
        id: r.id,
        nome: r.nome,
        telefone: r.telefone,
        email: r.email,
        empresa: r.empresa,
        origem: r.origem,
        integracao: principal,
        integracoes,
        toques,
        funil_id: r.funil_id,
        funil_nome: r.funil_nome,
        estagio_id: r.estagio_id,
        estagio_nome: r.estagio_nome,
        estagio_cor: r.estagio_cor,
        ganho: r.ganho,
        perdido: r.perdido,
        responsavel_id: r.responsavel_id,
        responsavel_nome: r.responsavel_nome,
        temperatura: r.temperatura,
        // numeric do pg chega como string, e "0.00" é truthy — sempre converter.
        valor_potencial: Number(r.valor_potencial) || 0,
        arquivado: r.arquivado,
        criado_em: new Date(r.created_at).toISOString(),
        criado_em_dia: dia(r.criado_em_dia),
        campos,
      };
    });

    const campos_disponiveis: CampoDisponivel[] = Array.from(rotulos.entries())
      .map(([chave, rotulo]) => ({
        chave,
        rotulo,
        integracao: chave.split('.')[0],
        leads: leadsPorCampo.get(chave) ?? 0,
        valores: valoresPorCampo.get(chave)?.size ?? 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    return {
      gerado_em: new Date().toISOString(),
      hoje,
      catalogo: CATALOGO.map(({ marcador, marcadorCorpo, ...resto }) => resto),
      campos_disponiveis,
      leads,
      truncado,
    };
  },
};
