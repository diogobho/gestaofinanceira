/**
 * Padrão único de agendamento de mensagens (estágio · lead · geral).
 *
 * Fonte de verdade do BACKEND para:
 *  - calcular o instante de disparo a partir do padrão (após X dias OU data fixa,
 *    em um horário exato, com roll-forward para o próximo dia da semana permitido);
 *  - substituir variáveis de personalização com os atributos do lead.
 *
 * Fuso fixo America/Sao_Paulo (Brasil não usa horário de verão desde 2019 → UTC-03:00).
 */

const TZ_OFFSET = '-03:00';
const HORA_PADRAO = '09:00';

export type ModoAgendamento = 'dias' | 'data';
export type UnidadeAtraso = 'minuto' | 'hora' | 'dia';

export interface AgendamentoParams {
  modo: ModoAgendamento;
  atrasoDias?: number | null;        // modo='dias': QUANTIDADE (X) do atraso
  atrasoUnidade?: UnidadeAtraso | null; // unidade do atraso; default 'dia'
  dataFixa?: string | null;          // modo='data': 'YYYY-MM-DD'
  horaEnvio?: string | null;         // 'HH:MM' — horário do envio (dia/data) ou fallback (minuto/hora)
  diasSemana?: number[] | null;      // 0=Dom..6=Sáb; vazio/null = todos os dias
}

/** Partes da data-calendário (ano/mês/dia) de um instante no fuso de São Paulo. */
function partesDataSP(d: Date): { y: number; m: number; day: number } {
  // en-CA formata como YYYY-MM-DD
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [y, m, day] = s.split('-').map(Number);
  return { y, m, day };
}

/** Rola a data (UTC-midnight de uma data-calendário SP) para o próximo dia da semana permitido. */
function rolarDiaPermitido(alvo: Date, diasSemana?: number[] | null): Date {
  if (diasSemana && diasSemana.length > 0) {
    let guarda = 0;
    while (!diasSemana.includes(alvo.getUTCDay()) && guarda < 14) {
      alvo.setUTCDate(alvo.getUTCDate() + 1);
      guarda++;
    }
  }
  return alvo;
}

/** Monta o instante (ISO/UTC) de uma data-calendário SP (UTC-midnight) no horário HH:MM. */
function montarInstanteSP(alvo: Date, horaEnvio?: string | null): string {
  const yyyy = alvo.getUTCFullYear();
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getUTCDate()).padStart(2, '0');
  const [hRaw, miRaw] = (horaEnvio || HORA_PADRAO).split(':');
  const hh = String(Number(hRaw) || 0).padStart(2, '0');
  const mi = String(Number(miRaw) || 0).padStart(2, '0');
  // Monta o instante na parede de São Paulo (offset fixo) e converte para UTC.
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00${TZ_OFFSET}`).toISOString();
}

/** Próximo dia permitido a partir de um instante, no horaEnvio (usado como fallback). */
function proximoDiaPermitidoNoHorario(aPartirDe: Date, diasSemana?: number[] | null, horaEnvio?: string | null): string {
  const { y, m, day } = partesDataSP(aPartirDe);
  const alvo = rolarDiaPermitido(new Date(Date.UTC(y, m - 1, day)), diasSemana);
  return montarInstanteSP(alvo, horaEnvio);
}

/**
 * Calcula o instante (ISO/UTC) em que a mensagem deve ser disparada.
 *
 * - modo 'dias', unidade 'dia': base + X dias, no horaEnvio (com roll-forward no horaEnvio).
 * - modo 'dias', unidade 'minuto'/'hora': base + X no instante EXATO. Se esse instante cai
 *   num dia bloqueado, rola para o próximo dia permitido no horaEnvio (fallback).
 *   → "Após 0 minutos" é o envio imediato (na entrada).
 * - modo 'data': dataFixa, no horaEnvio (com roll-forward).
 * - Se diasSemana for informado e o dia calculado não estiver nele, rola para o
 *   PRÓXIMO dia permitido (ex.: sáb + seg–sex → seg no horaEnvio).
 */
export function calcularAgendadoPara(params: AgendamentoParams, base: Date = new Date()): string {
  const { modo, atrasoDias, atrasoUnidade, dataFixa, horaEnvio, diasSemana } = params;

  // Modo 'data': naquela data-calendário, no horaEnvio, com roll-forward.
  if (modo === 'data' && dataFixa) {
    const [y, m, day] = dataFixa.split('-').map(Number);
    const alvo = rolarDiaPermitido(new Date(Date.UTC(y, m - 1, day)), diasSemana);
    return montarInstanteSP(alvo, horaEnvio);
  }

  // Modo 'dias' (Após X unidade).
  const qtd = Math.max(0, Number(atrasoDias) || 0);
  const unidade: UnidadeAtraso = atrasoUnidade || 'dia';

  // minuto/hora: instante exato (base + X). Dia permitido → dispara no instante;
  // dia bloqueado → próximo dia permitido no horaEnvio (fallback).
  if (unidade === 'minuto' || unidade === 'hora') {
    const ms = unidade === 'hora' ? 3_600_000 : 60_000;
    const instante = new Date(base.getTime() + qtd * ms);
    return diaSemanaPermitido(diasSemana, instante)
      ? instante.toISOString()
      : proximoDiaPermitidoNoHorario(instante, diasSemana, horaEnvio);
  }

  // dia: base + X dias, no horaEnvio, com roll-forward.
  const { y, m, day } = partesDataSP(base);
  const alvo = new Date(Date.UTC(y, m - 1, day));
  alvo.setUTCDate(alvo.getUTCDate() + qtd);
  return montarInstanteSP(rolarDiaPermitido(alvo, diasSemana), horaEnvio);
}

/**
 * Cadência de vários toques por estágio.
 *
 * Cada passo tem os mesmos parâmetros de agendamento + uma `base`:
 *   - 'entrada'  → conta a partir da entrada do lead no estágio (base da cadência);
 *   - 'anterior' → conta a partir do horário AGENDADO do passo anterior (encadeado).
 * O primeiro passo é sempre relativo à entrada (não existe "anterior").
 */
export interface PassoCadencia extends AgendamentoParams {
  base?: 'entrada' | 'anterior';
}

/**
 * Extrai a lista de passos de um followup_config (JSONB do estágio).
 * Retrocompatível: um config no shape antigo (objeto único, sem `passos`) vira uma
 * cadência de 1 passo com base 'entrada'. Retorna [] se não houver config utilizável.
 */
export function extrairPassosFollowup(cfg: any): any[] {
  if (!cfg) return [];
  if (Array.isArray(cfg.passos)) return cfg.passos;
  // Shape antigo: o próprio config é o passo único.
  return [{ ...cfg, base: 'entrada' }];
}

/**
 * Calcula os instantes de disparo de uma cadência a partir da entrada no estágio.
 * Passos com base 'anterior' encadeiam sobre o instante agendado do passo anterior.
 * Retorna, para cada passo, o instante (ISO/UTC) e sua ordem (0 = primeiro).
 */
export function calcularCadencia(
  passos: PassoCadencia[],
  entrada: Date = new Date()
): Array<{ agendadoPara: string; ordem: number }> {
  const out: Array<{ agendadoPara: string; ordem: number }> = [];
  let anterior: Date | null = null;
  passos.forEach((p, i) => {
    const baseRef = p.base === 'anterior' && anterior ? anterior : entrada;
    const agendadoPara = calcularAgendadoPara(p, baseRef);
    out.push({ agendadoPara, ordem: i });
    anterior = new Date(agendadoPara);
  });
  return out;
}

/** Um toque de cadência como gravado em `followups_agendados`. */
export interface ToqueCadencia {
  id?: number;
  passo_ordem: number | null;
  agendado_para?: Date | string;
  modo?: string | null;
  atraso_dias?: number | null;
  atraso_unidade?: string | null;
  hora_envio?: string | null;
  dias_semana?: number[] | null;
}

const MINUTOS_POR_UNIDADE: Record<string, number> = { minuto: 1, hora: 60, dia: 1440 };

/**
 * Depois que um passo de cadência sai, os seguintes contam o intervalo a partir do
 * ENVIO REAL, não do horário desenhado lá atrás (#77, 15/09/2026). Função pura: devolve
 * só os toques que precisam andar, com o novo instante.
 *
 * Um passo que atrasa dias (IA sem crédito, chip fora do ar) segura os seguintes pela
 * guarda de ordem — mas eles mantinham o horário original, e quando o primeiro enfim
 * saía, os outros já estavam vencidos e iam atrás dele com um minuto de intervalo.
 *
 * O intervalo preservado é o da cadência: base 'anterior' → o próprio atraso do passo;
 * base 'entrada' → a diferença entre o atraso dele e o do anterior. Só EMPURRA para
 * frente — no fluxo em dia o alvo coincide com o horário que já estava lá. Data fixa é
 * absoluta e fica como está.
 */
export function reancorarCadencia(
  enviado: ToqueCadencia,
  seguintes: ToqueCadencia[],
  passosCfg: Array<{ base?: string } | undefined>,
  enviadoEm: Date
): Array<{ id: number; agendadoPara: Date }> {
  const emDias = (x: ToqueCadencia) => (x.modo || 'dias') === 'dias';
  let anterior = {
    instante: enviadoEm,
    atraso: emDias(enviado) ? Number(enviado.atraso_dias) || 0 : null as number | null,
    unidade: enviado.atraso_unidade || 'dia',
  };
  const mover: Array<{ id: number; agendadoPara: Date }> = [];

  for (const t of [...seguintes].sort((a, b) => (a.passo_ordem ?? 0) - (b.passo_ordem ?? 0))) {
    const atual = new Date(t.agendado_para as any);
    const unidade = t.atraso_unidade || 'dia';
    const atraso = Number(t.atraso_dias) || 0;

    if (!emDias(t)) {
      anterior = { instante: atual, atraso: null, unidade };
      continue;
    }

    const base = passosCfg[t.passo_ordem ?? -1]?.base === 'anterior' ? 'anterior' : 'entrada';
    let gap: { qtd: number; unidade: UnidadeAtraso } | null;
    if (base === 'anterior') gap = { qtd: atraso, unidade: unidade as UnidadeAtraso };
    else if (anterior.atraso == null) gap = null;
    else if (anterior.unidade === unidade) gap = { qtd: atraso - anterior.atraso, unidade: unidade as UnidadeAtraso };
    else gap = {
      qtd: atraso * (MINUTOS_POR_UNIDADE[unidade] ?? 1440) - anterior.atraso * (MINUTOS_POR_UNIDADE[anterior.unidade] ?? 1440),
      unidade: 'minuto',
    };

    let novo = atual;
    if (gap && gap.qtd > 0) {
      const alvo = new Date(calcularAgendadoPara({
        modo: 'dias', atrasoDias: gap.qtd, atrasoUnidade: gap.unidade,
        horaEnvio: t.hora_envio, diasSemana: t.dias_semana,
      }, anterior.instante));
      if (alvo.getTime() > atual.getTime() && t.id != null) {
        mover.push({ id: t.id, agendadoPara: alvo });
        novo = alvo;
      }
    }
    anterior = { instante: novo, atraso, unidade };
  }
  return mover;
}

/** Retorna true se o instante atual (fuso SP) cai num dos dias da semana permitidos. */
export function diaSemanaPermitido(diasSemana: number[] | null | undefined, agora: Date = new Date()): boolean {
  if (!diasSemana || diasSemana.length === 0) return true;
  const diaSP = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  return diasSemana.includes(diaSP);
}

/**
 * Substitui as variáveis de personalização do template pelos atributos do lead.
 * Aceita qualquer linha de `leads` (Record). Tokens são case-insensitive: [Nome], [nome]...
 * Variáveis sem valor viram string vazia.
 */
export function aplicarVariaveisLead(template: string, lead: Record<string, any> | null | undefined): string {
  if (!template) return template;
  const l = lead || {};
  const nome = String(l.nome ?? '').trim();
  const primeiroNome = nome.split(/\s+/)[0] || nome;

  const valorPotencial = l.valor_potencial != null && Number(l.valor_potencial) > 0
    ? Number(l.valor_potencial).toLocaleString('pt-BR', { style: 'currency', currency: l.moeda || 'BRL' })
    : '';

  // Quem assina a mensagem é o RESPONSÁVEL do lead (é pelo WhatsApp dele que ela sai),
  // não quem criou o follow-up. Depende de a query trazer `responsavel_nome`.
  const responsavel = String(l.responsavel_nome ?? '').trim();

  const mapa: Record<string, string> = {
    nome,
    primeironome: primeiroNome,
    responsavel,
    primeironomeresponsavel: responsavel.split(/\s+/)[0] || responsavel,
    telefone: String(l.telefone ?? ''),
    email: String(l.email ?? ''),
    empresa: String(l.empresa ?? ''),
    cargo: String(l.cargo ?? ''),
    titulo: String(l.titulo ?? ''),
    valorpotencial: valorPotencial,
    origem: String(l.origem ?? ''),
    cpfcnpj: String(l.cpf_cnpj ?? ''),
    temperatura: String(l.temperatura ?? ''),
  };

  return template.replace(/\[([a-zA-ZÀ-ÿ_]+)\]/g, (full, chave: string) => {
    const k = chave.toLowerCase().replace(/_/g, '');
    return k in mapa ? mapa[k] : full;
  });
}

/** Lista das variáveis disponíveis (para exibir como "chips" no frontend). */
export const VARIAVEIS_DISPONIVEIS = [
  'Nome', 'PrimeiroNome', 'Telefone', 'Email', 'Empresa',
  'Cargo', 'Titulo', 'ValorPotencial', 'Origem', 'CpfCnpj', 'Temperatura',
  'Responsavel', 'PrimeiroNomeResponsavel',
];

// ─── Janela operacional de envio ──────────────────────────────────────────────
//
// Regra única de "quando é permitido enviar" para TODA automação de saída
// (follow-up agendado e agente reativo). Antes o agente reativo tinha uma janela
// fixa de 08h–20h escrita na fila e o follow-up não tinha janela nenhuma: um
// follow-up adiado várias vezes (conversa viva, chip fora do ar) escorregava para
// as 22h ou para o domingo, porque `adiar` só somava minutos a NOW().
//
// A janela é por empresa (empresas.config) e tem três partes: horário de início,
// horário de fim e dias da semana. Os `dias_semana` do PASSO continuam valendo e
// são interseccionados com os dias da janela — o passo pode restringir mais, nunca
// ampliar. Interseção vazia (passo só sábado, janela só dias úteis) cairia num
// bloqueio permanente, então nesse caso vale a janela da empresa e o passo é
// ignorado: melhor enviar em dia útil do que nunca enviar.

export interface JanelaOperacional {
  inicio: string;            // 'HH:MM' — primeiro minuto permitido
  fim: string;               // 'HH:MM' — primeiro minuto NÃO permitido (exclusivo)
  dias?: number[] | null;    // 0=Dom..6=Sáb; vazio/null = todos os dias
}

export const JANELA_PADRAO: JanelaOperacional = { inicio: '08:00', fim: '20:00', dias: null };

/** 'HH:MM' → minutos desde a meia-noite. Entrada inválida devolve `fallback`. */
export function minutosDoDia(hhmm: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 24 || mi > 59) return fallback;
  return Math.min(24 * 60, h * 60 + mi);
}

/** minutos desde a meia-noite → 'HH:MM' */
function paraHHMM(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Normaliza a janela vinda da configuração: horários fora de formato, fim <= início
 * ou lista de dias inválida voltam ao padrão. Uma janela quebrada no banco não pode
 * travar a fila inteira — sem isso, `fim = 00:00` significaria "nunca enviar".
 */
export function normalizarJanela(bruta?: Partial<JanelaOperacional> | null): JanelaOperacional {
  const inicioMin = minutosDoDia(bruta?.inicio, minutosDoDia(JANELA_PADRAO.inicio, 480));
  let fimMin = minutosDoDia(bruta?.fim, minutosDoDia(JANELA_PADRAO.fim, 1200));
  if (fimMin <= inicioMin) {
    return { ...JANELA_PADRAO, dias: normalizarDias(bruta?.dias) };
  }
  return { inicio: paraHHMM(inicioMin), fim: paraHHMM(fimMin), dias: normalizarDias(bruta?.dias) };
}

/** Lista de dias válida (0..6, sem repetição) ou null para "todos os dias". */
export function normalizarDias(dias?: number[] | null): number[] | null {
  if (!Array.isArray(dias)) return null;
  const limpos = [...new Set(dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return limpos.length > 0 && limpos.length < 7 ? limpos.sort((a, b) => a - b) : null;
}

/** Data-calendário + hora de um instante, na parede de São Paulo. */
function partesSP(d: Date): { y: number; m: number; day: number; minutos: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const parte = (t: string) => Number(fmt.find((p) => p.type === t)?.value);
  const y = parte('year');
  const m = parte('month');
  const day = parte('day');
  // hour12:false pode devolver "24" para a meia-noite em alguns runtimes.
  const hora = parte('hour') % 24;
  const minutos = hora * 60 + parte('minute');
  // getUTCDay de uma data-calendário montada em UTC dá o dia da semana daquela data.
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { y, m, day, minutos, dow };
}

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Lista de dias em português, para mensagem de erro legível. */
export function nomearDias(dias?: number[] | null): string {
  const d = normalizarDias(dias);
  if (!d) return 'todos os dias';
  return d.map((x) => NOME_DIA[x]).join(', ');
}

/**
 * Dias permitidos = interseção (janela da empresa ∩ dias do passo).
 *
 * A janela da empresa é o LIMITE EXTERNO (política de quando se pode falar com o
 * lead); os dias do passo restringem dentro dele. Interseção vazia — passo só no
 * sábado com janela de segunda a sexta — é **conflito de configuração**, não um
 * caso a ser resolvido por padrão: devolve `null` e quem chama decide.
 *
 * Até 25/08/2026 a interseção vazia caía silenciosamente na janela da empresa. Ou
 * seja: um passo configurado para sábado era enviado numa segunda-feira, sem que
 * nada na tela ou no log dissesse que a configuração tinha sido ignorada. Silêncio
 * é o pior desfecho aqui — o administrador não descobre que a regra dele não vale.
 */
export function diasEfetivos(
  janela: JanelaOperacional,
  diasPasso?: number[] | null
): number[] | null | 'conflito' {
  const daJanela = normalizarDias(janela.dias);
  const doPasso = normalizarDias(diasPasso);
  if (!daJanela) return doPasso;
  if (!doPasso) return daJanela;
  const inter = daJanela.filter((d) => doPasso.includes(d));
  return inter.length > 0 ? inter : 'conflito';
}

/** Há conflito irreconciliável entre os dias da janela e os dias do passo? */
export function conflitoDeDias(janela: JanelaOperacional, diasPasso?: number[] | null): boolean {
  return diasEfetivos(normalizarJanela(janela), diasPasso) === 'conflito';
}

/** Texto do conflito, para o erro que o administrador vai ler. */
export function descreverConflitoDias(
  janela: JanelaOperacional,
  diasPasso?: number[] | null
): string {
  return `Conflito de configuração: o passo está limitado a ${nomearDias(diasPasso)}, ` +
    `mas a janela de envio da empresa só permite ${nomearDias(normalizarJanela(janela).dias)}. ` +
    `Não há dia em comum — ajuste os dias do passo ou a janela da empresa.`;
}

/** O instante cai dentro da janela operacional (hora e dia da semana)? */
export function dentroDaJanela(
  instante: Date,
  janela: JanelaOperacional,
  diasPasso?: number[] | null
): boolean {
  const j = normalizarJanela(janela);
  const { minutos, dow } = partesSP(instante);
  const dias = diasEfetivos(j, diasPasso);
  // Conflito de configuração nunca é "dentro da janela": quem chama tem de tratá-lo
  // como conflito (ver conflitoDeDias), não deixar o envio escapar por um default.
  if (dias === 'conflito') return false;
  if (dias && !dias.includes(dow)) return false;
  return minutos >= minutosDoDia(j.inicio, 0) && minutos < minutosDoDia(j.fim, 1440);
}

/**
 * Próximo instante >= `instante` que cai dentro da janela.
 * Já dentro da janela → devolve o próprio instante (o horário desenhado é respeitado
 * ao minuto; a janela só empurra o que está fora dela).
 * Fora da janela → abertura do próximo dia permitido, com `jitterMax` minutos de
 * folga aleatória para a fila não sair em rajada exata na abertura.
 */
export function proximaJanelaValida(
  instante: Date,
  janela: JanelaOperacional,
  diasPasso?: number[] | null,
  jitterMax = 0
): Date {
  const j = normalizarJanela(janela);
  if (dentroDaJanela(instante, j, diasPasso)) return new Date(instante);

  const diasOuConflito = diasEfetivos(j, diasPasso);
  // Em conflito não existe "próxima janela válida" — devolver uma data seria escolher
  // um dia que o administrador não autorizou. Quem chama checa conflitoDeDias antes.
  if (diasOuConflito === 'conflito') {
    throw new Error(descreverConflitoDias(j, diasPasso));
  }
  const dias = diasOuConflito;
  const inicioMin = minutosDoDia(j.inicio, 0);
  const { y, m, day, minutos } = partesSP(instante);

  // Antes da abertura no MESMO dia (se o dia for permitido) → abre hoje; senão, amanhã.
  const alvo = new Date(Date.UTC(y, m - 1, day));
  if (minutos >= inicioMin) alvo.setUTCDate(alvo.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (!dias || dias.includes(alvo.getUTCDay())) break;
    alvo.setUTCDate(alvo.getUTCDate() + 1);
  }

  const yyyy = alvo.getUTCFullYear();
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getUTCDate()).padStart(2, '0');
  const abertura = new Date(`${yyyy}-${mm}-${dd}T${j.inicio.padStart(5, '0')}:00${TZ_OFFSET}`);
  const jitter = jitterMax > 0 ? Math.floor(Math.random() * jitterMax) * 60_000 : 0;
  return new Date(abertura.getTime() + jitter);
}
