/**
 * Variáveis dos lembretes de reunião (06/10/2026, modelos do funil oficial da Escola).
 *
 * Os modelos REU-* pedem o dia, a hora, o link e, para quem faltou, "dois horários
 * prontos". Nada disso é campo do card — vem da tarefa de reunião:
 * - dia e hora: `data_vencimento` (já em São Paulo quando chega aqui);
 * - link: o primeiro https:// do título ou da descrição da tarefa ("Lance a reunião no
 *   card: dia, hora e link");
 * - dois horários: os dois próximos dias úteis, no MESMO horário da reunião perdida. É uma
 *   proposta, não uma reserva na agenda — quem responde confirma com o vendedor.
 */

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** '16:00' → '16h'; '16:30' → '16h30'. */
export function horaFalada(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return '';
  const h = String(Number(m[1]));
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}

function dataDe(isoDia: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDia ?? ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** '2026-10-14' → 'terça-feira, 14/10'. */
export function diaFalado(isoDia: string): string {
  const d = dataDe(isoDia);
  return d ? `${DIAS[d.getUTCDay()]}, ${ddmm(d)}` : '';
}

/** O primeiro link https:// do texto, sem pontuação colada no fim. */
export function linkDaTarefa(...textos: Array<string | null | undefined>): string {
  for (const t of textos) {
    const m = /https?:\/\/[^\s<>"']+/i.exec(String(t ?? ''));
    if (m) return m[0].replace(/[.,;:!?)\]]+$/, '');
  }
  return '';
}

/**
 * Os `n` próximos dias úteis depois de `hojeIso` (dia em São Paulo), no horário dado:
 * ['quarta (15/10) às 16h', 'quinta (16/10) às 16h'].
 */
export function proximosHorarios(hojeIso: string, hhmm: string, n = 2): string[] {
  const d = dataDe(hojeIso);
  const hora = horaFalada(hhmm);
  if (!d || !hora) return [];
  const out: string[] = [];
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(`${DIAS_CURTOS[dow]} (${ddmm(d)}) às ${hora}`);
  }
  return out;
}

export interface DadosReuniao {
  diaIso: string;    // 'YYYY-MM-DD' em São Paulo
  hora: string;      // 'HH:MM' em São Paulo
  data: string;      // 'DD/MM'
  hojeIso: string;   // hoje em São Paulo, para os horários de remarcação
  titulo?: string | null;
  descricao?: string | null;
}

/** Troca os tokens de reunião; os do lead ficam para `aplicarVariaveisLead`. */
export function aplicarVariaveisReuniao(texto: string, r: DadosReuniao): string {
  const [h1, h2] = proximosHorarios(r.hojeIso, r.hora, 2);
  const mapa: Record<string, string> = {
    horario: r.hora,
    data: r.data,
    diareuniao: diaFalado(r.diaIso),
    horareuniao: horaFalada(r.hora),
    linkreuniao: linkDaTarefa(r.descricao, r.titulo),
    horario1: h1 ?? '',
    horario2: h2 ?? '',
  };
  return String(texto ?? '').replace(/\[([a-zA-Z0-9_]+)\]/g, (todo, chave: string) => {
    const k = chave.toLowerCase().replace(/_/g, '');
    return k in mapa ? mapa[k] : todo;
  });
}
