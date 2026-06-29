import { Request, Response, NextFunction } from 'express';
import { query } from '../../../config/database';
import { adicionarJobAgente } from '../../agente-ia/agente-ia.queue';
import { automacoesGrupoService as automacoesService } from '../../automacoes/automacoes-grupo.service';
import { leadsService } from '../leads/leads.service';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024';
const UPLOADS_DIR = '/var/www/apps/gestao_financeira/uploads/whatsapp';

// Webhook de captação de leads do formulário "Leadership" (escolapanthers.com.br/leadership).
// Cada lead cai no funil "Club" (id 5), estágio de entrada "Novos", sob responsabilidade da Débora (id 22).
const FORM_WEBHOOK_SECRET = process.env.LEADERSHIP_FORM_WEBHOOK_SECRET || '';
const FORM_LEAD_EMPRESA_ID = Number(process.env.LEADERSHIP_FORM_EMPRESA_ID) || 5;
const FORM_LEAD_FUNIL_ID = Number(process.env.LEADERSHIP_FORM_FUNIL_ID) || 5;
const FORM_LEAD_RESPONSAVEL_ID = Number(process.env.LEADERSHIP_FORM_RESPONSAVEL_ID) || 22;
const FORM_LEAD_ORIGEM = 'Leadership (form site)';

// Extrai o valor de um campo aceitando os formatos comuns de webhook de form:
// - flat (Elementor com Field ID = nome):           body.nome
// - aninhado Elementor "fields[nome][value]":        body.fields.nome.value | body.fields.nome
// - aninhado "form_fields[nome]":                    body.form_fields.nome
// Testa cada alias (ex.: nome, name, first_name) em cada formato.
function pickFormField(body: any, aliases: string[]): string {
  if (!body) return '';
  const containers = [body, body.fields, body.form_fields, body.data].filter(Boolean);
  for (const alias of aliases) {
    for (const c of containers) {
      const v = c?.[alias];
      if (v == null) continue;
      const val = typeof v === 'object' ? (v.value ?? v.raw_value ?? '') : v;
      if (val !== '' && val != null) return String(val).trim();
    }
  }
  return '';
}

// Normaliza uma chave de campo: minúsculas, sem acentos, só letras/números/espaço.
// Ex.: "Qual seu melhor e-mail?" → "qual seu melhor e mail"
function normKey(s: string): string {
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Fallback para quando o Elementor envia o RÓTULO da pergunta como chave
// (ex.: "Qual seu nome?") em vez do Field ID configurado (ex.: "nome").
// Casa por tokens (palavra inteira, evita "nome" casar com "sobrenome"):
// a chave precisa conter TODOS os tokens de `todos` e — se `algum` for informado —
// ao menos um deles (usado para distinguir faturamento atual x objetivo).
function pickByTokens(body: any, todos: string[], algum: string[] = []): string {
  if (!body) return '';
  const containers = [body, body.fields, body.form_fields, body.data].filter(Boolean);
  for (const c of containers) {
    if (typeof c !== 'object') continue;
    for (const rawKey of Object.keys(c)) {
      const tokens = new Set(normKey(rawKey).split(' ').filter(Boolean));
      if (!todos.every(t => tokens.has(t))) continue;
      if (algum.length && !algum.some(t => tokens.has(t))) continue;
      const v = (c as any)[rawKey];
      const val = v && typeof v === 'object' ? (v.value ?? v.raw_value ?? '') : v;
      if (val !== '' && val != null) return String(val).trim();
    }
  }
  return '';
}

function mapWhatsAppType(type: string): string {
  const typeMap: Record<string, string> = {
    chat: 'texto',
    image: 'imagem',
    ptt: 'audio',
    audio: 'audio',
    document: 'documento',
    video: 'video',
    sticker: 'sticker',
    location: 'location'
  };
  return typeMap[type] || 'texto';
}

function getFileExtension(mimetype: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/ogg; codecs=opus': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/3gpp': '.3gp',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/msword': '.doc',
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-zip-compressed': '.zip',
    'text/plain': '.txt',
    'text/csv': '.csv',
  };
  if (extMap[mimetype]) return extMap[mimetype];
  // Fallback: derive from MIME subtype (e.g. "application/pdf" → ".pdf")
  const sub = mimetype.split('/')[1]?.split(';')[0]?.trim();
  return sub ? `.${sub}` : '.bin';
}

// Constrói variantes do número para busca robusta:
// - com/sem DDI 55 (Brasil)
// - com/sem o 9º dígito de celular após o DDD (formato novo de 13 dígitos vs antigo de 12)
// Cobre o caso em que o WhatsApp entrega o JID em um formato diferente do telefone salvo no CRM
// (ex.: recebe "555391177869" mas o lead está salvo como "5553991177869"), que antes derrubava
// a mensagem recebida por não encontrar o contato.
function buildNumeroVariants(numero: string): string[] {
  const d = (numero || '').replace(/\D/g, '');
  if (!d) return numero ? [numero] : [];
  const variants = new Set<string>([numero, d]);

  // semPais = DDD (2 dígitos) + número (8 ou 9 dígitos)
  const addBR = (semPais: string) => {
    variants.add(semPais);
    variants.add(`55${semPais}`);
    if (semPais.length === 10) {
      // formato antigo (sem o 9) → gera variante com o 9 após o DDD
      const com9 = semPais.slice(0, 2) + '9' + semPais.slice(2);
      variants.add(com9);
      variants.add(`55${com9}`);
    } else if (semPais.length === 11 && semPais[2] === '9') {
      // formato novo (com o 9) → gera variante sem o 9 após o DDD
      const sem9 = semPais.slice(0, 2) + semPais.slice(3);
      variants.add(sem9);
      variants.add(`55${sem9}`);
    }
  };

  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    addBR(d.slice(2));
  } else if (d.length === 10 || d.length === 11) {
    addBR(d);
  } else if (d.length >= 8) {
    // Outros formatos (ex.: internacionais): mantém com/sem 55 sem mexer no 9º dígito
    variants.add(`55${d}`);
  }

  return [...variants];
}

// Transcreve áudio do WhatsApp via Gemini e enfileira para o agente IA.
// Requer gemini_api_key configurada na agente_ia_config da empresa.
async function transcreverEEnfileirar(
  contatoId: number,
  leadId: number,
  usuarioId: number,
  empresaId: number,
  audioBase64: string,
  mimetype: string | null
): Promise<void> {
  const configResult = await query(
    `SELECT c.gemini_api_key, c.api_key, c.provider, c.modelo
     FROM agente_ia_config a
     LEFT JOIN empresa_ia_credenciais c ON c.empresa_id = a.empresa_id
     WHERE a.empresa_id = $1 AND a.ativo = true LIMIT 1`,
    [empresaId]
  );
  const config = configResult.rows[0];
  const geminiKey = config?.gemini_api_key;
  if (!geminiKey) {
    console.log(`[AgenteIA] Lead #${leadId}: áudio ignorado — empresa #${empresaId} sem gemini_api_key`);
    return;
  }

  const mimeNorm = (mimetype || 'audio/ogg').split(';')[0].trim();
  // Usa o modelo Gemini configurado; se o provider for Anthropic, usa gemini-2.0-flash como fallback
  const modelo = config.modelo?.startsWith('gemini') ? config.modelo : 'gemini-2.0-flash';

  const geminiResponse = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${geminiKey}`,
    {
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeNorm, data: audioBase64 } },
          { text: 'Transcreva o que foi dito neste audio em portugues brasileiro. Retorne apenas o texto transcrito, sem comentarios ou explicacoes adicionais.' },
        ],
      }],
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  const transcricao = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!transcricao) {
    console.log(`[AgenteIA] Lead #${leadId}: transcrição vazia — áudio ignorado`);
    return;
  }

  console.log(`[AgenteIA] Lead #${leadId}: áudio transcrito → "${transcricao.substring(0, 80)}"`);
  await adicionarJobAgente(contatoId, leadId, `🎤 ${transcricao}`, usuarioId, empresaId);
}

export const webhookController = {
  async receberMensagem(req: Request, res: Response, next: NextFunction) {
    try {
      // Validar secret
      const secret = req.headers['x-webhook-secret'];
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      const {
        from, to, body, type, timestamp, hasMedia, messageId, mediaData, mimetype, filename, fromMe,
        // Campos adicionados para suporte a grupos WhatsApp
        isGroup, groupId, participant, pushname
      } = req.body;

      if (!from) {
        return res.status(400).json({ error: 'Campo "from" obrigatorio' });
      }

      // Guard: ignorar self-messages (from === to após normalização).
      // Ocorre quando o número do WhatsApp da instância coincide com o número de um lead
      // e o agente tenta enviar mensagem para si mesmo, gerando loop infinito.
      if (!fromMe && to) {
        const normNum = (n: string) => {
          const d = n.replace(/@.*$/, '').replace(/\D/g, '');
          return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
        };
        if (normNum(from) === normNum(to)) {
          console.log(`[Webhook] Self-message ignorada: from=to=${normNum(from)}`);
          return res.json({ success: true, processed: false, reason: 'self_message' });
        }
      }

      // Determinar direção e identificador do contato:
      // - fromMe=true → Débora enviou pelo celular; contato = destinatário (to)
      // - isGroup + participant → mensagem de grupo; contato = quem enviou (participant)
      // - caso normal → contato = remetente (from)
      const direcao = fromMe ? 'saida' : 'entrada';
      let contatoIdentifier: string;
      if (fromMe) {
        contatoIdentifier = to;
      } else if (isGroup && participant) {
        contatoIdentifier = participant;
      } else {
        contatoIdentifier = from;
      }
      const numero = (contatoIdentifier || from).replace(/@.*$/, '');
      const numerosVariantes = buildNumeroVariants(numero);

      // Buscar contato(s) pelo número com variantes (com/sem DDI 55)
      let contatosResult = await query(
        `SELECT cw.id, cw.usuario_id, cw.empresa_id
         FROM contatos_whatsapp cw
         WHERE cw.numero = ANY($1::text[])`,
        [numerosVariantes]
      );

      // Fallback: buscar pelo whatsapp_id completo (cobre @lid, @c.us, @s.whatsapp.net)
      if (contatosResult.rows.length === 0) {
        // contatoIdentifier já tem o JID correto (to para fromMe, participant para grupos, from para direto)
        const jidsToSearch = [
          contatoIdentifier,                    // JID como veio (pode ser @lid)
          `${numero}@c.us`,
          `${numero}@s.whatsapp.net`,
        ].filter(Boolean);
        contatosResult = await query(
          `SELECT cw.id, cw.usuario_id, cw.empresa_id
           FROM contatos_whatsapp cw
           WHERE cw.whatsapp_id = ANY($1::text[])`,
          [jidsToSearch]
        );
      }

      if (contatosResult.rows.length === 0) {
        // Auto-vinculação: buscar leads com telefone correspondente que ainda não têm contato vinculado
        const leadsParaVincular = await query(
          `SELECT l.id, l.nome, l.usuario_id, l.empresa_id
           FROM leads l
           WHERE l.arquivado = false
             AND l.contato_whatsapp_id IS NULL
             AND REGEXP_REPLACE(COALESCE(l.telefone, ''), '[^0-9]', '', 'g') = ANY($1::text[])`,
          [numerosVariantes]
        );

        if (leadsParaVincular.rows.length === 0) {
          console.log(`[Webhook] Contato nao encontrado: ${from} (numero: ${numero})${isGroup ? ` [grupo: ${groupId}]` : ''}`);
          return res.json({ success: true, processed: false, reason: 'contato_nao_encontrado' });
        }

        // Criar contato em contatos_whatsapp e vincular cada lead encontrado
        // whatsapp_id usa o JID correto do contato (não from quando fromMe=true)
        const contatoJid = contatoIdentifier || from;
        const contatosCriados: Array<{ id: number; usuario_id: number; empresa_id: number }> = [];
        for (const lead of leadsParaVincular.rows) {
          const novoContato = await query(
            `INSERT INTO contatos_whatsapp (
               usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at
             ) VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
             ON CONFLICT (usuario_id, whatsapp_id)
             DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id, usuario_id, empresa_id`,
            [lead.usuario_id, lead.empresa_id, contatoJid, numero]
          );
          const contato = novoContato.rows[0];

          // Vincular lead ao contato (só se ainda estiver sem vínculo)
          await query(
            `UPDATE leads SET contato_whatsapp_id = $1
             WHERE id = $2 AND contato_whatsapp_id IS NULL`,
            [contato.id, lead.id]
          );

          console.log(`[Webhook] Auto-vinculado: lead #${lead.id} (${lead.nome}) → contato ${numero}`);
          contatosCriados.push(contato);
        }

        contatosResult = { ...contatosResult, rows: contatosCriados };
      }

      // Para cada contato encontrado, garantir que leads com telefone correspondente estejam vinculados
      const numerosVariantesVinc = [numero];
      if (numero.startsWith('55') && numero.length >= 12) {
        numerosVariantesVinc.push(numero.slice(2));
      } else {
        numerosVariantesVinc.push(`55${numero}`);
      }
      for (const contato of contatosResult.rows) {
        const leadsNaoVinculados = await query(
          `SELECT id FROM leads
           WHERE empresa_id = $1
             AND arquivado = false
             AND contato_whatsapp_id IS NULL
             AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[])`,
          [contato.empresa_id, numerosVariantesVinc]
        );
        for (const lead of leadsNaoVinculados.rows) {
          await query(`UPDATE leads SET contato_whatsapp_id = $1 WHERE id = $2 AND contato_whatsapp_id IS NULL`,
            [contato.id, lead.id]);
          console.log(`[Webhook] Vinculado lead #${lead.id} ao contato ${contato.id} (${numero})`);
        }
      }

      const tipo = mapWhatsAppType(type);
      let mediaUrl: string | null = null;
      let mediaFilename: string | null = filename || null;
      let mediaMimetype: string | null = mimetype || null;
      let mediaTamanho: number | null = null;

      // Processar para cada contato encontrado (mesmo numero em diferentes usuarios)
      for (const contato of contatosResult.rows) {
        const { id: contatoId, usuario_id: usuarioId, empresa_id: empresaId } = contato;

        // Salvar midia se houver
        if (hasMedia && mediaData) {
          try {
            const userDir = path.join(UPLOADS_DIR, String(usuarioId));
            if (!fs.existsSync(userDir)) {
              fs.mkdirSync(userDir, { recursive: true });
            }

            const ext = mimetype ? getFileExtension(mimetype) : '.bin';
            const safeFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
            const filePath = path.join(userDir, safeFilename);

            const buffer = Buffer.from(mediaData, 'base64');
            fs.writeFileSync(filePath, buffer);

            mediaUrl = `/uploads/whatsapp/${usuarioId}/${safeFilename}`;
            mediaTamanho = buffer.length;
            if (!mediaFilename) {
              mediaFilename = safeFilename;
            }
          } catch (fileErr: any) {
            console.error('Erro ao salvar midia do webhook:', fileErr.message);
          }
        }

        // Verificar se mensagem ja existe no historico (evitar duplicatas de mensagens enviadas pelo CRM)
        if (messageId) {
          const existing = await query(
            `SELECT id FROM historico_mensagens WHERE whatsapp_message_id = $1 AND contato_whatsapp_id = $2 LIMIT 1`,
            [messageId, contatoId]
          );
          if (existing.rows.length > 0) {
            console.log(`[Webhook] Mensagem ja registrada (${messageId}), ignorando duplicata`);
            continue;
          }
        }

        // Atualizar pushname do contato se vier no payload e ainda não estiver salvo
        if (pushname && direcao === 'entrada') {
          await query(
            `UPDATE contatos_whatsapp SET
               nome_push = COALESCE(nome_push, $1),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND (nome_push IS NULL OR nome_push = '')`,
            [pushname, contatoId]
          );
        }

        // Inserir no historico de mensagens (com suporte a grupo)
        await query(
          `INSERT INTO historico_mensagens (
            contato_whatsapp_id, usuario_id, empresa_id, whatsapp_message_id,
            direcao, tipo, conteudo, media_url, media_filename, media_mimetype, media_tamanho,
            grupo_whatsapp_id, grupo_nome,
            enviado_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14))`,
          [
            contatoId,
            usuarioId,
            empresaId,
            messageId || null,
            direcao,
            tipo,
            body || null,
            mediaUrl,
            mediaFilename,
            mediaMimetype,
            mediaTamanho,
            isGroup ? (groupId || null) : null,
            isGroup ? (req.body.groupName || null) : null,
            timestamp || Math.floor(Date.now() / 1000)
          ]
        );

        // Atualizar contato: ultima mensagem
        if (direcao === 'entrada') {
          // Mensagem recebida: incrementar nao lidas
          await query(
            `UPDATE contatos_whatsapp SET
              ultima_mensagem = $1,
              ultima_mensagem_at = CURRENT_TIMESTAMP,
              mensagens_nao_lidas = COALESCE(mensagens_nao_lidas, 0) + 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
            [body || `[${tipo}]`, contatoId]
          );
        } else {
          // Mensagem enviada pelo app: atualizar ultima mensagem sem incrementar nao lidas
          await query(
            `UPDATE contatos_whatsapp SET
              ultima_mensagem = $1,
              ultima_mensagem_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
            [body || `[${tipo}]`, contatoId]
          );
        }

        // Buscar lead(s) vinculados a este contato
        const leadsResult = await query(
          `SELECT id FROM leads WHERE contato_whatsapp_id = $1 AND arquivado = false`,
          [contatoId]
        );

        for (const lead of leadsResult.rows) {
          if (direcao === 'entrada') {
            // Mensagem recebida: incrementar nao lidas e marcar que cliente respondeu
            await query(
              `UPDATE leads SET
                mensagens_nao_lidas = COALESCE(mensagens_nao_lidas, 0) + 1,
                aguardando_resposta = false,
                ultima_resposta_cliente_at = CURRENT_TIMESTAMP,
                data_ultimo_contato = CURRENT_TIMESTAMP
              WHERE id = $1`,
              [lead.id]
            );

            // Automação: se o estágio atual tem estagio_apos_resposta_id configurado, migrar lead
            try {
              const estagioResult = await query(
                `SELECT l.estagio_id, ef.estagio_apos_resposta_id,
                        ef.nome AS estagio_nome, ef2.nome AS estagio_destino_nome
                 FROM leads l
                 JOIN estagios_funil ef ON l.estagio_id = ef.id
                 LEFT JOIN estagios_funil ef2 ON ef.estagio_apos_resposta_id = ef2.id
                 WHERE l.id = $1`,
                [lead.id]
              );
              const estagioInfo = estagioResult.rows[0];
              if (estagioInfo?.estagio_apos_resposta_id &&
                  estagioInfo.estagio_id !== estagioInfo.estagio_apos_resposta_id) {
                await query(
                  `UPDATE leads SET estagio_id = $1 WHERE id = $2`,
                  [estagioInfo.estagio_apos_resposta_id, lead.id]
                );
                await query(
                  `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
                   VALUES ($1, $2, $3, 'mudanca_estagio', $4, $5::jsonb)`,
                  [
                    lead.id, usuarioId, contato.empresa_id,
                    `Movido automaticamente para "${estagioInfo.estagio_destino_nome || '?'}" após resposta do lead`,
                    JSON.stringify({
                      automatico: true,
                      trigger: 'resposta_lead',
                      estagio_anterior_id: estagioInfo.estagio_id,
                      estagio_anterior_nome: estagioInfo.estagio_nome,
                      novo_estagio_id: estagioInfo.estagio_apos_resposta_id,
                    }),
                  ]
                );
                console.log(`[Webhook] Lead #${lead.id} migrado para estágio #${estagioInfo.estagio_apos_resposta_id} (${estagioInfo.estagio_destino_nome}) por resposta`);
              }
            } catch (autoErr: any) {
              console.error(`[Webhook] Erro na automação de estágio para lead #${lead.id}:`, autoErr.message);
            }
          } else {
            // Mensagem enviada pelo app: atualizar data do ultimo contato e marcar aguardando resposta
            await query(
              `UPDATE leads SET
                aguardando_resposta = true,
                data_ultimo_contato = CURRENT_TIMESTAMP
              WHERE id = $1`,
              [lead.id]
            );
          }

          // Vincular mensagem ao lead
          await query(
            `UPDATE historico_mensagens SET lead_id = $1
             WHERE contato_whatsapp_id = $2 AND whatsapp_message_id = $3`,
            [lead.id, contatoId, messageId]
          );

          // Registrar atividade
          const tipoAtividade = direcao === 'entrada' ? 'mensagem_recebida' : 'mensagem_enviada';
          const descricao = direcao === 'entrada'
            ? (tipo === 'texto'
              ? `Mensagem recebida: "${(body || '').substring(0, 50)}${(body || '').length > 50 ? '...' : ''}"`
              : `Midia recebida: [${tipo}]`)
            : (tipo === 'texto'
              ? `Mensagem enviada (app): "${(body || '').substring(0, 50)}${(body || '').length > 50 ? '...' : ''}"`
              : `Midia enviada (app): [${tipo}]`);

          await query(
            `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              lead.id,
              usuarioId,
              contato.empresa_id,
              tipoAtividade,
              descricao,
              JSON.stringify({ messageId, tipo, hasMedia, fromMe: direcao === 'saida' })
            ]
          );

          // Enfileirar mensagem no BullMQ para processamento pelo agente IA
          if (direcao === 'entrada' && tipo === 'texto' && body && !isGroup) {
            adicionarJobAgente(contatoId, lead.id, body, usuarioId, contato.empresa_id)
              .catch((err: any) => console.error(`[AgenteIA] Erro ao enfileirar job para lead #${lead.id}:`, err.message));
          }
          // Áudio: transcreve via Gemini e enfileira (requer gemini_api_key na config do agente)
          if (direcao === 'entrada' && tipo === 'audio' && mediaData && !isGroup) {
            transcreverEEnfileirar(contatoId, lead.id, usuarioId, contato.empresa_id, mediaData, mimetype)
              .catch((err: any) => console.error(`[AgenteIA] Erro transcrição áudio lead #${lead.id}:`, err.message));
          }
        }
      }

      res.json({ success: true, processed: true });
    } catch (error) {
      console.error('Erro no webhook WhatsApp:', error);
      next(error);
    }
  },

  getSecret(_req: Request, res: Response) {
    res.json({ secret: WEBHOOK_SECRET });
  },

  // Recebe o preenchimento do formulário Leadership (WordPress/Elementor) e cria o lead no CRM.
  // Autenticada via header X-Webhook-Secret (LEADERSHIP_FORM_WEBHOOK_SECRET).
  async receberFormLeadership(req: Request, res: Response, next: NextFunction) {
    try {
      if (!FORM_WEBHOOK_SECRET) {
        console.error('[FormLead] LEADERSHIP_FORM_WEBHOOK_SECRET não configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }
      // Aceita o secret via header (X-Webhook-Secret) OU query string (?secret= / ?token=).
      // O Elementor Pro (action Webhook) não permite headers customizados, só o POST na URL —
      // por isso o fallback por query param.
      const secret = req.headers['x-webhook-secret'] || req.query.secret || req.query.token;
      if (secret !== FORM_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      // Primeiro tenta pelo Field ID (config recomendada); se vier vazio, cai no fallback
      // por rótulo da pergunta (Elementor às vezes envia o label como chave, ex.: "Qual seu nome?").
      const nome = pickFormField(req.body, ['nome', 'name', 'first_name', 'primeiro_nome'])
        || pickByTokens(req.body, ['nome']);
      const sobrenome = pickFormField(req.body, ['sobrenome', 'last_name', 'surname'])
        || pickByTokens(req.body, ['sobrenome']);
      const telefone = pickFormField(req.body, ['telefone', 'phone', 'celular', 'whatsapp', 'tel'])
        || pickByTokens(req.body, ['telefone']) || pickByTokens(req.body, ['celular']);
      const email = pickFormField(req.body, ['email', 'e-mail', 'mail'])
        || pickByTokens(req.body, ['email']) || pickByTokens(req.body, ['mail']);

      // Campos de qualificação do formulário Leadership — gravados em `notas` do lead (sem coluna própria).
      const negocio = pickFormField(req.body, ['negocio', 'negócio', 'business'])
        || pickByTokens(req.body, ['negocio']) || pickByTokens(req.body, ['ramo']);
      // Faturamento atual x objetivo: ambos os rótulos contêm "faturamento" → desambigua por token extra.
      const faturamento = pickFormField(req.body, ['faturamento', 'revenue', 'faturamento1', 'faturamentoum'])
        || pickByTokens(req.body, ['faturamento'], ['hoje', 'medio', 'mensal', 'atual']);
      const faturamentoDois = pickFormField(req.body, ['faturamentodois', 'faturamento2', 'faturamento_dois', 'revenue2'])
        || pickByTokens(req.body, ['faturamento'], ['objetivo', 'meses', 'proximos', 'meta', 'futuro']);

      const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();

      // Monta o bloco de notas só com os campos preenchidos.
      const notas = [
        negocio && `Negócio: ${negocio}`,
        faturamento && `Faturamento: ${faturamento}`,
        faturamentoDois && `Faturamento 2: ${faturamentoDois}`,
      ].filter(Boolean).join('\n') || undefined;

      if (!nomeCompleto && !telefone && !email) {
        console.warn('[FormLead] Payload sem campos reconhecidos:', JSON.stringify(req.body).slice(0, 500));
        return res.status(400).json({ error: 'Nenhum campo reconhecido (nome/telefone/email)' });
      }

      try {
        const lead = await leadsService.create(
          FORM_LEAD_EMPRESA_ID,
          FORM_LEAD_RESPONSAVEL_ID,
          {
            funil_id: FORM_LEAD_FUNIL_ID,        // estagio_id omitido → usa o estágio de entrada ("Novos")
            responsavel_id: FORM_LEAD_RESPONSAVEL_ID,
            nome: nomeCompleto || telefone || email,
            telefone: telefone || undefined,
            email: email || undefined,
            origem: FORM_LEAD_ORIGEM,
            notas,
          },
          false // requireTarefa = false (lead automático de captação)
        );
        console.log(`[FormLead] Lead #${lead.id} criado: "${lead.nome}" (${telefone || email})`);
        return res.status(201).json({ success: true, lead_id: lead.id });
      } catch (err: any) {
        // Duplicata de telefone: já existe lead → responde 200 para não reenviar o form
        if (/Já existe um lead/i.test(err?.message || '')) {
          console.log(`[FormLead] Duplicata ignorada: ${err.message}`);
          return res.json({ success: true, duplicate: true, message: err.message });
        }
        throw err;
      }
    } catch (error) {
      console.error('[FormLead] Erro no webhook do formulário Leadership:', error);
      next(error);
    }
  },

  async novoParticipanteGrupo(req: Request, res: Response, next: NextFunction) {
    try {
      const secret = req.headers['x-webhook-secret'];
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      const { groupId, participantJid, participantName, usuarioPorta } = req.body;

      if (!groupId || !participantJid) {
        return res.status(400).json({ error: 'groupId e participantJid sao obrigatorios' });
      }

      let empresaIds: number[] = [];

      if (usuarioPorta) {
        const users = await query(
          `SELECT empresa_id FROM usuarios WHERE whatsapp_porta = $1`,
          [usuarioPorta]
        );
        empresaIds = users.rows.map(r => r.empresa_id).filter(Boolean);
      } else {
        const grupos = await query(
          `SELECT DISTINCT empresa_id FROM contatos_whatsapp
           WHERE whatsapp_id = $1 AND is_grupo = true`,
          [groupId]
        );
        empresaIds = grupos.rows.map(r => r.empresa_id);
      }

      if (empresaIds.length === 0) {
        console.log(`[Webhook Grupo] Nenhuma empresa encontrada para grupo ${groupId}`);
        return res.json({ success: true, processed: false, reason: 'empresa_nao_encontrada' });
      }

      for (const empresaId of empresaIds) {
        await automacoesService.processarNovoParticipante(
          groupId,
          participantJid,
          participantName || null,
          empresaId
        );
      }

      res.json({ success: true, processed: true, empresas: empresaIds.length });
    } catch (error) {
      console.error('[Webhook Grupo] Erro:', error);
      next(error);
    }
  }
};
