/**
 * Produtividade do funil (30/09/2026) — o que a equipe fazia à mão pelo WhatsApp.
 *
 * Boca → FUP → Reunião → Oferta → Venda, por dia e no período, com as definições do
 * dono da Panteras:
 *
 *  - **Contato novo**: lead que recebeu a PRIMEIRA mensagem nossa no período (a primeira
 *    de toda a conversa NESTE funil, não a primeira do período). **Retorno**: ele respondeu depois.
 *  - **FUP**: todo contato com lead que já tinha recebido mensagem — qualquer saída depois
 *    do primeiro contato (manual, cadência, disparo, agente) — e toda tarefa `follow_up`
 *    concluída. O primeiro contato é a 1ª mensagem e o que sair até
 *    `JANELA_PRIMEIRO_CONTATO_MIN` depois dela. **Responderam**: mensagem dele depois do primeiro FUP.
 *  - **Reunião agendada / realizada**, **Oferta** (Reunião Realizada + Objeção +
 *    Fechamento), **Venda** (ganho) e **Perda** (etapa de perda):
 *    lead que ENTROU na etapa no período.
 *    O valor da venda é o da receita criada na conversão (`receitas.lead_origem_id`) —
 *    o `valor_potencial` do card fica vazio na prática —, com ele de reserva.
 *    As etapas são achadas pelo NOME (`marcosDoFunil`), porque o funil não tem campo
 *    para isso; etapa não achada volta em `marcosAusentes` e a tela avisa.
 *
 *  - **Um card, um indicador** (06/10, pedido do dono): no dia e no período o card cai só
 *    no indicador mais avançado que alcançou — Novo < FUP < Perda < Agendada < Oferta <
 *    Venda. Foi FUP e depois Objeção: conta só como Oferta. Assim os indicadores somam.
 *    Retornos e Resp. FUP são recortes dos seus grupos; Realizadas, um recorte das Ofertas.
 *  - **Contato**, não mensagem: mensagens a menos de `JANELA_PRIMEIRO_CONTATO_MIN` da
 *    anterior são o mesmo contato (rajada de texto + áudio, conversa em andamento).
 *  - **Situação de hoje** (`atual`): cards que ESTÃO agora em Agendada e nas etapas de
 *    Oferta — o acumulado real, que a contagem por entrada no período não mostra.
 *
 *  - **Pessoas faladas** (`trabalhados`, 06/10): quem teve CONTATO no dia — mensagem nossa
 *    (a primeira também). Tarefa concluída só conta (em FUP) se saiu mensagem no mesmo dia;
 *    card só movido ou anotado não conta.
 *  - **Lead transferido de outro funil** é contato NOVO aqui só se o responsável mudou
 *    (14/10): a conversa no funil começa na última transferência para ele (`entrou`). Com o
 *    mesmo responsável a conversa continua e a mensagem seguinte é FUP. **Responderam** (`responderam`): falou com a gente depois do contato do dia.
 *  - **Etapa só conta com contato e permanência** (06/10): card sem contato no período não
 *    entra em Agendada/Oferta/Perda, e a passagem relâmpago (saiu da etapa em menos de
 *    `PERMANENCIA_MIN_ETAPA_MIN`) não conta — a equipe arrasta Objeção → Perda → Nutrição
 *    em segundos para nutrir, e isso virava oferta. Venda conta sempre: o dinheiro entrou.
 *
 * Mensagem mandada pelo CELULAR conta: o chip conectado repassa o `fromMe` e o webhook
 * grava como saída manual. O que acontece com o chip desconectado não chega ao CRM.
 *
 * Hora da mensagem = `enviado_at` (a do WhatsApp), nunca `created_at`: importar o histórico
 * de um chip grava meses de conversa com a data da importação (02/10: 18.884 mensagens da
 * Jéssica; 05/10: 53.503 da Débora) e cada uma virava contato daquele dia.
 *
 * Tudo em horário de Brasília: as colunas são `timestamp` naive guardando UTC.
 * O recorte de lead é o funil de HOJE (`leads.funil_id`) e o responsável do lead.
 */

import { query } from '../../../config/database';

/**
 * O primeiro contato costuma sair em rajada (texto + áudio + texto). O que sai até
 * esta janela depois da primeira mensagem é o MESMO contato, não FUP — senão o lead
 * novo conta também como FUP no mesmo dia (05/10: 16 dos 20 novos da Hellen).
 */
export const JANELA_PRIMEIRO_CONTATO_MIN = 60;

// Telefone do card e a variante com/sem o 9º dígito (BR).
const TEL = `regexp_replace(coalesce(l.telefone, ''), '\\D', '', 'g')`;
const TEL_ALT = `CASE WHEN length(${TEL}) = 13 AND ${TEL} LIKE '55%' THEN substr(${TEL}, 1, 4) || substr(${TEL}, 6)
                      WHEN length(${TEL}) = 12 AND ${TEL} LIKE '55%' THEN substr(${TEL}, 1, 4) || '9' || substr(${TEL}, 5)
                      ELSE ${TEL} END`;

/**
 * Boas-vindas no privado que saiu pela fila do grupo, como mensagem nossa (`saida`), pelo
 * telefone do card. Antes de 06/10 ela não ia para o histórico — o lead abordado no
 * domingo pela automação não contava como Novo — e o card do grupo nasce sem contato
 * vinculado. A que saiu NO GRUPO (`erro` marcado) não é contato com a pessoa.
 */
const BOAS_VINDAS_PRIVADO = `
       SELECT lf.id AS lead_id, 'saida' AS direcao,
              (f.processado_em AT TIME ZONE 'America/Sao_Paulo') AS t
         FROM lf JOIN grupos_boas_vindas_fila f
           ON f.empresa_id = $1 AND f.status = 'enviado' AND f.erro IS NULL
          AND lf.tel <> '' AND split_part(f.participante_jid, '@', 1) IN (lf.tel, lf.tel_alt)
          AND (f.processado_em AT TIME ZONE 'UTC') >= lf.entrou`;

/**
 * Transferência só reinicia a conversa (lead vira contato NOVO no funil) quando o
 * responsável muda (creator da Panteras, 14/10/2026). Mesmo responsável: a conversa
 * segue e a próxima mensagem é FUP. A transferência grava `responsavel_anterior_id`
 * desde 14/10; a antiga, sem o campo, continua reiniciando como antes.
 */
const TRANSFERENCIA_QUE_REINICIA = `
       SELECT l.id, l.contato_whatsapp_id, ${TEL} AS tel, ${TEL_ALT} AS tel_alt,
              COALESCE((SELECT MAX(a.created_at) FROM atividades_lead a
                         WHERE a.lead_id = l.id AND a.tipo = 'transferencia_funil'
                           AND (a.dados->>'funil_novo_id')::int = $2
                           AND (NOT (a.dados ? 'responsavel_anterior_id')
                                OR (a.dados->>'responsavel_anterior_id')::int
                                   IS DISTINCT FROM COALESCE(l.responsavel_id, l.usuario_id))),
                       '-infinity'::timestamp) AS entrou`;

/** Menos que isso numa etapa é passagem a caminho de outra, não marco do funil. */
export const PERMANENCIA_MIN_ETAPA_MIN = 10;

const BRT = (col: string) => `(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`;

export interface EtapaFunil { id: number; nome: string; is_ganho: boolean; is_perdido?: boolean }

export interface MarcosFunil {
  agendada: number[];
  realizada: number[];
  oferta: number[];
  venda: number[];
  perda: number[];
}

function sem(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Etapas de cada marco, pelo nome. Oferta = reunião realizada + objeção + fechamento. */
export function marcosDoFunil(etapas: EtapaFunil[]): MarcosFunil {
  const por = (re: RegExp) => etapas.filter((e) => !e.is_perdido && re.test(sem(e.nome))).map((e) => e.id);
  const realizada = por(/reuniao.*realizad/);
  return {
    agendada: por(/reuniao.*agendad/),
    realizada,
    oferta: [...new Set([...realizada, ...por(/obje[cç]ao|fechamento/)])],
    venda: etapas.filter((e) => e.is_ganho).map((e) => e.id),
    perda: etapas.filter((e) => e.is_perdido).map((e) => e.id),
  };
}

export interface LinhaProdutividade {
  /** Pessoas faladas: contato no dia (mensagem nossa ou tarefa de follow-up/reunião concluída). */
  trabalhados: number;
  /** Das pessoas faladas, quantas responderam depois do contato. */
  responderam: number;
  contatos_novos: number;
  retornos: number;
  fup_leads: number;
  fup_responderam: number;
  /** Contatos de FUP por mensagem (rajada = 1), de todos os cards com FUP, não só do grupo FUP. */
  fup_mensagens: number;
  fup_tarefas: number;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  ofertas: number;
  vendas: number;
  valor_vendas: number;
  perdas: number;
}

export interface SituacaoAtual {
  agendadas: number;
  ofertas: number;
  etapas: Array<{ id: number; nome: string; leads: number; marco: 'agendada' | 'oferta' }>;
}

export interface Produtividade {
  periodo: { inicio: string; fim: string };
  atual: SituacaoAtual;
  total: LinhaProdutividade;
  diario: Array<LinhaProdutividade & { dia: string }>;
  marcosAusentes: Array<'reuniao_agendada' | 'reuniao_realizada' | 'oferta' | 'venda' | 'perda'>;
}

const vazia = (): LinhaProdutividade => ({
  trabalhados: 0, responderam: 0,
  contatos_novos: 0, retornos: 0, fup_leads: 0, fup_responderam: 0, fup_mensagens: 0,
  fup_tarefas: 0, reunioes_agendadas: 0, reunioes_realizadas: 0, ofertas: 0, vendas: 0, valor_vendas: 0, perdas: 0,
});

/** Primeiro e último dia do mês corrente em Brasília (`YYYY-MM-DD`). */
export function mesCorrente(agora = new Date()): { inicio: string; fim: string } {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const dois = (n: number) => String(n).padStart(2, '0');
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { inicio: `${y}-${dois(m + 1)}-01`, fim: `${y}-${dois(m + 1)}-${dois(ultimo)}` };
}

/** Do menos ao mais avançado: o card fica só no último que alcançou. */
export const ORDEM_INDICADORES = ['contatos_novos', 'fup_leads', 'perdas', 'reunioes_agendadas', 'ofertas', 'vendas'] as const;

/**
 * Um card, um indicador: tira de cada grupo os cards que estão num mais avançado.
 * Retornos e Resp. FUP seguem o grupo de origem; Realizadas ficam só dentro de Ofertas.
 */
export function umIndicadorPorCard(reg: Record<string, Set<number>>): void {
  const acima = new Set<number>();
  for (const k of [...ORDEM_INDICADORES].reverse()) {
    const grupo = new Set([...(reg[k] || [])].filter((id) => !acima.has(id)));
    reg[k] = grupo;
    grupo.forEach((id) => acima.add(id));
  }
  const dentro = (k: string, de: string) => { reg[k] = new Set([...(reg[k] || [])].filter((id) => reg[de].has(id))); };
  dentro('retornos', 'contatos_novos');
  dentro('fup_responderam', 'fup_leads');
  dentro('reunioes_realizadas', 'ofertas');
}

const dia = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function getProdutividade(
  empresaId: number,
  funilId: number,
  inicio: string,
  fim: string,
  responsavelId?: number
): Promise<Produtividade> {
  const etapas = await query(
    `SELECT e.id, e.nome, e.is_ganho, e.is_perdido
       FROM estagios_funil e JOIN funis f ON f.id = e.funil_id
      WHERE e.funil_id = $1 AND f.empresa_id = $2
      ORDER BY e.ordem`,
    [funilId, empresaId]
  );
  const marcos = marcosDoFunil(etapas.rows);
  const params = [empresaId, funilId, inicio, fim, responsavelId ?? null];
  const noPeriodo = (col: string) => `${col} >= $3::date AND ${col} < $4::date + 1`;

  // Mensagens e tarefas: uma linha por (lead, tipo, dia).
  const conversa = await query(
    `WITH lf AS (
       -- entrou: a última transferência PARA este funil. A conversa de antes era de outro
       -- funil; o 1º contato depois dela é contato NOVO aqui (boca de funil).
       ${TRANSFERENCIA_QUE_REINICIA}
         FROM leads l
        WHERE l.empresa_id = $1 AND l.funil_id = $2 AND ($5::int IS NULL OR l.responsavel_id = $5)
     ),
     m AS (
       SELECT lf.id AS lead_id, h.direcao, ${BRT('h.enviado_at')} AS t
         FROM lf JOIN historico_mensagens h ON h.contato_whatsapp_id = lf.contato_whatsapp_id
        WHERE NOT h.copia_indevida AND h.grupo_whatsapp_id IS NULL
          AND h.direcao IN ('saida', 'entrada') AND h.enviado_at >= lf.entrou
       UNION ALL
       ${BOAS_VINDAS_PRIVADO}
     ),
     prim AS (SELECT lead_id, MIN(t) AS p FROM m WHERE direcao = 'saida' GROUP BY lead_id),
     s AS (
       SELECT lead_id, t, LAG(t) OVER (PARTITION BY lead_id ORDER BY t) AS ant
         FROM m WHERE direcao = 'saida'
     ),
     resp AS (SELECT lead_id, MAX(t) AS u FROM m WHERE direcao = 'entrada' GROUP BY lead_id),
     toques AS (
       -- Só a mensagem que ABRE um contato: a anterior ficou a mais da janela.
       SELECT s.lead_id, s.t, 'mensagem' AS fonte
         FROM s JOIN prim USING (lead_id)
        WHERE s.t > prim.p + make_interval(mins => ${JANELA_PRIMEIRO_CONTATO_MIN})
          AND s.t > s.ant + make_interval(mins => ${JANELA_PRIMEIRO_CONTATO_MIN})
          AND ${noPeriodo('s.t')}
       UNION ALL
       -- Tarefa concluída só conta se houve contato: mensagem nossa no mesmo dia.
       SELECT tl.lead_id, ${BRT('tl.data_conclusao')}, 'tarefa'
         FROM tarefas_lead tl JOIN lf ON lf.id = tl.lead_id
        WHERE tl.tipo = 'follow_up' AND tl.status = 'concluida' AND tl.data_conclusao IS NOT NULL
          AND ${noPeriodo(BRT('tl.data_conclusao'))}
          AND EXISTS (SELECT 1 FROM m WHERE m.lead_id = tl.lead_id AND m.direcao = 'saida'
                         AND m.t::date = ${BRT('tl.data_conclusao')}::date)
     )
     SELECT 'novo' AS tipo, prim.lead_id, prim.p::date AS dia,
            COALESCE(resp.u > prim.p, false) AS respondeu, 0 AS msgs, 0 AS tarefas, prim.p AS primeiro
       FROM prim LEFT JOIN resp USING (lead_id)
      WHERE ${noPeriodo('prim.p')}
     UNION ALL
     SELECT 'fup', t.lead_id, t.t::date, COALESCE(MAX(resp.u) > MIN(t.t), false),
            COUNT(*) FILTER (WHERE t.fonte = 'mensagem'), COUNT(*) FILTER (WHERE t.fonte = 'tarefa'), MIN(t.t)
       FROM toques t LEFT JOIN resp USING (lead_id)
      GROUP BY t.lead_id, t.t::date`,
    params
  );

  // Pessoas faladas: uma linha por (lead, dia) com contato — mensagem nossa. Tarefa sem
  // mensagem não é contato; mover ou anotar o card também não.
  const trabalho = await query(
    `WITH lf AS (
       -- entrou: a última transferência PARA este funil. A conversa de antes era de outro
       -- funil; o 1º contato depois dela é contato NOVO aqui (boca de funil).
       ${TRANSFERENCIA_QUE_REINICIA}
         FROM leads l
        WHERE l.empresa_id = $1 AND l.funil_id = $2 AND ($5::int IS NULL OR l.responsavel_id = $5)
     ),
     contato AS (
       SELECT lf.id AS lead_id, ${BRT('h.enviado_at')} AS t
         FROM lf JOIN historico_mensagens h ON h.contato_whatsapp_id = lf.contato_whatsapp_id
        WHERE h.direcao = 'saida' AND NOT h.copia_indevida AND h.grupo_whatsapp_id IS NULL
          AND h.enviado_at >= lf.entrou AND ${noPeriodo(BRT('h.enviado_at'))}
       UNION ALL
       SELECT b.lead_id, b.t FROM (${BOAS_VINDAS_PRIVADO}) b WHERE ${noPeriodo('b.t')}
     ),
     dia AS (SELECT lead_id, t::date AS dia, MIN(t) AS t0 FROM contato GROUP BY 1, 2)
     SELECT d.lead_id, d.dia,
            EXISTS (SELECT 1 FROM lf JOIN historico_mensagens h ON h.contato_whatsapp_id = lf.contato_whatsapp_id
                     WHERE lf.id = d.lead_id AND h.direcao = 'entrada' AND NOT h.copia_indevida
                       AND h.grupo_whatsapp_id IS NULL AND ${BRT('h.enviado_at')} > d.t0) AS respondeu
       FROM dia d`,
    params
  );

  const todasEtapas = [...new Set([...marcos.agendada, ...marcos.oferta, ...marcos.venda, ...marcos.perda])];
  const entradas = todasEtapas.length
    ? await query(
        `WITH mov AS (
           SELECT a.lead_id, (a.dados->>'estagio_novo_id')::int AS estagio_id, a.created_at,
                  LEAD(a.created_at) OVER (PARTITION BY a.lead_id ORDER BY a.created_at, a.id) AS saiu
             FROM atividades_lead a JOIN leads l ON l.id = a.lead_id
            WHERE l.empresa_id = $1 AND l.funil_id = $2 AND ($5::int IS NULL OR l.responsavel_id = $5)
              AND a.tipo = 'mudanca_estagio'
         )
         SELECT mov.lead_id, mov.estagio_id,
                ${BRT('mov.created_at')}::date AS dia, COALESCE((SELECT SUM(r.valor) FROM receitas r WHERE r.lead_origem_id = l.id),
                         NULLIF(l.valor_potencial, 0), 0)::float AS valor
           FROM mov JOIN leads l ON l.id = mov.lead_id
          WHERE mov.estagio_id = ANY($6::int[])
            AND (mov.saiu IS NULL OR mov.saiu >= mov.created_at + make_interval(mins => ${PERMANENCIA_MIN_ETAPA_MIN})
                 OR mov.estagio_id = ANY($7::int[]))
            AND ${noPeriodo(BRT('mov.created_at'))}`,
        [...params, todasEtapas, marcos.venda]
      )
    : { rows: [] as any[] };

  // Contagem por lead distinto, no dia e no período.
  const porDia = new Map<string, Record<string, Set<number>>>();
  const noTotal: Record<string, Set<number>> = {};
  const somar = (d: string, chave: string, lead: number) => {
    if (!porDia.has(d)) porDia.set(d, {});
    const reg = porDia.get(d)!;
    (reg[chave] ||= new Set()).add(lead);
    (noTotal[chave] ||= new Set()).add(lead);
  };
  const extras = { msgs: new Map<string, number>(), tarefas: new Map<string, number>(), valor: new Map<string, number>() };
  const soma = (mapa: Map<string, number>, d: string, n: number) => mapa.set(d, (mapa.get(d) || 0) + n);

  // FUP "respondeu" no período vale pelo PRIMEIRO fup do lead no período.
  const primeiroFup = new Map<number, { t: number; respondeu: boolean }>();
  for (const r of conversa.rows) {
    const d = dia(r.dia);
    if (r.tipo === 'novo') {
      somar(d, 'contatos_novos', r.lead_id);
      if (r.respondeu) somar(d, 'retornos', r.lead_id);
    } else {
      somar(d, 'fup_leads', r.lead_id);
      if (r.respondeu) somar(d, 'fup_responderam', r.lead_id); // o total é refeito abaixo
      soma(extras.msgs, d, Number(r.msgs));
      soma(extras.tarefas, d, Number(r.tarefas));
      const t = new Date(r.primeiro).getTime();
      const atual = primeiroFup.get(r.lead_id);
      if (!atual || t < atual.t) primeiroFup.set(r.lead_id, { t, respondeu: !!r.respondeu });
    }
  }
  const falados = new Set<number>();
  for (const r of trabalho.rows) {
    somar(dia(r.dia), 'trabalhados', r.lead_id);
    if (r.respondeu) somar(dia(r.dia), 'responderam', r.lead_id);
    falados.add(r.lead_id);
  }
  const vendasValor = new Map<number, number>();
  for (const r of entradas.rows) {
    const d = dia(r.dia);
    // Card que ninguém falou no período não anda no funil — exceto a venda.
    if (!falados.has(r.lead_id) && !marcos.venda.includes(r.estagio_id)) continue;
    // Etapa que conta (com contato no período e permanência) é conversa daquele dia — a
    // reunião não passa pelo WhatsApp. Sem isso o dia não fecha: Faladas < soma dos grupos.
    somar(d, 'trabalhados', r.lead_id);
    if (marcos.agendada.includes(r.estagio_id)) somar(d, 'reunioes_agendadas', r.lead_id);
    if (marcos.realizada.includes(r.estagio_id)) somar(d, 'reunioes_realizadas', r.lead_id);
    if (marcos.oferta.includes(r.estagio_id)) somar(d, 'ofertas', r.lead_id);
    if (marcos.perda.includes(r.estagio_id)) somar(d, 'perdas', r.lead_id);
    if (marcos.venda.includes(r.estagio_id)) {
      if (!porDia.get(d)?.vendas?.has(r.lead_id)) soma(extras.valor, d, r.valor);
      somar(d, 'vendas', r.lead_id);
      vendasValor.set(r.lead_id, r.valor);
    }
  }

  for (const reg of porDia.values()) umIndicadorPorCard(reg);
  umIndicadorPorCard(noTotal);

  const linha = (reg: Record<string, Set<number>> | undefined): LinhaProdutividade => {
    const l = vazia();
    for (const k of Object.keys(l) as Array<keyof LinhaProdutividade>) {
      if (reg?.[k]) l[k] = reg[k].size;
    }
    return l;
  };

  const diario = [...porDia.keys()].sort().map((d) => ({
    dia: d,
    ...linha(porDia.get(d)),
    fup_mensagens: extras.msgs.get(d) || 0,
    fup_tarefas: extras.tarefas.get(d) || 0,
    valor_vendas: extras.valor.get(d) || 0,
  }));

  const total = linha(noTotal);
  // No total, quem comprou também recebeu oferta (16/10, pedido da creator da Panteras): 4 ofertas
  // e 2 vendas liam como 50% de conversão, quando eram 6 ofertas. O dia a dia segue um card, um indicador.
  total.ofertas += total.vendas;
  total.fup_responderam = [...primeiroFup.entries()]
    .filter(([lead, p]) => p.respondeu && noTotal.fup_leads?.has(lead)).length;
  total.fup_mensagens = diario.reduce((s, d) => s + d.fup_mensagens, 0);
  total.fup_tarefas = diario.reduce((s, d) => s + d.fup_tarefas, 0);
  total.valor_vendas = [...vendasValor.values()].reduce((s, v) => s + v, 0);

  // O acumulado real: quem está AGORA nas etapas de reunião agendada e de oferta.
  const etapasAtuais = [...new Set([...marcos.agendada, ...marcos.oferta])];
  const agora = etapasAtuais.length
    ? await query(
        `SELECT l.estagio_id, COUNT(*)::int AS n FROM leads l
          WHERE l.empresa_id = $1 AND l.funil_id = $2 AND ($3::int IS NULL OR l.responsavel_id = $3)
            AND NOT l.arquivado AND l.estagio_id = ANY($4::int[])
          GROUP BY l.estagio_id`,
        [empresaId, funilId, responsavelId ?? null, etapasAtuais]
      )
    : { rows: [] as any[] };
  const nAgora = new Map<number, number>(agora.rows.map((r: any) => [Number(r.estagio_id), Number(r.n)]));
  const etapasAtual = etapas.rows
    .filter((e: any) => etapasAtuais.includes(e.id))
    .map((e: any) => ({ id: e.id, nome: e.nome, leads: nAgora.get(e.id) || 0, marco: (marcos.agendada.includes(e.id) ? 'agendada' : 'oferta') as 'agendada' | 'oferta' }));
  const atual: SituacaoAtual = {
    agendadas: etapasAtual.filter((e) => e.marco === 'agendada').reduce((s, e) => s + e.leads, 0),
    ofertas: etapasAtual.filter((e) => e.marco === 'oferta').reduce((s, e) => s + e.leads, 0),
    etapas: etapasAtual,
  };

  const marcosAusentes: Produtividade['marcosAusentes'] = [];
  if (!marcos.agendada.length) marcosAusentes.push('reuniao_agendada');
  if (!marcos.realizada.length) marcosAusentes.push('reuniao_realizada');
  if (!marcos.oferta.length) marcosAusentes.push('oferta');
  if (!marcos.venda.length) marcosAusentes.push('venda');
  if (!marcos.perda.length) marcosAusentes.push('perda');

  return { periodo: { inicio, fim }, atual, total, diario, marcosAusentes };
}
