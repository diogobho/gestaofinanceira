/**
 * Origem e classificação dos erros que sobem de um envio automático.
 *
 * ── Por que a origem viaja no Error ──────────────────────────────────────────
 * O follow-up scheduler decide o destino de um follow-up pelo erro que recebe, e
 * até 25/08/2026 essa decisão saía só do código HTTP: qualquer 403 casava com
 * "credencial de IA" e PAUSAVA os follow-ups da empresa inteira por 60min, com o
 * log mandando recarregar a API key. A origem é carimbada por quem levanta o erro
 * — é lá que se sabe de onde ele veio — e não adivinhada depois por heurística.
 *
 * ── O que a instância de WhatsApp devolve DE VERDADE ─────────────────────────
 * Conferido em `whatsapp-integration/api-multi-baileys.js` (25/08/2026). O `/send`
 * e o `/send-media` só produzem estes códigos:
 *
 *   503 { error: 'WhatsApp não conectado' }  → guard `if (!isReady)`
 *   400 { error: 'Número e mensagem são obrigatórios' }
 *   422 { error: 'Número sem conta no WhatsApp' }
 *   500 { error: 'Erro ao enviar mensagem', details }
 *
 * **403 NUNCA sai do `/send`.** O 403 é o `DisconnectReason.forbidden` do Baileys —
 * um código de DESCONEXÃO, classificado como `categoria: 'ban'` e exposto em
 * `GET /status` (`banido: true`) e no webhook que alimenta `whatsapp_conexao_eventos`.
 *
 * A consequência disso é o problema sério: **chip banido derruba `isReady`, e o
 * `/send` passa a responder 503** — o mesmo código de "instância reiniciando".
 * Tratar 503 como transitório puro significa re-tentar um número banido a cada
 * 15 minutos, para sempre. Por isso o 503 aqui é AMBÍGUO por definição: quem trata
 * precisa consultar o estado real do chip antes de decidir.
 */

export type OrigemErro = 'ia' | 'whatsapp';

/** Carimba a origem no erro (sem sobrescrever uma origem já existente) e o devolve. */
export function marcarOrigemErro<E>(err: E, origem: OrigemErro): E {
  const e = err as any;
  if (e && typeof e === 'object' && !e.origem) e.origem = origem;
  return err;
}

export function origemDoErro(err: any): OrigemErro | undefined {
  return err?.origem === 'ia' || err?.origem === 'whatsapp' ? err.origem : undefined;
}

/**
 * Código HTTP do erro. O axios re-lançado como Error simples perde `response.status`
 * e sobra só o texto ("Request failed with status code 503") — daí a extração do
 * texto como última tentativa.
 */
export function statusDoErro(err: any): number | undefined {
  const doTexto = Number(/status code (\d{3})/i.exec(err?.message || '')?.[1]) || undefined;
  return err?.status ?? err?.response?.status ?? doTexto;
}

/**
 * Categoria do problema. É ela — não o código HTTP — que define a política.
 *
 *   ia_credencial      credencial/saldo do provedor de IA. A fila inteira da empresa
 *                      cairia igual → pausa a empresa.
 *   canal_indefinido   o chip respondeu 503. Pode ser reinício (transitório) ou ban
 *                      (permanente): só o estado da instância desempata.
 *   canal_bloqueado    ban/logout confirmado no chip. Intervenção humana obrigatória.
 *   destino_invalido   número sem conta no WhatsApp / payload inválido. Definitivo.
 *   transitorio        rede, rate limit, sobrecarga, timeout.
 *   desconhecido       sem carimbo de origem: bug, erro de banco, terceiro.
 */
export type CategoriaErro =
  | 'ia_credencial'
  | 'canal_indefinido'
  | 'canal_bloqueado'
  | 'destino_invalido'
  | 'transitorio'
  | 'desconhecido';

export interface ErroClassificado {
  categoria: CategoriaErro;
  origem: OrigemErro | 'desconhecida';
  status?: number;
  msg: string;
}

/**
 * O provedor de IA recusou por CONTA, não por conteúdo: sem saldo, sem chave, chave
 * inválida, ou teto de gasto atingido. Todos têm o mesmo desfecho — a fila inteira da
 * empresa cairia igual, então o motor pausa a empresa em vez de queimar follow-up.
 *
 * `reached your specified api usage limits` é o teto de gasto configurado no console
 * da Anthropic, e ele chega como **400**, não 401/403:
 *
 *   400 invalid_request_error: "You have reached your specified API usage limits.
 *                               You will regain access on 2026-09-01 at 00:00 UTC."
 *
 * Sem esta frase aqui o erro caía em `desconhecido` — categoria que o motor trata como
 * falha DEFINITIVA, sem retry. Foi o que destruiu 97 follow-ups de 97 leads distintos
 * da Panteras entre 25 e 26/08/2026: a conta bateu o teto e, a cada ciclo, os
 * follow-ups do dia viravam `falhou` em vez de esperar o limite ser liberado.
 * Mesma classe do incidente de saldo zerado de 07/2026 (235 queimados), com texto novo.
 */
export function ehCredencialOuSaldoIA(status: number | undefined, msg: string): boolean {
  if (status === 401 || status === 403) return true;
  return /credit balance is too low|insufficient[_ ]quota|invalid x-api-key|authentication[_ ]error|permission[_ ]error|reached your specified api usage limits/i.test(msg);
}

export function ehErroTransitorio(status: number | undefined, msg: string): boolean {
  return status === 429 || status === 529 || status === 500 || status === 502
    || /overloaded|too many requests|timeout|etimedout|econnreset|econnrefused|socket hang up|eai_again/i.test(msg);
}

/** Número que comprovadamente não tem conta no WhatsApp, ou payload inválido. */
function ehDestinoInvalido(status: number | undefined, msg: string): boolean {
  if (status === 422 || status === 400) return true;
  return /sem conta no whatsapp|n[ãa]o tem conta no whatsapp/i.test(msg);
}

export function classificarErro(err: any): ErroClassificado {
  const msg: string = err?.message || '';
  const status = statusDoErro(err);
  const origem = origemDoErro(err) ?? 'desconhecida';
  const base: Omit<ErroClassificado, 'categoria'> = { origem, status, msg };

  if (origem === 'whatsapp') {
    if (ehDestinoInvalido(status, msg)) return { ...base, categoria: 'destino_invalido' };
    // 503 / "WhatsApp não conectado": o guard `!isReady` da instância. Cobre chip
    // reiniciando E chip banido — quem trata precisa olhar o estado real do chip.
    if (status === 503 || /whatsapp n[ãa]o conectado/i.test(msg)) {
      return { ...base, categoria: 'canal_indefinido' };
    }
    // 403 aqui não vem do /send (ver cabeçalho), mas se algum caminho do canal
    // produzir um, ele é bloqueio de canal — nunca credencial de IA.
    if (status === 403 || status === 401) return { ...base, categoria: 'canal_bloqueado' };
    if (ehErroTransitorio(status, msg)) return { ...base, categoria: 'transitorio' };
    return { ...base, categoria: 'desconhecido' };
  }

  if (origem === 'ia') {
    if (ehCredencialOuSaldoIA(status, msg)) return { ...base, categoria: 'ia_credencial' };
    if (ehErroTransitorio(status, msg)) return { ...base, categoria: 'transitorio' };
    return { ...base, categoria: 'desconhecido' };
  }

  // Sem carimbo: só o texto clássico de credencial/saldo pausa a empresa. Status 403
  // sozinho NÃO — foi exatamente esse atalho que fez bloqueio de chip ser lido como
  // saldo de IA.
  if (ehCredencialOuSaldoIA(undefined, msg)) return { ...base, categoria: 'ia_credencial' };
  if (ehErroTransitorio(status, msg)) return { ...base, categoria: 'transitorio' };
  return { ...base, categoria: 'desconhecido' };
}
