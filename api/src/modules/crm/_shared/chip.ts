/**
 * Estado real de um chip (instância de WhatsApp de um usuário).
 *
 * Existe por causa de uma ambiguidade do provedor: o `/send` responde **503
 * "WhatsApp não conectado"** tanto para instância reiniciando (transitório, espera
 * e volta) quanto para número BANIDO pela Meta (permanente, exige chip novo). O
 * código HTTP é o mesmo; a diferença só aparece no estado da instância.
 *
 * Tratar os dois como transitório significa re-tentar um número banido a cada 15
 * minutos para sempre — a fila daquele responsável nunca sai e nunca falha, fica
 * eternamente "quase indo".
 *
 * Duas fontes, nesta ordem:
 *   1. `GET /status` da porta — tem `banido` e `lastDisconnect.categoria` ao vivo.
 *      Timeout curto: isto roda no caminho de erro, não pode virar o novo gargalo.
 *   2. `whatsapp_conexao_eventos` — log append-only que a própria instância empurra
 *      a cada desconexão (migration 060). Responde mesmo com o processo da porta
 *      fora do ar, que é justamente quando o /status não responde.
 */

import axios from 'axios';
import { query } from '../../../config/database';
import { instancia } from '../../whatsapp/canal/instancia';

export type EstadoChip = 'disponivel' | 'reconectando' | 'bloqueado' | 'desconhecido';

export interface DiagnosticoChip {
  estado: EstadoChip;
  /** true quando o problema exige intervenção humana (ban, logout, sessão morta). */
  exigeIntervencao: boolean;
  motivo: string;
  porta?: number | null;
}

/**
 * Categorias que a instância reporta e que NÃO se resolvem sozinhas com o tempo.
 *
 * `recusado` (403 ainda não confirmado como ban) fica FORA de propósito: ele é a
 * suspeita, não o veredito. A instância só promove a `ban` depois de recusas
 * repetidas e espaçadas no tempo — e enquanto é suspeita o certo é adiar o
 * follow-up, não queimá-lo.
 */
const CATEGORIAS_TERMINAIS = new Set(['ban', 'logout', 'sessao', 'substituida']);

export async function diagnosticarChip(usuarioId: number): Promise<DiagnosticoChip> {
  const dono = await query(
    `SELECT whatsapp_porta AS porta FROM usuarios WHERE id = $1`,
    [usuarioId]
  );
  const porta: number | null = dono.rows[0]?.porta ?? null;
  if (!porta) {
    return { estado: 'bloqueado', exigeIntervencao: true, porta,
      motivo: 'usuário sem porta de WhatsApp configurada' };
  }

  // 1. Estado ao vivo da instância.
  try {
    const { data } = await instancia(porta).get(`/status`, { timeout: 2500 });
    const categoria: string | undefined = data?.lastDisconnect?.categoria;
    if (data?.banido === true || categoria === 'ban') {
      return { estado: 'bloqueado', exigeIntervencao: true, porta,
        motivo: `chip BANIDO pela Meta na porta ${porta} (${data?.lastDisconnect?.motivo || 'ban'})` };
    }
    // 403 sem número pareado nunca é ban: não há conta para a Meta bloquear.
    // O que falta é alguém ler o QR Code, e isso é intervenção humana igual.
    if (data?.pareado === false) {
      return { estado: 'bloqueado', exigeIntervencao: true, porta,
        motivo: `instância ${porta} sem número conectado — leia o QR Code em Configurações → WhatsApp` };
    }
    if (data?.status === 'connected') {
      // Conectado agora: o 503 foi uma janela de reconexão que já passou.
      return { estado: 'disponivel', exigeIntervencao: false, porta,
        motivo: `instância ${porta} conectada` };
    }
    if (categoria && CATEGORIAS_TERMINAIS.has(categoria)) {
      return { estado: 'bloqueado', exigeIntervencao: true, porta,
        motivo: `instância ${porta} exige reconexão manual: ${data?.lastDisconnect?.motivo || categoria}` };
    }
    return { estado: 'reconectando', exigeIntervencao: false, porta,
      motivo: `instância ${porta} desconectada (${data?.lastDisconnect?.motivo || 'sem detalhe'})` };
  } catch {
    // /status não respondeu (processo da porta fora do ar). Cai para o log de eventos.
  }

  // 2. Último evento de conexão registrado pela própria instância.
  // A coluna é `criado_at` (migration 060). Com `created_at` esta consulta
  // lançava 42703 e derrubava o diagnóstico inteiro — justamente no caminho em
  // que ele é a única fonte, com o processo da porta fora do ar.
  const evento = await query(
    `SELECT categoria, motivo, criado_at
       FROM whatsapp_conexao_eventos
      WHERE porta = $1
      ORDER BY criado_at DESC
      LIMIT 1`,
    [porta]
  );
  const ev = evento.rows[0];
  if (ev && CATEGORIAS_TERMINAIS.has(ev.categoria)) {
    return { estado: 'bloqueado', exigeIntervencao: true, porta,
      motivo: `porta ${porta} fora do ar; último evento: ${ev.motivo || ev.categoria}` };
  }

  return { estado: 'reconectando', exigeIntervencao: false, porta,
    motivo: `instância ${porta} não respondeu ao /status` };
}
