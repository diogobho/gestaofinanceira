import { query } from '../../../config/database';
import { variantesTelefone } from '../../crm/_shared/telefone';
import { pedirSincronizacao } from '../meta/embedded-signup.service';
import { ContaCloud, credenciaisDa, limparCacheContas } from './contas';
import { donoDaPorta, textoDa } from './entrada';

/**
 * Coexistência (095) — o número segue no app WhatsApp Business do celular e fala
 * também pela Cloud API.
 *
 * Depois da conexão a Meta dá **24h e uma chamada só** para pedir os contatos e o
 * histórico do app (até 180 dias). Eles chegam pelos webhooks `smb_app_state_sync` e
 * `history`, em pedaços e fora de ordem, e caem aqui.
 *
 * O histórico é gravado DIRETO em `historico_mensagens`, sem passar pelo webhook do
 * CRM, de propósito: lá uma mensagem de entrada move o card de etapa, soma não lida,
 * acorda o agente de IA e encerra cadência. Uma conversa de três meses atrás não pode
 * fazer nada disso — ela só precisa aparecer no card.
 *
 * Mídia do histórico entra como texto ("📷 Foto"), sem baixar o arquivo: seis meses de
 * áudio e foto estourariam a cota de 1 GB da empresa (076) no primeiro dia.
 */

/** Pede contatos e histórico. Chamado uma vez, logo depois de ligar a conta. */
export async function sincronizarAposConexao(conta: ContaCloud): Promise<void> {
  const cred = credenciaisDa(conta);
  await query(
    `UPDATE whatsapp_cloud_contas
        SET sync_pedido_em = now(), sync_erro = NULL, historico_status = 'importando',
            historico_progresso = 0, historico_mensagens = 0, historico_fases = '{}'::jsonb
      WHERE id = $1`,
    [conta.id]
  );
  const erros: string[] = [];
  // Contatos primeiro: o histórico que chega depois já encontra o nome de cada um.
  for (const tipo of ['smb_app_state_sync', 'history'] as const) {
    try {
      await pedirSincronizacao(conta.phone_number_id, cred.token!, tipo);
    } catch (err: any) {
      erros.push(`${tipo === 'history' ? 'histórico' : 'contatos'}: ${err?.message || err}`);
    }
  }
  if (erros.length) {
    console.error(`[Coexistência] conta #${conta.id} — pedido de sincronização falhou: ${erros.join(' | ')}`);
    await query(
      `UPDATE whatsapp_cloud_contas
          SET sync_erro = $2,
              historico_status = CASE WHEN $3 THEN NULL ELSE historico_status END
        WHERE id = $1`,
      [conta.id, erros.join(' | ').slice(0, 1000), erros.some((e) => e.startsWith('histórico'))]
    );
  } else {
    console.log(`[Coexistência] conta #${conta.id} — contatos e histórico pedidos à Meta`);
  }
  limparCacheContas();
}

/**
 * O contato da conversa na empresa. Acha pelo telefone (com e sem DDI e 9º dígito),
 * preferindo o do dono do número; cria para o dono se não houver; e vincula os leads
 * da empresa com esse telefone que ainda estão sem contato — sem vínculo o card não
 * mostra conversa nenhuma.
 */
async function contatoDaConversa(
  conta: ContaCloud,
  donoId: number,
  telefone: string,
  nome: string | null
): Promise<number> {
  const variantes = variantesTelefone(telefone);
  const achado = await query(
    `SELECT id FROM contatos_whatsapp
      WHERE empresa_id = $1 AND is_grupo = false
        AND REGEXP_REPLACE(COALESCE(numero, ''), '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY (usuario_id = $3) DESC, id LIMIT 1`,
    [conta.empresa_id, variantes, donoId]
  );
  let contatoId: number = achado.rows[0]?.id;
  if (!contatoId) {
    const novo = await query(
      `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, nome, is_grupo, sincronizado_at)
       VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP)
       ON CONFLICT (usuario_id, whatsapp_id) DO UPDATE SET nome = COALESCE(contatos_whatsapp.nome, EXCLUDED.nome)
       RETURNING id`,
      [donoId, conta.empresa_id, `${telefone}@c.us`, telefone, nome]
    );
    contatoId = novo.rows[0].id;
  }
  await query(
    `UPDATE leads SET contato_whatsapp_id = $1
      WHERE empresa_id = $2 AND arquivado = false AND contato_whatsapp_id IS NULL
        AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY($3::text[])`,
    [contatoId, conta.empresa_id, variantes]
  );
  return contatoId;
}

/** `smb_app_state_sync`: a agenda do app. Só acrescenta — apagar no celular não apaga no CRM. */
export async function sincronizarContatos(conta: ContaCloud, itens: any[]): Promise<number> {
  const dono = await donoDaPorta(conta);
  if (!dono) return 0;
  let n = 0;
  for (const item of itens ?? []) {
    if (item?.type !== 'contact' || item.action !== 'add') continue;
    const telefone = String(item.contact?.phone_number || '').replace(/\D/g, '');
    if (telefone.length < 10) continue;
    const nome = String(item.contact?.full_name || item.contact?.first_name || '').trim().slice(0, 255) || null;
    const contatoId = await contatoDaConversa(conta, dono.id, telefone, nome);
    // O nome da agenda do celular vale mais que o pushname, mas não sobrescreve um nome
    // que alguém já digitou no CRM.
    if (nome) {
      await query(`UPDATE contatos_whatsapp SET nome = $2 WHERE id = $1 AND (nome IS NULL OR nome = '')`, [contatoId, nome]);
    }
    n++;
  }
  if (n) console.log(`[Coexistência] conta #${conta.id} — ${n} contato(s) da agenda do app`);
  return n;
}

const ROTULO_MIDIA: Record<string, string> = {
  image: '📷 Foto',
  video: '🎥 Vídeo',
  audio: '🎤 Áudio',
  document: '📄 Documento',
  sticker: '[figurinha]',
};

/** Texto do balão de uma mensagem do histórico. null = não entra (reação, sistema). */
export function textoDoHistorico(msg: any): string | null {
  if (!msg?.type || ['reaction', 'system', 'ephemeral', 'unsupported', 'errors'].includes(msg.type)) return null;
  const rotulo = ROTULO_MIDIA[msg.type];
  if (rotulo) {
    const m = msg[msg.type] || {};
    const detalhe = [m.filename, m.caption].filter(Boolean).join(' — ');
    return `${rotulo} (do histórico do celular)${detalhe ? `: ${detalhe}` : ''}`;
  }
  return textoDa(msg);
}

/**
 * Um pedaço do webhook `history`. Cada `threads[]` é uma conversa 1:1 (grupo não vem
 * na coexistência). A mensagem que já está no histórico — pelo id do WhatsApp — não
 * entra de novo: a Meta reentrega o mesmo pedaço, e são 3 instâncias no cluster.
 */
export async function importarHistorico(conta: ContaCloud, item: any): Promise<number> {
  // A pessoa não liberou o histórico no app: não há o que importar, e a tela precisa
  // dizer isso em vez de "importando" para sempre.
  if (item?.errors?.length) {
    const recusou = item.errors.some((e: any) => Number(e?.code) === 2593109);
    await query(
      `UPDATE whatsapp_cloud_contas SET historico_status = $2, sync_erro = COALESCE(sync_erro, $3) WHERE id = $1`,
      [conta.id, recusou ? 'recusado' : 'concluido', recusou ? null : `histórico: ${item.errors[0]?.message || 'erro da Meta'}`]
    );
    limparCacheContas();
    console.warn(`[Coexistência] conta #${conta.id} — histórico não veio: ${JSON.stringify(item.errors).slice(0, 300)}`);
    return 0;
  }

  const dono = await donoDaPorta(conta);
  if (!dono) return 0;
  const numeroEmpresa = new Set(variantesTelefone(String(conta.numero || '')));
  let gravadas = 0;

  for (const thread of item?.threads ?? []) {
    const telefone = String(thread?.id || '').replace(/\D/g, '');
    if (telefone.length < 10) continue;
    const linhas = (thread.messages ?? [])
      .map((m: any) => ({
        id: m.id ? String(m.id) : null,
        saida: numeroEmpresa.has(String(m.from || '').replace(/\D/g, '')),
        texto: textoDoHistorico(m),
        quando: Number(m.timestamp) || null,
      }))
      .filter((l: any) => l.id && l.texto != null && l.quando);
    if (!linhas.length) continue;

    const contatoId = await contatoDaConversa(conta, dono.id, telefone, null);
    // `created_at` = hora da mensagem, não da importação: todo leitor que filtra por
    // created_at (agente, follow-up, dashboards) tomava meses de conversa por mensagem de
    // agora (02/10 Jéssica: 18.884; 05/10 Débora: 53.503).
    const r = await query(
      `INSERT INTO historico_mensagens
         (contato_whatsapp_id, usuario_id, empresa_id, whatsapp_message_id, direcao, tipo, conteudo, origem, enviado_at, created_at)
       SELECT $1, $2, $3, x.id, x.direcao, 'texto', x.texto, x.origem, to_timestamp(x.quando), to_timestamp(x.quando)
         FROM unnest($4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[]) AS x(id, direcao, texto, origem, quando)
        WHERE NOT EXISTS (
          SELECT 1 FROM historico_mensagens h
           WHERE h.empresa_id = $3 AND h.whatsapp_message_id = x.id AND h.contato_whatsapp_id = $1)`,
      [
        contatoId,
        dono.id,
        conta.empresa_id,
        linhas.map((l: any) => l.id),
        linhas.map((l: any) => (l.saida ? 'saida' : 'entrada')),
        linhas.map((l: any) => l.texto),
        linhas.map((l: any) => (l.saida ? 'manual' : 'recebida')),
        linhas.map((l: any) => l.quando),
      ]
    );
    gravadas += r.rowCount ?? 0;

    // A lista de conversas ordena pela última mensagem. Só avança — o pedaço antigo
    // (dia 90–180) chega depois do recente e não pode puxar a conversa para trás.
    const ultima = linhas.reduce((a: any, b: any) => (b.quando > a.quando ? b : a));
    await query(
      `UPDATE contatos_whatsapp SET ultima_mensagem = $2, ultima_mensagem_at = to_timestamp($3) AT TIME ZONE 'UTC'
        WHERE id = $1 AND (ultima_mensagem_at IS NULL OR ultima_mensagem_at < to_timestamp($3) AT TIME ZONE 'UTC')`,
      [contatoId, String(ultima.texto).slice(0, 500), ultima.quando]
    );
  }

  const meta = item?.metadata ?? {};
  const progresso = Number(meta.progress);
  const fase = Number(meta.phase);
  // Os pedaços chegam FORA de ordem — na primeira conexão real (conta #7) a fase 2 bateu
  // 100% antes de a fase 1 terminar. Por isso cada fase guarda o maior progresso que já
  // viu, o total é a média das três e "concluído" só vem com as três em 100. As
  // mensagens que chegam depois do "concluído" continuam sendo gravadas.
  await query(
    `UPDATE whatsapp_cloud_contas c
        SET historico_mensagens = c.historico_mensagens + $2,
            historico_fases = f.fases,
            historico_progresso = f.total,
            historico_status = CASE WHEN f.total >= 100 THEN 'concluido' ELSE COALESCE(c.historico_status, 'importando') END
       FROM (
         SELECT x.fases,
                ROUND((COALESCE((x.fases->>'0')::int, 0) + COALESCE((x.fases->>'1')::int, 0) + COALESCE((x.fases->>'2')::int, 0)) / 3.0)::int AS total
           FROM (
             SELECT CASE WHEN $3::int IS NULL OR $4::int IS NULL THEN historico_fases
                         ELSE historico_fases || $5::jsonb
                              || jsonb_build_object($4::text, GREATEST(COALESCE((historico_fases->>($4::text))::int, 0), LEAST($3::int, 100)))
                    END AS fases
               FROM whatsapp_cloud_contas WHERE id = $1
           ) x
       ) f
      WHERE c.id = $1`,
    [
      conta.id,
      gravadas,
      Number.isFinite(progresso) ? progresso : null,
      Number.isInteger(fase) && fase >= 0 && fase <= 2 ? fase : null,
      // A Meta manda as fases em sequência: chegou a fase N, as anteriores acabaram. A
      // fase 0 da conta #7 veio num pedaço só marcado 0% e nunca chegaria a 100 sozinha.
      JSON.stringify(Object.fromEntries([0, 1].filter((f) => f < fase).map((f) => [String(f), 100]))),
    ]
  );
  limparCacheContas();
  console.log(
    `[Coexistência] conta #${conta.id} — histórico fase ${meta.phase ?? '?'} pedaço ${meta.chunk_order ?? '?'} ` +
      `(${meta.progress ?? '?'}%): ${gravadas} mensagem(ns) nova(s)`
  );
  return gravadas;
}
