/**
 * Traduz o /status da instância em um diagnóstico que diz a VERDADE e nomeia a
 * ação que resolve.
 *
 * O aviso anterior era um só, disparado por um único campo (`banido`), e dizia
 * sempre a mesma frase: "Número bloqueado pela Meta. A reconexão automática foi
 * suspensa — troque o chip ou reconecte com um novo número." Três problemas de
 * uma vez:
 *
 *  1. Anunciava bloqueio a partir de UM 403, que em 28/08 e 31/08 chegou quatro
 *     segundos depois de um 503 do próprio WhatsApp, em chips que estavam
 *     recebendo mensagem no minuto anterior. Não havia bloqueio nenhum.
 *  2. Dizia "troque o chip" sem oferecer nenhum botão que fizesse isso — e a
 *     tela ficava sem QR Code, então não havia como conectar número nenhum.
 *  3. Continuava dizendo a mesma coisa depois de o número ser desbloqueado,
 *     porque nada no sistema testava de novo.
 *
 * Aqui cada estado tem o seu texto, o seu tom e a sua ação. Estado de espera diz
 * quando a próxima tentativa acontece; estado que exige gente diz o que a pessoa
 * tem de fazer.
 */

import { WhatsAppStatus } from '@/api/whatsapp';

export type TomDiagnostico = 'ok' | 'espera' | 'atencao' | 'grave';

/** Ações que a tela pode oferecer. `novo_numero` apaga a sessão e gera QR novo. */
export type AcaoDiagnostico = 'nenhuma' | 'ler_qr' | 'reconectar' | 'novo_numero';

export interface DiagnosticoConexao {
  tom: TomDiagnostico;
  titulo: string;
  descricao: string;
  /** Linha secundária: motivo técnico, hora da próxima tentativa, número atual. */
  detalhe?: string;
  acoes: AcaoDiagnostico[];
  /** Rótulo curto do selo de status. */
  selo: string;
}

function hora(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dataHora(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function proximaTentativa(status: WhatsAppStatus): string | null {
  const h = hora(status.proximaTentativaEm);
  return h ? `Próxima tentativa automática às ${h}.` : null;
}

export function diagnosticarConexao(
  status: WhatsAppStatus | null,
  opcoes: { temQr?: boolean } = {}
): DiagnosticoConexao {
  // Instância sem resposta: não é ban nem desconexão de número — é o processo da
  // porta fora do ar. Prometer QR aqui seria mentira.
  if (!status) {
    return {
      tom: 'atencao',
      selo: 'Sem resposta',
      titulo: 'Instância de WhatsApp fora do ar',
      descricao: 'O serviço desta porta não respondeu. Nenhuma mensagem entra ou sai enquanto isso.',
      detalhe: 'Se persistir por alguns minutos, avise o suporte — é preciso reiniciar o serviço no servidor.',
      acoes: [],
    };
  }

  if (status.status === 'connected') {
    return {
      tom: 'ok',
      selo: 'Online',
      titulo: 'WhatsApp Conectado',
      descricao: 'Seu WhatsApp está ativo e pronto para enviar mensagens',
      detalhe: status.numero ? `Número conectado: ${status.numero}` : undefined,
      acoes: ['reconectar'],
    };
  }

  // ── Sessão sem número: o QR vem ANTES de qualquer aviso de bloqueio ───────
  // Se não há número vinculado, não há número desta conexão para estar
  // bloqueado — e existe uma ação melhor do que qualquer aviso: ler o código.
  // Esta ordem é a rede de segurança para uma marca de ban que ficou para trás.
  if (status.pareado === false) {
    if (status.hasQrCode || opcoes.temQr) {
      return {
        tom: 'espera',
        selo: 'Aguardando leitura',
        titulo: 'Leia o QR Code para conectar',
        descricao: 'Nenhum número está vinculado a esta conexão. Escaneie o código com o WhatsApp do celular.',
        acoes: ['ler_qr'],
      };
    }
    return {
      tom: 'espera',
      selo: 'Gerando QR',
      titulo: 'Gerando QR Code...',
      descricao: 'Nenhum número está vinculado a esta conexão. O código aparece em alguns segundos.',
      detalhe: proximaTentativa(status) ?? undefined,
      acoes: [],
    };
  }

  // ── Ban CONFIRMADO ────────────────────────────────────────────────────────
  // Confirmado quer dizer 403 repetido e espaçado no tempo, nunca uma
  // ocorrência só. E mesmo confirmado não é ponto final: a instância segue
  // sondando, então o texto informa isso em vez de mandar trocar de chip.
  if (status.banido) {
    const desde = dataHora(status.banidoDesde);
    return {
      tom: 'grave',
      selo: 'Bloqueado',
      titulo: 'Número bloqueado pela Meta',
      descricao: 'O WhatsApp recusou este número várias vezes seguidas. O sistema continua testando sozinho '
        + 'e reconecta na hora em que a Meta liberar — não é preciso reiniciar nada.',
      detalhe: [
        desde ? `Bloqueio confirmado em ${desde}.` : null,
        proximaTentativa(status),
        'Se o número já foi desbloqueado, use "Tentar agora". Para usar outro chip, "Conectar outro número".',
      ].filter(Boolean).join(' '),
      acoes: ['reconectar', 'novo_numero'],
    };
  }

  // ── Suspeita em aberto: 403 sem confirmação ───────────────────────────────
  if ((status.recusas403 ?? 0) > 0) {
    const total = status.recusas403 ?? 0;
    const alvo  = status.banConfirmacoes ?? 3;
    return {
      tom: 'atencao',
      selo: 'Verificando',
      titulo: 'Conexão recusada — verificando se é bloqueio',
      descricao: 'O WhatsApp recusou a conexão, mas isso também acontece em instabilidade dele. '
        + 'Antes de acusar bloqueio, o sistema tenta de novo com intervalos crescentes.',
      detalhe: [`Recusa ${total} de ${alvo}.`, proximaTentativa(status)].filter(Boolean).join(' '),
      acoes: ['reconectar'],
    };
  }

  // ── Sessão com número, mas fora do ar ─────────────────────────────────────
  const cat = status.lastDisconnect?.categoria;
  if (cat === 'logout' || cat === 'sessao' || cat === 'substituida') {
    return {
      tom: 'atencao',
      selo: 'Reconectar',
      titulo: 'Sessão encerrada no celular',
      descricao: cat === 'substituida'
        ? 'Este número foi conectado em outro lugar e a sessão daqui caiu. É preciso ler o QR Code de novo.'
        : 'A sessão deste número foi encerrada. É preciso ler o QR Code de novo para voltar a enviar.',
      detalhe: status.lastDisconnect?.motivo,
      acoes: ['novo_numero'],
    };
  }

  return {
    tom: 'espera',
    selo: 'Reconectando',
    titulo: 'Reconectando...',
    descricao: status.numero
      ? `A conexão do número ${status.numero} caiu e o sistema está restabelecendo.`
      : 'A conexão caiu e o sistema está restabelecendo.',
    detalhe: [status.lastDisconnect?.motivo, proximaTentativa(status)].filter(Boolean).join(' — ') || undefined,
    acoes: ['reconectar'],
  };
}

/** Classes de cor por tom, para caixa de aviso. */
export const CORES_TOM: Record<TomDiagnostico, string> = {
  ok:      'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  espera:  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  atencao: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300',
  grave:   'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
};

/** Classes do selo de status (canto do card). */
export const CORES_SELO: Record<TomDiagnostico, string> = {
  ok:      'bg-green-100 text-green-700',
  espera:  'bg-blue-100 text-blue-700',
  atencao: 'bg-amber-100 text-amber-800',
  grave:   'bg-red-600 text-white',
};
