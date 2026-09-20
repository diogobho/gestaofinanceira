import axios from 'axios';
import { query } from '../../../config/database';
import { variantesTelefone } from '../../crm/_shared/telefone';
import { baixarMidia } from '../meta/meta-whatsapp.service';
import { ContaCloud, credenciaisDa } from './contas';

/**
 * Mensagem que chega no número oficial → mesmo caminho das mensagens do Baileys.
 *
 * O webhook da Meta é um só para o app inteiro (`/whatsapp/meta/webhook`). Quando a
 * mensagem é para o número oficial de uma empresa LIGADA, ela é traduzida para o
 * payload que as instâncias mandam a `/crm/webhook/whatsapp` — com `port` = a porta
 * virtual — e entregue lá. Contato, vínculo com o lead, histórico, contagem de não
 * lidas, mudança de estágio por resposta, agente de IA e lead automático continuam
 * sendo decididos num lugar só (`receberMensagem`).
 *
 * Duas diferenças de propósito em relação ao Baileys:
 *
 *  - **Contato desconhecido é criado.** No Baileys o contato vem da agenda do celular e
 *    o webhook descarta número estranho. No número oficial não há agenda: quem escreve
 *    é prospect, e descartar seria perder o lead. O contato nasce do dono da porta.
 *  - **BSUID.** Com o nome de usuário do WhatsApp (2026) a Meta pode mandar a
 *    mensagem SEM o telefone, só com o id da pessoa na nossa conta. Guardamos o BSUID
 *    em todo contato e achamos por ele quando o telefone não vier.
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024';
const URL_WEBHOOK_CRM = `http://localhost:${process.env.PORT || 4100}/api/crm/webhook/whatsapp`;

/** Tipos da Cloud API → tipos do Baileys, que é o que `receberMensagem` entende. */
const TIPO_BAILEYS: Record<string, string> = {
  text: 'chat',
  image: 'image',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
};

async function donoDaPorta(conta: ContaCloud): Promise<{ id: number } | null> {
  const r = await query(
    `SELECT id FROM usuarios WHERE whatsapp_porta = $1 AND ativo = true ORDER BY id LIMIT 1`,
    [conta.porta_virtual]
  );
  return r.rows[0] ?? null;
}

/** Texto do balão para os tipos que não são mídia. null = não vira mensagem no CRM. */
function textoDa(msg: any): string | null {
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? '';
    case 'button':
      return msg.button?.text ?? msg.button?.payload ?? '';
    case 'interactive':
      return (
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        msg.interactive?.nfm_reply?.body ??
        '[resposta interativa]'
      );
    case 'location': {
      const l = msg.location || {};
      return [l.name, l.address, `📍 ${l.latitude}, ${l.longitude}`].filter(Boolean).join(' — ');
    }
    case 'contacts':
      return (msg.contacts ?? [])
        .map((c: any) => `👤 ${c.name?.formatted_name ?? 'Contato'}${c.phones?.[0]?.phone ? ` — ${c.phones[0].phone}` : ''}`)
        .join('\n');
    case 'order':
      return '[pedido pelo catálogo]';
    default:
      return null;
  }
}

/**
 * Garante o contato na empresa antes de entregar a mensagem ao CRM. Devolve o
 * identificador que vai no `from` do payload (JID `@c.us` ou `<BSUID>@bsuid`).
 */
async function garantirContato(
  conta: ContaCloud,
  telefone: string | null,
  bsuid: string | null,
  nome: string | null
): Promise<string | null> {
  const dono = await donoDaPorta(conta);
  if (!dono) {
    console.warn(`[CloudAPI] número oficial da empresa #${conta.empresa_id} sem usuário na porta ${conta.porta_virtual}`);
    return null;
  }

  if (telefone) {
    const variantes = variantesTelefone(telefone);
    const existente = await query(
      `SELECT id FROM contatos_whatsapp
        WHERE empresa_id = $1 AND is_grupo = false
          AND REGEXP_REPLACE(COALESCE(numero, ''), '[^0-9]', '', 'g') = ANY($2::text[])`,
      [conta.empresa_id, variantes]
    );
    if (existente.rows.length > 0) {
      if (bsuid) {
        await query(
          `UPDATE contatos_whatsapp SET bsuid = $2 WHERE id = ANY($1::int[]) AND bsuid IS DISTINCT FROM $2`,
          [existente.rows.map((r: any) => r.id), bsuid]
        );
      }
      return `${telefone}@c.us`;
    }
    // Lead com esse telefone e sem contato: o próprio receberMensagem cria e vincula.
    const lead = await query(
      `SELECT 1 FROM leads
        WHERE empresa_id = $1 AND arquivado = false AND contato_whatsapp_id IS NULL
          AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[]) LIMIT 1`,
      [conta.empresa_id, variantes]
    );
    if (lead.rows.length === 0) {
      await query(
        `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, nome_push, bsuid, is_grupo, sincronizado_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)
         ON CONFLICT (usuario_id, whatsapp_id) DO UPDATE SET bsuid = COALESCE(EXCLUDED.bsuid, contatos_whatsapp.bsuid)`,
        [dono.id, conta.empresa_id, `${telefone}@c.us`, telefone, nome, bsuid]
      );
      console.log(`[CloudAPI] contato novo ${telefone} na empresa #${conta.empresa_id}`);
    }
    return `${telefone}@c.us`;
  }

  if (!bsuid) return null;
  const jid = `${bsuid}@bsuid`;
  if (jid.length > 100) {
    console.warn(`[CloudAPI] BSUID longo demais para contatos_whatsapp.whatsapp_id (${jid.length}) — mensagem não registrada`);
    return null;
  }
  const porBsuid = await query(
    `SELECT whatsapp_id FROM contatos_whatsapp WHERE empresa_id = $1 AND bsuid = $2 ORDER BY id LIMIT 1`,
    [conta.empresa_id, bsuid]
  );
  if (porBsuid.rows[0]) return porBsuid.rows[0].whatsapp_id;
  await query(
    `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, nome_push, bsuid, is_grupo, sincronizado_at)
     VALUES ($1, $2, $3, '', $4, $5, false, CURRENT_TIMESTAMP)
     ON CONFLICT (usuario_id, whatsapp_id) DO NOTHING`,
    [dono.id, conta.empresa_id, jid, nome, bsuid]
  );
  console.log(`[CloudAPI] contato novo só com BSUID (${bsuid}) na empresa #${conta.empresa_id}`);
  return jid;
}

export async function encaminharMensagemAoCRM(conta: ContaCloud, msg: any, value: any): Promise<void> {
  // Reação e mensagem de sistema não são conversa — o Baileys também as deixa de fora.
  if (msg.type === 'reaction' || msg.type === 'system' || msg.type === 'ephemeral' || msg.type === 'unsupported') {
    if (msg.type === 'unsupported') {
      console.warn(`[CloudAPI] mensagem de tipo não suportado de ${msg.from ?? msg.from_user_id}:`, JSON.stringify(msg.errors ?? []));
    }
    return;
  }

  const contatoInfo = (value.contacts ?? []).find(
    (c: any) => (msg.from && c.wa_id === msg.from) || (msg.from_user_id && c.user_id === msg.from_user_id)
  ) ?? value.contacts?.[0];
  const telefone: string | null = (msg.from || contatoInfo?.wa_id || '').replace(/\D/g, '') || null;
  const bsuid: string | null = msg.from_user_id || contatoInfo?.user_id || null;
  const nome: string | null = contatoInfo?.profile?.name || contatoInfo?.profile?.username || null;

  const from = await garantirContato(conta, telefone, bsuid, nome);
  if (!from) return;

  const payload: any = {
    from,
    to: conta.numero,
    fromMe: false,
    isGroup: false,
    messageId: msg.id,
    timestamp: Number(msg.timestamp) || Math.floor(Date.now() / 1000),
    pushname: nome,
    port: conta.porta_virtual,
    hasMedia: false,
  };

  const midia = msg[msg.type];
  const ehMidia = ['image', 'audio', 'video', 'document', 'sticker'].includes(msg.type) && midia?.id;
  if (ehMidia) {
    payload.type = msg.type === 'audio' ? (midia.voice ? 'ptt' : 'audio') : TIPO_BAILEYS[msg.type];
    payload.body = midia.caption ?? null;
    payload.filename = midia.filename ?? null;
    payload.mimetype = midia.mime_type ?? null;
    try {
      const { buffer, mimetype } = await baixarMidia(midia.id, credenciaisDa(conta));
      payload.hasMedia = true;
      payload.mediaData = buffer.toString('base64');
      payload.mimetype = payload.mimetype || mimetype;
    } catch (err: any) {
      // Sem o arquivo a mensagem ainda entra — o balão diz o que era.
      console.error(`[CloudAPI] não baixou a mídia ${midia.id}: ${err.message}`);
      payload.type = 'chat';
      payload.body = `[${msg.type} recebido — não foi possível baixar o arquivo]${midia.caption ? ` ${midia.caption}` : ''}`;
    }
  } else {
    const texto = textoDa(msg);
    if (texto == null) return;
    payload.type = msg.type === 'location' ? 'location' : 'chat';
    payload.body = texto;
  }

  // Resposta a anúncio "clique para o WhatsApp": a origem do lead vale ouro para o
  // comercial e só vem nesta mensagem.
  if (msg.referral?.source_url || msg.referral?.headline) {
    const ref = msg.referral;
    payload.body = `${payload.body ?? ''}\n\n[Veio do anúncio: ${ref.headline || ref.source_type || 'Meta'}${ref.source_url ? ` — ${ref.source_url}` : ''}]`.trim();
  }

  const r = await axios.post(URL_WEBHOOK_CRM, payload, {
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    timeout: 60000,
    maxBodyLength: Infinity,
  });
  if (!r.data?.processed) {
    console.log(`[CloudAPI] mensagem ${msg.id} não processada pelo CRM: ${r.data?.reason ?? 'sem motivo'}`);
  }
}

/** Frases de falha que o operador entende — a Meta manda código e título em inglês. */
function motivoFalha(erro: any): string {
  const code = Number(erro?.code);
  const mapa: Record<number, string> = {
    131047: 'Fora da janela de 24h: o cliente não escreveu nas últimas 24h, só modelo aprovado é entregue',
    131026: 'Não entregue: o número não tem WhatsApp, está com versão antiga ou não aceitou os termos',
    131049: 'Não entregue: a Meta segurou a mensagem de marketing para não saturar o cliente (tente mais tarde)',
    131050: 'Não entregue: o cliente pediu para não receber mensagens de marketing',
    131048: 'Não entregue: envio limitado por denúncias/bloqueios recentes deste número',
    131056: 'Não entregue: muitas mensagens para o mesmo contato em pouco tempo',
    131051: 'Tipo de mensagem não suportado',
    131053: 'A Meta não conseguiu processar o arquivo enviado',
    132000: 'Quantidade de variáveis diferente do que o modelo pede',
    132001: 'Modelo inexistente nesse idioma ou ainda não aprovado',
    132015: 'Modelo pausado pela Meta por baixa qualidade',
    132016: 'Modelo desativado pela Meta por baixa qualidade',
    131042: 'Problema no método de pagamento da conta Meta',
  };
  const base = mapa[code] ?? `${erro?.title ?? 'Falha'}${erro?.error_data?.details ? ` — ${erro.error_data.details}` : ''}`;
  return `${base} (código ${erro?.code ?? '?'})`;
}

/**
 * Status de uma mensagem que NÓS enviamos: sent, delivered, read, failed. É o que o
 * Baileys nunca deu ao CRM — `entregue_at`/`lido_at` passam a valer de verdade para o
 * número oficial.
 */
export async function registrarStatus(status: any): Promise<void> {
  if (!status?.id) return;
  const quando = Number(status.timestamp) || Math.floor(Date.now() / 1000);
  if (status.status === 'delivered') {
    await query(
      `UPDATE historico_mensagens SET entregue_at = COALESCE(entregue_at, to_timestamp($2))
        WHERE whatsapp_message_id = $1 AND direcao = 'saida'`,
      [status.id, quando]
    );
  } else if (status.status === 'read') {
    await query(
      `UPDATE historico_mensagens
          SET entregue_at = COALESCE(entregue_at, to_timestamp($2)), lido_at = COALESCE(lido_at, to_timestamp($2))
        WHERE whatsapp_message_id = $1 AND direcao = 'saida'`,
      [status.id, quando]
    );
  } else if (status.status === 'failed') {
    const motivo = (status.errors ?? []).map(motivoFalha).join('; ') || 'Falha na entrega (sem detalhe da Meta)';
    const r = await query(
      `UPDATE historico_mensagens SET erro = $2
        WHERE whatsapp_message_id = $1 AND direcao = 'saida' AND erro IS NULL
        RETURNING id, lead_id, origem, enviado_at`,
      [status.id, motivo]
    );
    console.warn(`[CloudAPI] mensagem ${status.id} falhou: ${motivo}${r.rowCount ? '' : ' (não está no histórico do CRM ou já estava com erro)'}`);

    // Disparo: a linha do lead foi gravada 'enviado' quando a Meta aceitou o pedido.
    // A recusa chega depois — sem isto o relatório do disparo contaria como entregue
    // uma mensagem que a Meta segurou (131049, marketing) ou que não tinha para onde ir.
    const linha = r.rows[0];
    if (linha?.origem === 'disparo' && linha.lead_id) {
      const d = await query(
        `UPDATE disparo_leads SET status = 'falha', erro = $2
          WHERE id = (
            SELECT id FROM disparo_leads
             WHERE lead_id = $1 AND status = 'enviado'
               AND enviado_at BETWEEN $3::timestamp - interval '5 minutes' AND $3::timestamp + interval '5 minutes'
             ORDER BY abs(extract(epoch FROM (enviado_at - $3::timestamp))) LIMIT 1)
          RETURNING disparo_id`,
        [linha.lead_id, motivo, linha.enviado_at]
      );
      const disparoId = d.rows[0]?.disparo_id;
      if (disparoId) {
        await query(
          `UPDATE disparos_crm
              SET enviados = GREATEST(enviados - 1, 0), falhas = falhas + 1,
                  erros = COALESCE(erros, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('lead_id', $2::int, 'erro', $3::text))
            WHERE id = $1`,
          [disparoId, linha.lead_id, motivo]
        );
      }
    }
  }
}

/**
 * Registra no card uma mensagem que saiu pelo número oficial POR FORA do CRM (hoje,
 * o material de boas-vindas que o módulo de onboarding manda direto pela Meta).
 */
export async function registrarSaidaAutomatica(conta: ContaCloud, telefone: string, texto: string): Promise<void> {
  const variantes = variantesTelefone(String(telefone).replace(/\D/g, ''));
  const c = await query(
    `SELECT cw.id, cw.usuario_id,
            (SELECT l.id FROM leads l WHERE l.contato_whatsapp_id = cw.id AND l.arquivado = false
              ORDER BY l.data_ultimo_contato DESC NULLS LAST, l.id DESC LIMIT 1) AS lead_id
       FROM contatos_whatsapp cw
      WHERE cw.empresa_id = $1 AND cw.is_grupo = false
        AND REGEXP_REPLACE(COALESCE(cw.numero, ''), '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY cw.id LIMIT 1`,
    [conta.empresa_id, variantes]
  );
  const contato = c.rows[0];
  if (!contato) return;
  await query(
    `INSERT INTO historico_mensagens
       (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo, enviado_at)
     VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, CURRENT_TIMESTAMP)`,
    [contato.lead_id, contato.id, contato.usuario_id, conta.empresa_id, texto]
  );
}
