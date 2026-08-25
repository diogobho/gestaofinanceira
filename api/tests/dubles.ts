/**
 * Dublês para os testes de cenário do motor de follow-up.
 *
 * O motor recebe todas as dependências por `PortasMotor`, então aqui não há banco,
 * WhatsApp nem provedor de IA: um repositório em memória que replica as REGRAS DE
 * ESTADO reais (claim só vence uma vez, marcarEnviado só sai de 'processando') e um
 * relógio controlado, para que "esperar 45 segundos" não custe 45 segundos.
 */

import { PortasMotor, PortaFollowups, ResultadoDespacho } from '../src/jobs/followup/motor';
import { JanelaOperacional, JANELA_PADRAO } from '../src/modules/crm/_shared/agendamento';
import { DiagnosticoChip } from '../src/modules/crm/_shared/chip';

export interface FollowupFalso {
  id: number;
  lead_id: number;
  empresa_id: number | null;
  usuario_id: number;
  remetente_id?: number;
  tipo: 'manual' | 'agente_ia';
  origem: 'lead' | 'estagio';
  status: string;
  agendado_para: Date;
  dias_semana?: number[] | null;
  passo_ordem?: number | null;
  mover_apos_envio?: boolean;
  tentativas: number;
  erro?: string | null;
  erro_categoria?: string | null;
  claim_at?: Date | null;
  enviado_at?: Date | null;
  contato_whatsapp_id?: number | null;
  mensagem?: string;
}

/**
 * Instante de referência de TODO cenário: terça, 25/08/2026, 13:00 em São Paulo —
 * dia útil, dentro da JANELA_PADRAO (08:00–20:00). É a ÚNICA âncora de tempo dos
 * testes: `portasDeTeste` inicia o relógio aqui e `followupFalso` agenda em relação
 * a ela.
 *
 * Existe porque a suíte era dependente da hora REAL da execução. O default era
 * `agendado_para: new Date()`, enquanto o relógio do motor já era fixo nas 13:00 SP:
 * rodando depois das 16:00 UTC o `agendado_para` caía no FUTURO do relógio de teste,
 * `buscarPendentes` voltava vazia e 18 dos 41 testes falhavam — de manhã passavam.
 * Verde que depende do relógio de parede não é verde.
 */
export const AGORA_TESTE = new Date('2026-08-25T13:00:00-03:00').getTime();

/** Um minuto ANTES da âncora: já venceu, logo entra na fila do primeiro ciclo. */
const VENCIDO = new Date(AGORA_TESTE - 60_000);

export function followupFalso(over: Partial<FollowupFalso> = {}): FollowupFalso {
  return {
    id: 1, lead_id: 100, empresa_id: 5, usuario_id: 10, remetente_id: 10,
    tipo: 'manual', origem: 'estagio', status: 'pendente',
    agendado_para: new Date(VENCIDO), dias_semana: null, passo_ordem: null,
    mover_apos_envio: true, tentativas: 0, contato_whatsapp_id: 900, mensagem: 'oi',
    ...over,
  };
}

/** Repositório em memória com as MESMAS regras de transição de estado do banco. */
export class RepoFalso implements PortaFollowups {
  registros: FollowupFalso[];
  intervalos: Record<number, { min: number; max: number }> = {};
  ultimoEnvio: Record<number, number> = {};
  orfaosResolvidos = 0;
  arquivadosLimpos = 0;
  /**
   * Relógio do repositório. `portasDeTeste` aponta isto para o relógio controlado do
   * teste: no banco o `agendado_para <= NOW()` usa o relógio do Postgres, então o
   * dublê tem de usar o MESMO relógio do motor. Usar `Date.now()` aqui fazia a fila
   * vir vazia sempre que o teste "viajava no tempo", e o cenário passava por engano.
   */
  agora: () => number = () => Date.now();

  constructor(registros: FollowupFalso[]) { this.registros = registros; }
  private acha(id: number) { return this.registros.find((f) => f.id === id); }

  async buscarPendentes() {
    return this.registros
      .filter((f) => f.status === 'pendente' && f.agendado_para.getTime() <= this.agora())
      .sort((a, b) => a.agendado_para.getTime() - b.agendado_para.getTime())
      .map((f) => ({ ...f }));
  }
  /** Espelha `UPDATE ... WHERE status='pendente'`: só o primeiro vence. */
  async reclamar(id: number) {
    const f = this.acha(id);
    if (!f || f.status !== 'pendente') return false;
    f.status = 'processando';
    // Relógio do repositório, não o de parede: `claim_at` é o que o reaper compara
    // com o histórico, então ele tem de andar junto com o tempo simulado.
    f.claim_at = new Date(this.agora());
    return true;
  }
  async liberarClaim(id: number, novo?: Date) {
    const f = this.acha(id);
    if (!f || f.status !== 'processando') return;
    f.status = 'pendente';
    f.claim_at = null;
    if (novo) f.agendado_para = novo;
  }
  async adiarPara(id: number, instante: Date) {
    const f = this.acha(id);
    if (!f || !['pendente', 'processando'].includes(f.status)) return;
    f.agendado_para = instante;
    f.status = 'pendente';
    f.claim_at = null;
  }
  async marcarEnviado(id: number) {
    const f = this.acha(id);
    if (!f || !['processando', 'pendente'].includes(f.status)) return false;
    f.status = 'enviado';
    f.enviado_at = new Date(this.agora());
    f.claim_at = null;
    return true;
  }
  async marcarFalhou(id: number, erro: string, categoria?: string) {
    const f = this.acha(id);
    if (!f) return;
    f.status = 'falhou';
    f.erro = erro;
    if (categoria) f.erro_categoria = categoria;
    f.claim_at = null;
  }
  async registrarTentativa(id: number, categoria: string, erro: string) {
    const f = this.acha(id);
    if (!f) return 0;
    f.tentativas += 1;
    f.erro_categoria = categoria;
    f.erro = erro;
    return f.tentativas;
  }
  async cancelar(id: number) {
    const f = this.acha(id);
    if (f && f.status === 'pendente') f.status = 'cancelado';
    return f;
  }
  async podeEnviarPassoEstagio(leadId: number, passoOrdem: number | null) {
    if (passoOrdem == null) return true;
    // Espelha o service: 'processando' conta junto com 'pendente', senão um passo
    // anterior em voo deixaria o seguinte passar na frente.
    return !this.registros.some((f) =>
      f.lead_id === leadId && f.origem === 'estagio'
      && (f.status === 'pendente' || f.status === 'processando')
      && f.passo_ordem != null && f.passo_ordem < passoOrdem);
  }
  async intervalosFollowupPorEmpresa() { return this.intervalos; }
  async ultimoEnvioAutomaticoPorChip() { return this.ultimoEnvio; }
  async resolverClaimsOrfaos() { this.orfaosResolvidos++; return { enviados: 0, devolvidos: 0 }; }
  /** Leads arquivados não existem nos cenários do motor; conta as chamadas. */
  async cancelarPorLeadArquivado() { this.arquivadosLimpos++; return 0; }
}

export interface OpcoesPortas {
  repo: RepoFalso;
  agora?: number;
  janela?: JanelaOperacional;
  despachar?: (f: any) => Promise<ResultadoDespacho>;
  chip?: DiagnosticoChip;
  orcamentoFollowupMs?: number;
}

export interface PortasDeTeste extends PortasMotor {
  esperas: number[];
  logs: string[];
  despachos: number[];
}

export function portasDeTeste(o: OpcoesPortas): PortasDeTeste {
  let relogio = o.agora ?? AGORA_TESTE;
  // O repositório enxerga o mesmo relógio do motor.
  o.repo.agora = () => relogio;
  const esperas: number[] = [];
  const logs: string[] = [];
  const despachos: number[] = [];

  return {
    followups: o.repo,
    janelas: async () => ({ 5: o.janela ?? JANELA_PADRAO, 32: o.janela ?? JANELA_PADRAO }),
    despachar: async (f: any) => {
      despachos.push(f.id);
      return o.despachar ? o.despachar(f) : 'enviado';
    },
    aposEnvio: async () => {},
    diagnosticarChip: async () => o.chip ?? {
      estado: 'reconectando', exigeIntervencao: false, motivo: 'instância reiniciando', porta: 3011,
    },
    agora: () => relogio,
    // Relógio controlado: a espera do anti-ban avança o tempo sem gastá-lo de verdade.
    esperar: async (ms: number) => { esperas.push(ms); relogio += ms; },
    aleatorio: (min: number) => min,   // determinístico: sempre o mínimo
    logger: {
      info: (m: string) => logs.push(`INFO ${m}`),
      warn: (m: string) => logs.push(`WARN ${m}`),
      error: (m: string) => logs.push(`ERRO ${m}`),
    },
    orcamentoFollowupMs: o.orcamentoFollowupMs,
    esperas, logs, despachos,
  };
}

/** Erro no formato que o canal de WhatsApp produz de verdade. */
export function erroWhatsApp(status: number, msg: string): Error {
  const e: any = new Error(msg);
  e.status = status;
  e.origem = 'whatsapp';
  return e;
}

/** Erro no formato que o provedor de IA produz. */
export function erroIA(status: number, msg: string): Error {
  const e: any = new Error(msg);
  e.status = status;
  e.origem = 'ia';
  return e;
}
