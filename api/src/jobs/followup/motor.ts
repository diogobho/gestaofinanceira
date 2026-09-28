/**
 * Motor do follow-up: um ciclo de processamento da fila.
 *
 * Vive separado do cron de propósito. O arquivo do job registra `cron.schedule` no
 * import, o que torna impossível exercitá-lo em teste sem ligar o agendador de
 * verdade. Aqui não há efeito colateral de import: tudo que toca o mundo — banco,
 * WhatsApp, provedor de IA, relógio — entra por `PortasMotor`, e os testes de
 * cenário injetam dublês.
 *
 * ── Garantias ───────────────────────────────────────────────────────────────
 * 1. NÃO DUPLICAR: só envia quem vence o claim atômico (`reclamar`). Se o processo
 *    morrer entre o envio e a marcação, o registro fica 'processando' e o reaper
 *    decide pela EVIDÊNCIA no histórico, não por palpite.
 * 2. NÃO PERDER: erro transitório adia, não queima. Nada é descartado em silêncio.
 * 3. NÃO TRAVAR: orçamento por follow-up e orçamento por ciclo. Nenhuma etapa
 *    segura a fila indefinidamente.
 * 4. NÃO REPETIR PARA SEMPRE: teto de tentativas em toda categoria com retry, e
 *    disjuntor por chip para não martelar um número bloqueado.
 * 5. RESPEITAR O HORÁRIO: data/hora do passo, intervalo anti-ban e janela operacional.
 * 6. MANUAL NÃO BLOQUEIA: o espaçamento conta só mensagem automática.
 * 7. ISOLAMENTO: fila por empresa e, dentro dela, por chip; um chip parado não
 *    segura outro, uma empresa não segura outra.
 */

import {
  dentroDaJanela, proximaJanelaValida, conflitoDeDias, descreverConflitoDias,
  JanelaOperacional, JANELA_PADRAO,
} from '../../modules/crm/_shared/agendamento';
import { DiagnosticoChip } from '../../modules/crm/_shared/chip';
import { classificarErro, CategoriaErro } from '../../shared/erros';

// ─── Constantes de política ───────────────────────────────────────────────────

/** Conversa viva / erro transitório: volta em pouco tempo. */
export const ADIAR_CURTO_MIN = 15;
/** Estado de sistema (saldo, credencial, agente desligado): exige intervenção humana. */
export const ADIAR_SISTEMA_MIN = 60;
/** Chip reconectando: espera maior, mas ainda automática. */
export const ADIAR_CANAL_MIN = 30;

/**
 * Teto de tentativas com falha. Sem ele, um chip banido — que responde 503, o mesmo
 * código de "instância reiniciando" — seria re-tentado a cada 15 minutos para
 * sempre, e a fila daquele responsável ficaria eternamente "quase indo".
 * Ao estourar, o follow-up vira 'falhou' com o motivo acumulado e aparece na tela.
 */
export const MAX_TENTATIVAS = 8;

/**
 * Orçamento de UM follow-up, do claim ao envio. Cobre tudo: consultas ao banco,
 * chamada ao provedor de IA, leitura de mídia, POST na instância. Não adianta o LLM
 * ter timeout de 45s se a leitura de um vídeo de 20MB ou um lock no Postgres puder
 * prender o ciclo por minutos.
 */
export const ORCAMENTO_FOLLOWUP_MS = 90_000;

/** Orçamento do ciclo. O cron dispara a cada minuto; parar antes mantém os dados frescos. */
export const ORCAMENTO_CICLO_MS = 55_000;

// ─── Portas ───────────────────────────────────────────────────────────────────

export type ResultadoDespacho =
  | 'enviado'          // a mensagem saiu
  | 'adiado'           // conversa viva — tentar mais tarde
  | 'cancelado'        // agente desativado para este lead
  | 'pausado'          // agente DESLIGADO ou sem API key: alguém pode religar hoje
  | 'config_ausente'   // empresa sem linha em agente_ia_config: não se resolve esperando
  | 'sem_destino'      // lead sem telefone/contato utilizável
  | 'sem_conteudo'     // follow-up sem texto e sem mídia
  | 'sem_capacidade'   // o plano não inclui falar primeiro com quem nunca escreveu
  | 'so_oficial'       // o plano inclui, mas o chip do responsável é QR Code
  | 'sem_modelo';      // número oficial, janela fechada e passo sem modelo de reserva

export interface PortaFollowups {
  buscarPendentes(limite?: number): Promise<any[]>;
  reclamar(id: number): Promise<boolean>;
  liberarClaim(id: number, novoInstante?: Date): Promise<void>;
  adiarPara(id: number, instante: Date): Promise<void>;
  marcarEnviado(id: number): Promise<boolean>;
  marcarFalhou(id: number, erro: string, categoria?: string): Promise<void>;
  registrarTentativa(id: number, categoria: string, erro: string): Promise<number>;
  cancelar(id: number, empresaId: number): Promise<any>;
  podeEnviarPassoEstagio(leadId: number, passoOrdem: number | null): Promise<boolean>;
  /** Toques que falharam com o chip fora do ar e ainda são a vez deles na cadência. */
  falhasDeCanalRetomaveis(): Promise<Array<{ id: number; chip: number }>>;
  retomarFalhasDeCanal(ids: number[]): Promise<number>;
  /** Reajusta os passos seguintes da cadência a partir do envio real deste. Devolve os ids movidos. */
  reancorarPassosSeguintes(enviado: any, enviadoEm: Date): Promise<number[]>;
  intervalosFollowupPorEmpresa(): Promise<Record<number, { min: number; max: number }>>;
  ultimoEnvioAutomaticoPorChip(): Promise<Record<number, number>>;
  resolverClaimsOrfaos(idadeMinutos?: number): Promise<{ enviados: number; devolvidos: number }>;
  cancelarPorLeadArquivado(): Promise<number>;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface PortasMotor {
  followups: PortaFollowups;
  janelas(): Promise<Record<number, JanelaOperacional>>;
  /** Executa o envio (manual ou via agente). Lança em falha de envio. */
  despachar(followup: any): Promise<ResultadoDespacho>;
  /** Move o lead para o estágio de "após envio", quando configurado. */
  aposEnvio(followup: any): Promise<void>;
  diagnosticarChip(usuarioId: number): Promise<DiagnosticoChip>;
  agora(): number;
  esperar(ms: number): Promise<void>;
  aleatorio(min: number, max: number): number;
  logger: Logger;
  /** Sobrescreve os orçamentos (os testes usam valores curtos). */
  orcamentoFollowupMs?: number;
  orcamentoCicloMs?: number;
}

export interface ResumoCiclo {
  enviados: number;
  adiados: number;
  falhados: number;
  conflitos: number;
  pulados: number;
  empresasPausadas: number[];
  chipsBloqueados: number[];
  restantes: number;
}

interface ContextoChip {
  empresaId: number | null;
  chipId: number;
  janela: JanelaOperacional;
  intervalo: { min: number; max: number };
  ultimoEnvio: number;
}

/** Estado compartilhado entre os chips de UMA empresa (a pausa é da empresa). */
interface EstadoEmpresa {
  pausada: boolean;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

class OrcamentoEstourado extends Error {
  constructor(ms: number) { super(`orçamento de ${ms}ms estourado`); this.name = 'OrcamentoEstourado'; }
}

/**
 * Corre a promessa contra o orçamento. Uma promessa pendurada NÃO é cancelável em
 * JS — o que se ganha aqui é devolver o controle ao ciclo. O follow-up permanece
 * 'processando' de propósito: o reaper decide pela evidência no histórico se a
 * mensagem chegou a sair. Marcar 'pendente' na hora arriscaria mensagem duplicada.
 */
async function comOrcamento<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limite = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new OrcamentoEstourado(ms)), ms);
  });
  try {
    return await Promise.race([p, limite]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Agrupa preservando a ordem de chegada (que já vem por agendado_para). */
function agrupar<T>(itens: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of itens) {
    const k = chave(it);
    const atual = m.get(k);
    if (atual) atual.push(it); else m.set(k, [it]);
  }
  return m;
}

// ─── Ciclo ────────────────────────────────────────────────────────────────────

export async function executarCiclo(p: PortasMotor): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = {
    enviados: 0, adiados: 0, falhados: 0, conflitos: 0, pulados: 0,
    empresasPausadas: [], chipsBloqueados: [], restantes: 0,
  };

  // ── Manutenção, antes de olhar a fila ────────────────────────────────────────
  // 1. Devolver à fila (ou fechar) o que ficou preso em 'processando' num ciclo que
  //    morreu. 2. Encerrar o que pertence a lead arquivado: `buscarPendentes` já não
  //    envia para eles, mas o registro ficava 'pendente' para sempre, contado no
  //    dashboard e sem explicação. Aqui é auto-corretivo — vale mesmo quando o lead
  //    foi arquivado por SQL cru, sem passar por `leadsService.arquivar()`.
  await p.followups.resolverClaimsOrfaos();
  const arquivados = await p.followups.cancelarPorLeadArquivado();
  if (arquivados > 0) {
    p.logger.info(`${arquivados} follow-up(s) encerrado(s): lead arquivado`);
  }
  // 3. Chip que voltou retoma a cadência de onde parou (#78). Antes, o toque que
  //    falhou com o número fora do ar ficava para trás e o seguinte saía no lugar dele.
  await retomarChipsQueVoltaram(p);

  const pendentes = await p.followups.buscarPendentes();
  if (pendentes.length === 0) return resumo;

  p.logger.info(`${pendentes.length} follow-up(s) para processar`);

  const [intervalos, janelas, ultimoEnvio] = await Promise.all([
    p.followups.intervalosFollowupPorEmpresa(),
    p.janelas(),
    p.followups.ultimoEnvioAutomaticoPorChip(),
  ]);

  const deadline = p.agora() + (p.orcamentoCicloMs ?? ORCAMENTO_CICLO_MS);
  const porEmpresa = agrupar(pendentes, (f) => String(f.empresa_id ?? 'sem-empresa'));

  await Promise.all([...porEmpresa.values()].map(async (daEmpresa) => {
    const empresaId: number | null = daEmpresa[0].empresa_id ?? null;
    const estado: EstadoEmpresa = { pausada: false };
    const janela = (empresaId != null && janelas[empresaId]) || JANELA_PADRAO;
    const intervalo = (empresaId != null && intervalos[empresaId]) || { min: 45, max: 90 };

    // Dentro da empresa, uma fila por CHIP. Chips são independentes entre si: o
    // espaçamento anti-ban protege um número, não a empresa, então segurar o chip B
    // porque o chip A acabou de enviar não reduz risco — só atrasa a fila.
    const porChip = agrupar(daEmpresa, (f) => String(f.remetente_id ?? f.usuario_id));

    await Promise.all([...porChip.values()].map(async (doChip) => {
      const chipId: number = doChip[0].remetente_id ?? doChip[0].usuario_id;
      const ctx: ContextoChip = {
        empresaId, chipId, janela, intervalo,
        ultimoEnvio: ultimoEnvio[chipId] || 0,
      };
      try {
        await processarFilaDoChip(p, doChip, ctx, estado, deadline, resumo);
      } catch (err: any) {
        p.logger.error(`Erro na fila do chip ${chipId} (empresa ${empresaId}): ${err?.message}`);
      }
    }));
  }));

  resumo.empresasPausadas = [...new Set(resumo.empresasPausadas)];
  resumo.chipsBloqueados = [...new Set(resumo.chipsBloqueados)];
  return resumo;
}

/**
 * Retoma os toques que falharam com o chip fora do ar, para os chips que voltaram.
 * Quem prova que voltou é o diagnóstico real da instância — um por chip, não por toque.
 */
async function retomarChipsQueVoltaram(p: PortasMotor): Promise<void> {
  const falhas = await p.followups.falhasDeCanalRetomaveis();
  if (!falhas.length) return;
  const porChip = agrupar(falhas, (f) => String(f.chip));
  for (const [chip, doChip] of porChip) {
    try {
      const diag = await p.diagnosticarChip(Number(chip));
      if (diag.estado !== 'disponivel') continue;
      const n = await p.followups.retomarFalhasDeCanal(doChip.map((f) => f.id));
      if (n > 0) p.logger.info(`Chip ${chip} voltou: ${n} toque(s) de cadência retomado(s) de onde pararam`);
    } catch (err: any) {
      p.logger.error(`Retomada do chip ${chip}: ${err?.message}`);
    }
  }
}

/**
 * Escoa a fila de um chip, esperando de fato o intervalo anti-ban entre envios.
 * Sequencial de propósito: é o que garante que o mesmo chip não dispare duas
 * mensagens ao mesmo tempo e que o mesmo lead não receba dois follow-ups
 * simultâneos (um lead pertence a uma empresa e é atendido por um chip).
 */
async function processarFilaDoChip(
  p: PortasMotor,
  fila: any[],
  ctx: ContextoChip,
  estado: EstadoEmpresa,
  deadline: number,
  resumo: ResumoCiclo
): Promise<void> {
  let ultimoEnvio = ctx.ultimoEnvio;
  // Disjuntor: chip diagnosticado como bloqueado para de ser tentado NESTE ciclo.
  // Sem isso, 40 follow-ups do mesmo responsável gastariam 40 tentativas — e o teto
  // de retry — num problema que é um só.
  let chipBloqueado: DiagnosticoChip | null = null;
  // Passos empurrados para o futuro por um envio deste ciclo: a fila foi lida antes,
  // então eles ainda estão nela como vencidos. Pular direto evita esperar o anti-ban
  // por um registro que o claim recusaria de qualquer jeito.
  const reajustados = new Set<number>();

  for (let i = 0; i < fila.length; i++) {
    const followup = fila[i];
    if (reajustados.has(followup.id)) { resumo.pulados++; continue; }

    if (estado.pausada) { resumo.pulados += fila.length - i; return; }
    if (chipBloqueado) { resumo.pulados += fila.length - i; return; }
    if (p.agora() >= deadline) {
      resumo.restantes += fila.length - i;
      p.logger.info(`Chip ${ctx.chipId}: fim do ciclo com ${fila.length - i} follow-up(s) na fila`);
      return;
    }

    try {
      // ── Conflito de configuração ────────────────────────────────────────────
      // Dias do passo sem interseção com a janela da empresa. Não existe dia em que
      // este follow-up possa sair. Falha explícita (e visível na tela) em vez de
      // enviar num dia que o administrador não autorizou.
      if (conflitoDeDias(ctx.janela, followup.dias_semana)) {
        const msg = descreverConflitoDias(ctx.janela, followup.dias_semana);
        await p.followups.marcarFalhou(followup.id, msg, 'conflito_config');
        resumo.conflitos++;
        p.logger.error(`#${followup.id} (lead #${followup.lead_id}): ${msg}`);
        continue;
      }

      // ── Janela operacional ──────────────────────────────────────────────────
      if (!dentroDaJanela(new Date(p.agora()), ctx.janela, followup.dias_semana)) {
        const alvo = proximaJanelaValida(new Date(p.agora()), ctx.janela, followup.dias_semana, 10);
        await p.followups.adiarPara(followup.id, alvo);
        resumo.adiados++;
        p.logger.info(`#${followup.id} fora da janela ${ctx.janela.inicio}-${ctx.janela.fim} — reagendado para ${alvo.toISOString()}`);
        continue;
      }

      // ── Ordem da cadência ───────────────────────────────────────────────────
      // Um passo não passa na frente de outro anterior ainda pendente. Não reagenda:
      // o instante desenhado continua valendo, só não é a vez dele.
      if (followup.origem === 'estagio'
          && !(await p.followups.podeEnviarPassoEstagio(followup.lead_id, followup.passo_ordem))) {
        resumo.pulados++;
        continue;
      }

      // ── Espaçamento anti-ban (único mecanismo, por chip, só automação) ──────
      if (ultimoEnvio) {
        const alvoMs = p.aleatorio(ctx.intervalo.min, ctx.intervalo.max) * 1000;
        const falta = alvoMs - (p.agora() - ultimoEnvio);
        if (falta > 0) {
          if (p.agora() + falta >= deadline) {
            resumo.restantes += fila.length - i;
            p.logger.info(`Chip ${ctx.chipId}: intervalo de ${Math.round(falta / 1000)}s passa do fim do ciclo — resto fica para o próximo`);
            return;
          }
          await p.esperar(falta);
        }
      }

      // ── Claim atômico ───────────────────────────────────────────────────────
      // A partir daqui o registro é deste ciclo e de mais ninguém. Perder o claim
      // significa que outro ciclo pegou, ou que o follow-up foi cancelado (mudança
      // de estágio) entre a leitura da fila e agora — nos dois casos, não enviar.
      if (!(await p.followups.reclamar(followup.id))) {
        resumo.pulados++;
        p.logger.info(`#${followup.id} não foi reclamado (já processado, cancelado ou reagendado no meio do ciclo)`);
        continue;
      }

      // ── Envio, com orçamento ────────────────────────────────────────────────
      const r = await comOrcamento(p.despachar(followup), p.orcamentoFollowupMs ?? ORCAMENTO_FOLLOWUP_MS);

      if (r === 'enviado') {
        await p.followups.marcarEnviado(followup.id);
        // Antes do aposEnvio: se ele mover o lead de estágio, os seguintes são cancelados
        // e não há o que reajustar; se não mover, eles contam o intervalo a partir de agora.
        if (followup.origem === 'estagio') {
          const movidos = await p.followups.reancorarPassosSeguintes(followup, new Date(p.agora()));
          movidos.forEach((id) => reajustados.add(id));
          if (movidos.length) p.logger.info(`#${followup.id}: ${movidos.length} passo(s) seguinte(s) reajustado(s) a partir deste envio (lead #${followup.lead_id})`);
        }
        await p.aposEnvio(followup);
        ultimoEnvio = p.agora();
        resumo.enviados++;
        p.logger.info(`Enviado: #${followup.id} → lead #${followup.lead_id} (chip ${ctx.chipId})`);
      } else if (r === 'cancelado') {
        await p.followups.cancelar(followup.id, followup.empresa_id);
        resumo.pulados++;
        p.logger.info(`Cancelado: #${followup.id} → agente inativo para o lead #${followup.lead_id}`);
      } else if (r === 'pausado') {
        const alvo = proximaJanelaValida(new Date(p.agora() + ADIAR_SISTEMA_MIN * 60_000), ctx.janela, followup.dias_semana, 10);
        await p.followups.adiarPara(followup.id, alvo);
        estado.pausada = true;
        if (ctx.empresaId != null) resumo.empresasPausadas.push(ctx.empresaId);
        resumo.adiados++;
        p.logger.warn(`Empresa ${ctx.empresaId} pausada até ${alvo.toISOString()}: agente desligado ou sem API key`);
        return;
      } else if (r === 'config_ausente') {
        // A empresa não tem NENHUMA configuração de agente. Diferente de 'pausado':
        // ali alguém desligou o agente e pode religar; aqui não existe o que religar,
        // e adiar de hora em hora só produz churn — um registro por minuto, todo dia,
        // para sempre, sem nada na tela (foi o caso da empresa 32, com 66 registros).
        // Vira falha EXPLÍCITA: sai da fila, aparece na lista de falhados com o motivo
        // e volta com um reagendamento depois que a configuração existir. Não consome
        // tentativa — não foi tentativa de envio, foi ausência de configuração.
        await p.followups.marcarFalhou(followup.id,
          'A empresa não tem agente de IA configurado. Configure o agente (provedor, chave e modelo) '
          + 'em Agente IA → Configurar Agente e reagende este follow-up.',
          'config_ausente');
        resumo.falhados++;
        p.logger.error(`#${followup.id} (lead #${followup.lead_id}): empresa ${ctx.empresaId} sem agente_ia_config — falha explícita em vez de adiamento perpétuo`);
      } else if (r === 'sem_capacidade') {
        // Falha EXPLÍCITA, como o conflito de janela: some da fila, aparece na
        // lista de falhados com o motivo e volta com um reagendamento se o plano
        // mudar ou se o contato responder. Adiar seria prometer um envio que o
        // plano não permite, para sempre.
        await p.followups.marcarFalhou(followup.id,
          'Este contato nunca escreveu para você, e o primeiro contato em massa é do plano '
          + 'Enterprise (API Oficial da Meta). A cadência volta a valer para ele assim que ele responder.',
          'conflito_config');
        resumo.falhados++;
        p.logger.warn(`#${followup.id} (lead #${followup.lead_id}): contato frio e empresa ${ctx.empresaId} sem a capacidade conversa_fria`);
      } else if (r === 'so_oficial') {
        // O plano permite, o CANAL não: o primeiro contato é o que a Meta pune num
        // número comum, e é a linha que separa os planos. No Enterprise quem ainda
        // está no QR fala só com quem já escreveu, como no Profissional.
        await p.followups.marcarFalhou(followup.id,
          'Este contato nunca escreveu para você, e o primeiro contato só sai pelo número oficial '
          + 'da Meta. O responsável por este lead está no WhatsApp por QR Code: conecte o número '
          + 'oficial dele ou passe o lead para quem já está no oficial. A cadência volta a valer '
          + 'para ele assim que o contato responder.',
          'conflito_config');
        resumo.falhados++;
        p.logger.warn(`#${followup.id} (lead #${followup.lead_id}): contato frio e responsável ${ctx.chipId} no QR — primeiro contato só pelo oficial`);
      } else if (r === 'sem_modelo') {
        // Configuração, não destino: o mesmo passo sai assim que ganhar um modelo de
        // reserva. Como `destino_invalido` ele sumia sem volta — foram 96 passos da
        // Débora em 2 minutos, no dia em que ela conectou o número oficial.
        await p.followups.marcarFalhou(followup.id,
          'Este contato não escreveu nas últimas 24h, e fora dessa janela o número oficial só '
          + 'entrega modelo aprovado pela Meta. Escolha um modelo de reserva neste passo da '
          + 'cadência e reagende.',
          'conflito_config');
        resumo.falhados++;
        p.logger.warn(`#${followup.id} (lead #${followup.lead_id}): janela de 24h fechada e passo sem modelo de reserva`);
      } else if (r === 'sem_destino' || r === 'sem_conteudo') {
        const motivo = r === 'sem_destino'
          ? 'Lead sem telefone válido para envio no WhatsApp'
          : 'Mensagem vazia — follow-up sem texto e sem mídia';
        await p.followups.marcarFalhou(followup.id, motivo, 'destino_invalido');
        resumo.falhados++;
        p.logger.warn(`#${followup.id}: ${motivo}`);
      } else {
        // 'adiado' — conversa viva
        const alvo = proximaJanelaValida(new Date(p.agora() + ADIAR_CURTO_MIN * 60_000), ctx.janela, followup.dias_semana, 10);
        await p.followups.adiarPara(followup.id, alvo);
        resumo.adiados++;
        p.logger.info(`#${followup.id} adiado (conversa viva) para ${alvo.toISOString()}`);
      }
    } catch (err: any) {
      const bloqueio = await tratarErro(p, followup, ctx, estado, err, resumo);
      if (bloqueio) {
        chipBloqueado = bloqueio;
        resumo.chipsBloqueados.push(ctx.chipId);
      }
      if (estado.pausada) return;
    }
  }
}

/**
 * Política de erro. Devolve o diagnóstico do chip quando o problema é do canal e
 * o disjuntor deve abrir (parar de tentar este chip no ciclo).
 */
async function tratarErro(
  p: PortasMotor,
  followup: any,
  ctx: ContextoChip,
  estado: EstadoEmpresa,
  err: any,
  resumo: ResumoCiclo
): Promise<DiagnosticoChip | null> {
  const orcamentoEstourou = err?.name === 'OrcamentoEstourado';
  const { categoria, origem, status, msg } = classificarErro(err);
  const onde = `#${followup.id} (lead #${followup.lead_id}, empresa ${ctx.empresaId}, chip ${ctx.chipId})`;

  // Orçamento estourado: a operação pode ter enviado a mensagem. Deixa em
  // 'processando' — o reaper resolve pela evidência no histórico. Devolver à fila
  // agora poderia mandar a mesma mensagem duas vezes.
  if (orcamentoEstourou) {
    await p.followups.registrarTentativa(followup.id, 'transitorio', `Orçamento de execução estourado: ${msg}`);
    resumo.falhados++;
    p.logger.error(`${onde} ORÇAMENTO ESTOURADO (${p.orcamentoFollowupMs ?? ORCAMENTO_FOLLOWUP_MS}ms). Mantido em 'processando'; o reaper decide pela evidência no histórico.`);
    return null;
  }

  const tentativas = await p.followups.registrarTentativa(followup.id, categoria, msg);
  const contexto = `origem=${origem} status=${status ?? 's/status'} categoria=${categoria} tentativa=${tentativas}/${MAX_TENTATIVAS}`;

  // Estourou o teto: para de tentar em qualquer categoria com retry.
  const fecharPorTeto = async (extra: string) => {
    await p.followups.marcarFalhou(followup.id,
      `${extra} Encerrado após ${tentativas} tentativas. Último erro: ${msg}`, categoria);
    resumo.falhados++;
    p.logger.error(`${onde} TETO DE TENTATIVAS atingido — ${contexto}. ${extra}`);
  };

  switch (categoria) {
    // ── Provedor de IA sem credencial/saldo: problema da empresa inteira ──────
    case 'ia_credencial': {
      const alvo = proximaJanelaValida(new Date(p.agora() + ADIAR_SISTEMA_MIN * 60_000), ctx.janela, followup.dias_semana, 10);
      await p.followups.adiarPara(followup.id, alvo);
      estado.pausada = true;
      if (ctx.empresaId != null) resumo.empresasPausadas.push(ctx.empresaId);
      p.logger.error(`${onde} SEM SALDO/CREDENCIAL no provedor de IA — ${contexto}. Follow-ups da empresa pausados até ${alvo.toISOString()}. Recarregue a API key.`);
      return null;
    }

    // ── Destino inválido: número sem conta no WhatsApp. Não tem retry. ────────
    case 'destino_invalido':
      await p.followups.marcarFalhou(followup.id, msg, categoria);
      resumo.falhados++;
      p.logger.warn(`${onde} DESTINO INVÁLIDO (definitivo) — ${contexto}`);
      return null;

    // ── 503 do chip: ambíguo. Só o estado real da instância desempata. ────────
    case 'canal_indefinido':
    case 'canal_bloqueado': {
      const chip = await p.diagnosticarChip(ctx.chipId);
      if (chip.exigeIntervencao) {
        // Ban, logout ou sessão morta: não se resolve esperando. Falha explícita e
        // disjuntor aberto para não gastar o resto da fila no mesmo problema.
        await p.followups.marcarFalhou(followup.id,
          `Canal de WhatsApp indisponível: ${chip.motivo}. Reconecte o número do responsável — `
          + `a cadência retoma deste passo quando ele voltar.`,
          'canal_bloqueado');
        resumo.falhados++;
        p.logger.error(`${onde} CANAL BLOQUEADO — ${chip.motivo}. ${contexto}. Disjuntor aberto: os demais follow-ups deste chip ficam para depois da reconexão.`);
        return chip;
      }
      if (tentativas >= MAX_TENTATIVAS) {
        await fecharPorTeto('Instância seguiu indisponível.');
        return chip;
      }
      const alvo = proximaJanelaValida(new Date(p.agora() + ADIAR_CANAL_MIN * 60_000), ctx.janela, followup.dias_semana, 10);
      await p.followups.adiarPara(followup.id, alvo);
      resumo.adiados++;
      p.logger.warn(`${onde} chip reconectando (${chip.motivo}) — ${contexto}. Adiado para ${alvo.toISOString()}`);
      // Disjuntor também aqui: os outros follow-ups deste chip cairiam no mesmo 503.
      return chip;
    }

    // ── Transitório: rede, rate limit, sobrecarga. Retry limitado. ────────────
    case 'transitorio': {
      if (tentativas >= MAX_TENTATIVAS) {
        await fecharPorTeto('Erro transitório persistente.');
        return null;
      }
      const alvo = proximaJanelaValida(new Date(p.agora() + ADIAR_CURTO_MIN * 60_000), ctx.janela, followup.dias_semana, 10);
      await p.followups.adiarPara(followup.id, alvo);
      resumo.adiados++;
      p.logger.warn(`${onde} erro transitório — ${contexto}. Adiado para ${alvo.toISOString()}`);
      return null;
    }

    // ── Desconhecido: bug, erro de banco. Falha para aparecer. ────────────────
    default:
      await p.followups.marcarFalhou(followup.id, msg || 'Erro desconhecido', categoria);
      resumo.falhados++;
      p.logger.error(`${onde} FALHA DEFINITIVA — ${contexto}: ${msg}`);
      return null;
  }
}

export const _internos = { comOrcamento, agrupar, OrcamentoEstourado };
