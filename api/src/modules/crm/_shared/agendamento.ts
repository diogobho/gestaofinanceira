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

export type ModoAgendamento = 'dias' | 'data' | 'imediato';

export interface AgendamentoParams {
  modo: ModoAgendamento;
  atrasoDias?: number | null;   // modo='dias': nº de dias após a base
  dataFixa?: string | null;     // modo='data': 'YYYY-MM-DD'
  horaEnvio?: string | null;    // 'HH:MM' exato do disparo
  diasSemana?: number[] | null; // 0=Dom..6=Sáb; vazio/null = todos os dias
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

/**
 * Calcula o instante (ISO/UTC) em que a mensagem deve ser disparada.
 *
 * - modo 'imediato': se a base cai num dia permitido, envia já (o próprio instante).
 *   Se cai num dia bloqueado, rola para o PRÓXIMO dia permitido no horaEnvio (fallback).
 * - modo 'dias': base (entrada no estágio / criação no lead) + atrasoDias, no horaEnvio.
 * - modo 'data': dataFixa, no horaEnvio.
 * - Se diasSemana for informado e o dia calculado não estiver nele, rola para o
 *   PRÓXIMO dia permitido mantendo o horaEnvio (ex.: sáb 09:30 + seg–sex → seg 09:30).
 */
export function calcularAgendadoPara(params: AgendamentoParams, base: Date = new Date()): string {
  const { modo, atrasoDias, dataFixa, horaEnvio, diasSemana } = params;

  // Imediato num dia permitido: envia já (o job a cada 1 min processa no próximo ciclo).
  // Num dia bloqueado, cai no cálculo abaixo (rola p/ próximo dia permitido no horaEnvio).
  if (modo === 'imediato' && diaSemanaPermitido(diasSemana, base)) {
    return base.toISOString();
  }

  // Data-calendário alvo, manipulada em UTC-midnight para a aritmética não sofrer com fuso local.
  let alvo: Date;
  if (modo === 'data' && dataFixa) {
    const [y, m, day] = dataFixa.split('-').map(Number);
    alvo = new Date(Date.UTC(y, m - 1, day));
  } else {
    const { y, m, day } = partesDataSP(base);
    alvo = new Date(Date.UTC(y, m - 1, day));
    alvo.setUTCDate(alvo.getUTCDate() + Math.max(0, Number(atrasoDias) || 0));
  }

  // Roll-forward para o próximo dia da semana permitido.
  if (diasSemana && diasSemana.length > 0) {
    let guarda = 0;
    while (!diasSemana.includes(alvo.getUTCDay()) && guarda < 14) {
      alvo.setUTCDate(alvo.getUTCDate() + 1);
      guarda++;
    }
  }

  const yyyy = alvo.getUTCFullYear();
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getUTCDate()).padStart(2, '0');
  const [hRaw, miRaw] = (horaEnvio || HORA_PADRAO).split(':');
  const hh = String(Number(hRaw) || 0).padStart(2, '0');
  const mi = String(Number(miRaw) || 0).padStart(2, '0');

  // Monta o instante na parede de São Paulo (offset fixo) e converte para UTC.
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00${TZ_OFFSET}`).toISOString();
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

  const mapa: Record<string, string> = {
    nome,
    primeironome: primeiroNome,
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
];
