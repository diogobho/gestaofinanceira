import { query } from '../../../config/database';
import { marcarOrigemErro } from '../../../shared/erros';

/**
 * Quem originou a mensagem de saída (migration 070). Só 'manual' fica de fora do
 * espaçamento anti-ban: conversa de gente não é rajada de robô e não pode segurar
 * a fila de automação.
 */
export type OrigemMensagem = 'manual' | 'followup' | 'disparo' | 'agente_ia' | 'lembrete';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { vinculoDivergente, erroVinculoDivergente, divergenciaApenasNoPrefixo, comDDIParaEnvio, variantesTelefone, chaveTelefone } from '../_shared/telefone';
import { leadsService } from '../leads/leads.service';
import { instancia, destinoCloud, statusDoErroMeta } from '../../whatsapp/canal/instancia';
import { ehPortaVirtual, contaPorPorta, contaAtivaDoContato, credenciaisDa } from '../../whatsapp/canal/contas';
import { markMessageAsRead } from '../../whatsapp/meta/meta-whatsapp.service';
import { acharModelo, enviarModelo, renderizarModelo, ValoresModelo } from '../../whatsapp/canal/modelos';

const UPLOADS_DIR = '/var/www/apps/gestao_financeira/uploads/whatsapp';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crm-whatsapp-webhook-secret-2024';

export interface ContatoWhatsApp {
  id: number;
  usuario_id: number;
  empresa_id: number;
  whatsapp_id: string;
  numero: string;
  nome?: string;
  nome_push?: string;
  foto_url?: string;
  is_grupo: boolean;
  ultima_mensagem?: string;
  ultima_mensagem_at?: Date;
  sincronizado_at: Date;
  created_at: Date;
  updated_at: Date;
}

export const contatosService = {
  // Lista contatos da empresa (não apenas do usuário)
  async list(empresaId: number, apenasIndividuais = true): Promise<ContatoWhatsApp[]> {
    let whereGrupo = '';
    if (apenasIndividuais) {
      whereGrupo = 'AND is_grupo = false';
    }

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM historico_mensagens hm
          WHERE hm.contato_whatsapp_id = c.id AND hm.grupo_whatsapp_id IS NULL
            AND NOT hm.copia_indevida) as total_mensagens,
        (SELECT COUNT(*) FROM leads l WHERE l.contato_whatsapp_id = c.id) as total_leads
       FROM contatos_whatsapp c
       WHERE c.empresa_id = $1 ${whereGrupo}
       ORDER BY c.ultima_mensagem_at DESC NULLS LAST, c.nome ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async listNaoConvertidos(empresaId: number, funilId?: number): Promise<ContatoWhatsApp[]> {
    let whereExtra = '';
    const params: any[] = [empresaId];

    if (funilId) {
      whereExtra = `
        AND c.id NOT IN (
          SELECT contato_whatsapp_id FROM leads
          WHERE funil_id = $2 AND contato_whatsapp_id IS NOT NULL
        )
      `;
      params.push(funilId);
    } else {
      whereExtra = `
        AND c.id NOT IN (
          SELECT contato_whatsapp_id FROM leads
          WHERE contato_whatsapp_id IS NOT NULL
        )
      `;
    }

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM historico_mensagens hm
          WHERE hm.contato_whatsapp_id = c.id AND hm.grupo_whatsapp_id IS NULL
            AND NOT hm.copia_indevida) as total_mensagens
       FROM contatos_whatsapp c
       WHERE c.empresa_id = $1
         AND c.is_grupo = false
         ${whereExtra}
       ORDER BY c.ultima_mensagem_at DESC NULLS LAST, c.nome ASC`,
      params
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<ContatoWhatsApp | null> {
    const result = await query(
      `SELECT * FROM contatos_whatsapp WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async getByNumero(numero: string, empresaId: number): Promise<ContatoWhatsApp | null> {
    const result = await query(
      `SELECT * FROM contatos_whatsapp WHERE numero = $1 AND empresa_id = $2`,
      [numero, empresaId]
    );
    return result.rows[0] || null;
  },

  async sincronizar(usuarioId: number, empresaId: number): Promise<{ total: number; novos: number; atualizados: number }> {
    // Buscar porta WhatsApp do usuário
    const configResult = await query(
      `SELECT whatsapp_porta, whatsapp_conectado FROM usuarios WHERE id = $1`,
      [usuarioId]
    );

    const config = configResult.rows[0];
    if (!config?.whatsapp_porta) {
      throw new Error('WhatsApp não configurado. Configure a porta nas configurações.');
    }

    const porta = config.whatsapp_porta;

    // Verificar status da conexão
    try {
      const statusResponse = await instancia(porta).get(`/status`, {
        timeout: 5000
      });

      // API retorna { status: "connected" } ou { connected: true }
      const isConnected = statusResponse.data.status === 'connected' || statusResponse.data.connected === true;
      if (!isConnected) {
        throw new Error('WhatsApp não está conectado. Escaneie o QR Code primeiro.');
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Serviço WhatsApp não está rodando. Inicie o serviço primeiro.');
      }
      throw error;
    }

    // Pedir a agenda atualizada ao WhatsApp antes de ler. A instância mantém os
    // contatos em cache, então sem isto o "Sincronizar" só releria o que já
    // tinha e um contato salvo agora no celular nunca apareceria.
    // Best-effort: instância antiga não tem essa rota, e falhar aqui não deve
    // impedir a sincronização do que já está em cache.
    try {
      await instancia(porta).post(`/contacts/resync`, {}, { timeout: 45000 });
    } catch (error: any) {
      console.warn(`[Contatos] Resync da agenda falhou na porta ${porta}: ${error.message}`);
    }

    // Buscar contatos/chats do WhatsApp (com fotos)
    let chats: any[] = [];
    try {
      const chatsResponse = await instancia(porta).get(`/chats`, {
        params: { photos: 'true' },
        timeout: 120000  // 2 minutos para buscar fotos
      });

      if (!chatsResponse.data.success) {
        throw new Error('Erro ao buscar contatos do WhatsApp');
      }

      chats = chatsResponse.data.chats || [];
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Timeout ao buscar contatos. Tente novamente.');
      }
      throw error;
    }

    let novos = 0;
    let atualizados = 0;

    for (const chat of chats) {
      // Extrair número do ID (5524988344048@c.us -> 5524988344048)
      const numero = chat.id.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
      const isGrupo = chat.id.includes('@g.us');

      // Upsert contato (agora com empresa_id)
      const result = await query(
        `INSERT INTO contatos_whatsapp (
          usuario_id, empresa_id, whatsapp_id, numero, nome, nome_push, foto_url, is_grupo,
          ultima_mensagem, ultima_mensagem_at, sincronizado_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (usuario_id, whatsapp_id)
        DO UPDATE SET
          nome = COALESCE(EXCLUDED.nome, contatos_whatsapp.nome),
          nome_push = COALESCE(EXCLUDED.nome_push, contatos_whatsapp.nome_push),
          foto_url = COALESCE(EXCLUDED.foto_url, contatos_whatsapp.foto_url),
          ultima_mensagem = COALESCE(EXCLUDED.ultima_mensagem, contatos_whatsapp.ultima_mensagem),
          ultima_mensagem_at = COALESCE(EXCLUDED.ultima_mensagem_at, contatos_whatsapp.ultima_mensagem_at),
          sincronizado_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted`,
        [
          usuarioId,
          empresaId,
          chat.id,
          numero,
          chat.name || null,
          chat.pushname || chat.name || null,
          chat.profilePicUrl || null,
          isGrupo,
          chat.lastMessage?.body || null,
          chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp * 1000) : null
        ]
      );

      if (result.rows[0].inserted) {
        novos++;
      } else {
        atualizados++;
      }
    }

    return {
      total: chats.length,
      novos,
      atualizados
    };
  },

  /**
   * Grava o JID que o WhatsApp confirmou no envio. É a única correção de número
   * feita automaticamente, porque não é palpite: é o destino real que recebeu a
   * mensagem. Assim a base vai se acertando sozinha conforme é usada, sem
   * nenhuma consulta a mais e sem regra de formato.
   *
   * Não mexe em grupo nem em @lid (não carregam telefone), e desiste em silêncio
   * se o JID já pertence a outro contato do mesmo usuário — nesse caso há dois
   * cadastros para a mesma pessoa, o que é problema de duplicidade, não de formato.
   */
  async _corrigirJidConfirmado(contato: any, jidConfirmado?: string): Promise<void> {
    if (!jidConfirmado || !jidConfirmado.includes('@s.whatsapp.net')) return;
    if (contato.is_grupo) return;

    const jidCanonico = jidConfirmado.replace('@s.whatsapp.net', '@c.us');
    if (jidCanonico === contato.whatsapp_id) return;

    const numeroCanonico = jidConfirmado.replace(/@.*$/, '');
    try {
      await query(
        `UPDATE contatos_whatsapp SET whatsapp_id = $1, numero = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
           AND NOT EXISTS (
             SELECT 1 FROM contatos_whatsapp c2
             WHERE c2.usuario_id = contatos_whatsapp.usuario_id AND c2.whatsapp_id = $1 AND c2.id <> $3
           )`,
        [jidCanonico, numeroCanonico, contato.id]
      );
    } catch (err: any) {
      console.warn(`[Contatos] Não foi possível gravar o JID confirmado do contato #${contato.id}: ${err.message}`);
    }
  },

  async findOrCreateByNumero(numero: string, usuarioId: number, empresaId: number): Promise<ContatoWhatsApp> {
    const originalDigits = numero.replace(/\D/g, '');

    if (!originalDigits) {
      throw new Error('Numero de telefone invalido');
    }

    // Reaproveita contato existente em qualquer das formas do mesmo número
    // (com/sem DDI 55, com/sem 9º dígito).
    const existing = await query(
      `SELECT * FROM contatos_whatsapp
       WHERE REGEXP_REPLACE(COALESCE(numero, ''), '[^0-9]', '', 'g') = ANY($1::text[])
         AND empresa_id = $2 LIMIT 1`,
      [variantesTelefone(originalDigits), empresaId]
    );
    if (existing.rows[0]) return existing.rows[0];

    // O JID precisa de DDI para ter destino; o número em si vai como veio. Se o
    // WhatsApp responder um JID diferente no primeiro envio, ele é corrigido lá.
    const numeroLimpo = originalDigits;
    const whatsappId = `${comDDIParaEnvio(originalDigits)}@c.us`;

    const result = await query(
      `INSERT INTO contatos_whatsapp (
        usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at
      ) VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id, whatsapp_id)
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [usuarioId, empresaId, whatsappId, numeroLimpo]
    );

    return result.rows[0];
  },

  /**
   * De qual WhatsApp a mensagem do lead sai: o do RESPONSÁVEL do card — mesma
   * regra que o follow-up e os lembretes de reunião já seguem ("a mensagem sai
   * SEMPRE pelo WhatsApp do responsável do lead"). O chat manual usava o número
   * de quem estava logado, então o mesmo lead falava por dois números conforme
   * quem abrisse o card.
   *
   * Cai para quem está operando quando o responsável não tem chip configurado —
   * senão o envio manual quebraria com "WhatsApp não configurado" para
   * responsável sem número (ex.: Sabrina, Nicole).
   */
  async resolverRemetente(responsavelId: number | null | undefined, fallbackId: number): Promise<number> {
    if (!responsavelId || responsavelId === fallbackId) return fallbackId;
    const result = await query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [responsavelId]);
    return result.rows[0]?.whatsapp_porta ? responsavelId : fallbackId;
  },

  /** Mesma regra, para quem só tem o id do lead em mãos. Sem lead, é quem opera. */
  async resolverRemetenteDoLead(leadId: number | undefined | null, empresaId: number, fallbackId: number): Promise<number> {
    if (!leadId) return fallbackId;
    const result = await query(
      `SELECT responsavel_id FROM leads WHERE id = $1 AND empresa_id = $2`,
      [leadId, empresaId]
    );
    return this.resolverRemetente(result.rows[0]?.responsavel_id, fallbackId);
  },

  /**
   * O destino gravado no contato já se provou real, com mensagem RECEBIDA dele.
   *
   * É a única prova forte que temos. Saída sem erro não serve: até a instância
   * passar a consultar `onWhatsApp`, todo `/send` respondia `success` sem checar
   * nada — o card do Breno tem 6 saídas "sem erro" para um número que hoje
   * devolve 422. Entrada, não: alguém do outro lado escreveu.
   *
   * Com essa prova, a diferença entre o telefone do card e o número do contato é
   * erro de CADASTRO, não risco de falar com estranho — e barrar o envio
   * derrubaria uma conversa em andamento.
   */
  async destinoConfirmadoPorResposta(contatoId: number): Promise<boolean> {
    const r = await query(
      `SELECT 1 FROM historico_mensagens
        WHERE contato_whatsapp_id = $1 AND direcao = 'entrada' AND NOT copia_indevida LIMIT 1`,
      [contatoId]
    );
    return (r.rowCount ?? 0) > 0;
  },

  /**
   * A decisão completa de barrar ou não o envio por vínculo errado, num lugar só
   * — o chat do card, o follow-up e o disparo em massa precisam responder igual.
   *
   * Devolve a mensagem de erro, ou null quando pode enviar. São dois níveis:
   * número de OUTRA pessoa barra sempre; mesmo assinante com o começo errado
   * (DDI/DDD) barra só enquanto ninguém tiver respondido naquela conversa.
   */
  async bloqueioPorVinculo(
    telefoneLead: string | null | undefined,
    contato: { id: number; numero: string | null; whatsapp_id?: string | null }
  ): Promise<string | null> {
    if (!vinculoDivergente(telefoneLead, contato.numero, contato.whatsapp_id)) return null;

    if (
      divergenciaApenasNoPrefixo(telefoneLead, contato.numero) &&
      (await this.destinoConfirmadoPorResposta(contato.id))
    ) {
      return null;
    }

    return erroVinculoDivergente(telefoneLead, contato.numero);
  },

  async enviarMensagem(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    mensagem: string,
    leadId?: number,
    // Quem originou a mensagem (migration 070). O espaçamento anti-ban conta só
    // automação: sem isto, a conversa manual do operador empurrava a fila de
    // follow-up indefinidamente. 'manual' é o padrão porque o caminho mais comum
    // desta função é o chat do card, operado por gente.
    origem: OrigemMensagem = 'manual'
  ): Promise<{ success: boolean; messageId?: string; error?: string; status?: number }> {
    // Buscar contato (verificando empresa)
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) {
      throw new Error('Contato não encontrado');
    }

    // Vínculo errado manda a mensagem para outra pessoa: barrar antes de enviar.
    if (leadId) {
      const leadRes = await query(`SELECT telefone FROM leads WHERE id = $1 AND empresa_id = $2`, [leadId, empresaId]);
      const telefoneLead = leadRes.rows[0]?.telefone;
      // success:false → 400 com texto claro no card; enviarMensagemOuFalhar re-lança nos jobs.
      const bloqueio = await this.bloqueioPorVinculo(telefoneLead, contato);
      if (bloqueio) return { success: false, error: bloqueio };
    }

    // Buscar porta WhatsApp
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );

    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      throw new Error('WhatsApp não configurado');
    }

    // Enviar mensagem usando whatsapp_id como chatId (suporta @c.us, @g.us, @lid)
    try {
      const response = await instancia(porta).post(`/send`, {
        number: contato.whatsapp_id,
        message: mensagem
      }, {
        timeout: 30000
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao enviar mensagem');
      }

      await this._corrigirJidConfirmado(contato, response.data.jid);

      // Registrar no histórico (com empresa_id)
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          whatsapp_message_id, direcao, tipo, conteudo, origem, enviado_at
        ) VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, $7, CURRENT_TIMESTAMP)`,
        [
          leadId || null,
          contatoId,
          usuarioId,
          empresaId,
          response.data.messageId || null,
          mensagem,
          origem
        ]
      );

      // Atualizar data do ultimo contato e marcar aguardando resposta
      if (leadId) {
        await query(
          `UPDATE leads SET data_ultimo_contato = CURRENT_TIMESTAMP, aguardando_resposta = true WHERE id = $1`,
          [leadId]
        );
      }

      return {
        success: true,
        messageId: response.data.messageId
      };
    } catch (error: any) {
      // A API do WhatsApp responde 4xx com o motivo no corpo (ex.: número sem conta).
      // Sem isso o usuário só veria "Request failed with status code 422".
      const motivo = error.response?.data?.details || error.response?.data?.error || error.message;
      // O status distingue o que é definitivo (422 = número sem WhatsApp) do que é
      // transitório (503 = instância fora do ar). Quem re-lança perde essa informação
      // se ela não subir junto — e aí o job queima um follow-up que só precisava esperar.
      const status: number | undefined = error.response?.status;

      // Instância desconectada (503) não é tentativa de envio: nada saiu do app e o job
      // vai repetir. Gravar o balão vermelho a cada retry encheria a conversa do card
      // de "Falha no envio" da MESMA mensagem.
      if (status !== 503) {
        // Registrar erro no histórico
        await query(
          `INSERT INTO historico_mensagens (
            lead_id, contato_whatsapp_id, usuario_id, empresa_id,
            direcao, tipo, conteudo, erro, origem, enviado_at
          ) VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, $6, $7, CURRENT_TIMESTAMP)`,
          [
            leadId || null,
            contatoId,
            usuarioId,
            empresaId,
            mensagem,
            motivo,
            origem
          ]
        );
      }

      return {
        success: false,
        error: motivo,
        status
      };
    }
  },

  /**
   * Variante de enviarMensagem que LANÇA em falha de envio. Use em jobs/automações
   * (follow-up, lembretes, agente IA) onde uma falha silenciosa marcaria a mensagem
   * como enviada sem ela ter saído.
   */
  async enviarMensagemOuFalhar(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    mensagem: string,
    leadId?: number,
    origem: OrigemMensagem = 'manual'
  ): Promise<{ success: true; messageId?: string }> {
    const envio = await this.enviarMensagem(usuarioId, empresaId, contatoId, mensagem, leadId, origem);
    if (!envio.success) {
      // O status vai anexado ao Error: o corpo da instância traz só o texto
      // ("WhatsApp não conectado"), e sem o código o scheduler não consegue separar
      // instância fora do ar (503, adiar) de número sem conta (422, falhar de vez).
      const erro: any = new Error(envio.error || 'Falha no envio via WhatsApp');
      if (envio.status) erro.status = envio.status;
      // Origem carimbada na fonte: um 403 daqui é chip bloqueado/restrição do canal,
      // NUNCA credencial de IA — quem trata o erro decide por ela, não pelo número.
      throw marcarOrigemErro(erro, 'whatsapp');
    }
    return { success: true, messageId: envio.messageId };
  },

  /**
   * Envia um MODELO APROVADO pelo número oficial (Cloud API). É o único jeito de falar
   * com quem não escreveu nas últimas 24h — ver `whatsapp/canal/janela.ts`. Mesmo
   * contrato de `enviarMensagem`: nunca lança por falha de envio, grava o balão (ok ou
   * vermelho) e devolve `{ success, error, status }`.
   */
  async enviarModeloWhatsApp(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    pedido: { nome: string; idioma?: string; valores: ValoresModelo },
    leadId?: number,
    origem: OrigemMensagem = 'manual'
  ): Promise<{ success: boolean; messageId?: string; error?: string; status?: number; texto?: string }> {
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) throw new Error('Contato não encontrado');

    if (leadId) {
      const leadRes = await query(`SELECT telefone FROM leads WHERE id = $1 AND empresa_id = $2`, [leadId, empresaId]);
      const bloqueio = await this.bloqueioPorVinculo(leadRes.rows[0]?.telefone, contato);
      if (bloqueio) return { success: false, error: bloqueio, status: 422 };
    }

    const portaRes = await query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [usuarioId]);
    const porta = portaRes.rows[0]?.whatsapp_porta;
    const conta = ehPortaVirtual(porta) ? await contaPorPorta(porta) : null;
    if (!conta || !conta.ativo) {
      return {
        success: false,
        status: 400,
        error: 'Modelo aprovado só existe no WhatsApp oficial (Cloud API) — esta conta envia pelo WhatsApp conectado por QR Code.',
      };
    }

    let texto = `[modelo ${pedido.nome}]`;
    try {
      const modelo = await acharModelo(conta, pedido.nome, pedido.idioma);
      texto = renderizarModelo(modelo, pedido.valores);
      const destino = destinoCloud(contato.whatsapp_id || contato.numero);
      const r = await enviarModelo(conta, destino, modelo, pedido.valores);

      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          whatsapp_message_id, direcao, tipo, conteudo, origem, enviado_at
        ) VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, $7, CURRENT_TIMESTAMP)`,
        [leadId || null, contatoId, usuarioId, empresaId, r.messageId || null, r.texto, origem]
      );
      if (leadId) {
        await query(
          `UPDATE leads SET data_ultimo_contato = CURRENT_TIMESTAMP, aguardando_resposta = true WHERE id = $1`,
          [leadId]
        );
      }
      return { success: true, messageId: r.messageId, texto: r.texto };
    } catch (error: any) {
      const status: number = error.response?.status ?? (error.metaCode !== undefined ? statusDoErroMeta(error) : 422);
      const motivo: string = error.response?.data?.details || error.message || 'Falha ao enviar o modelo';
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          direcao, tipo, conteudo, erro, origem, enviado_at
        ) VALUES ($1, $2, $3, $4, 'saida', 'texto', $5, $6, $7, CURRENT_TIMESTAMP)`,
        [leadId || null, contatoId, usuarioId, empresaId, texto, motivo, origem]
      );
      return { success: false, error: motivo, status };
    }
  },

  /**
   * Histórico da conversa INDIVIDUAL do contato (é o que a UI mostra no chat do
   * lead e do contato). Mensagem de grupo fica gravada com o contato do
   * participante e `grupo_whatsapp_id` preenchido — sem este filtro, a conversa
   * 1:1 vinha misturada com a conversa dos grupos em que o contato participa.
   * Também esconde balão "[mensagem]": linha de texto sem conteúdo e sem mídia
   * não é mensagem (vinha de reação removida/protocolo gravado como envio).
   */
  // `copia_indevida` (migration 075): mensagem de outra empresa gravada aqui pelo
  // vazamento de até 19/08/2026. Fica no banco, mas não é conversa desta empresa.
  async getHistoricoMensagens(contatoId: number, empresaId: number, limit = 50): Promise<any[]> {
    const result = await query(
      `SELECT hm.*, u.nome as usuario_nome
       FROM historico_mensagens hm
       LEFT JOIN usuarios u ON hm.usuario_id = u.id
       WHERE hm.contato_whatsapp_id = $1 AND hm.empresa_id = $2
         AND hm.grupo_whatsapp_id IS NULL
         AND NOT hm.copia_indevida
         AND NOT (hm.tipo = 'texto' AND hm.media_url IS NULL
                  AND COALESCE(btrim(hm.conteudo), '') = '')
       ORDER BY hm.enviado_at DESC
       LIMIT $3`,
      [contatoId, empresaId, limit]
    );
    return result.rows;
  },

  async enviarMedia(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    filePath: string,
    originalFilename: string,
    mimetype: string,
    fileSize: number,
    caption?: string,
    leadId?: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) {
      throw new Error('Contato nao encontrado');
    }

    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      throw new Error('WhatsApp nao configurado');
    }

    // Mover arquivo para pasta da empresa
    const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
    if (!fs.existsSync(empresaDir)) {
      fs.mkdirSync(empresaDir, { recursive: true });
    }

    const ext = path.extname(originalFilename) || '';
    const safeFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destPath = path.join(empresaDir, safeFilename);
    fs.copyFileSync(filePath, destPath);

    // Converter para base64
    const fileBuffer = fs.readFileSync(destPath);
    const base64 = fileBuffer.toString('base64');

    // Determinar tipo da mensagem
    let tipo = 'documento';
    if (mimetype.startsWith('image/')) tipo = 'imagem';
    else if (mimetype.startsWith('audio/')) tipo = 'audio';
    else if (mimetype.startsWith('video/')) tipo = 'video';

    const mediaUrl = `/uploads/whatsapp/${empresaId}/${safeFilename}`;

    try {
      const response = await instancia(porta).post(`/send-media`, {
        number: contato.whatsapp_id,
        media: base64,
        mimetype,
        filename: originalFilename,
        caption: caption || undefined
      }, {
        timeout: 60000
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao enviar midia');
      }

      // Registrar no historico
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          whatsapp_message_id, direcao, tipo, conteudo,
          media_url, media_filename, media_mimetype, media_tamanho,
          enviado_at
        ) VALUES ($1, $2, $3, $4, $5, 'saida', $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          leadId || null,
          contatoId,
          usuarioId,
          empresaId,
          response.data.messageId || null,
          tipo,
          caption || null,
          mediaUrl,
          originalFilename,
          mimetype,
          fileSize
        ]
      );

      // Atualizar lead
      if (leadId) {
        await query(
          `UPDATE leads SET
            data_ultimo_contato = CURRENT_TIMESTAMP,
            aguardando_resposta = true
          WHERE id = $1`,
          [leadId]
        );
      }

      return { success: true, messageId: response.data.messageId };
    } catch (error: any) {
      // Registrar erro
      await query(
        `INSERT INTO historico_mensagens (
          lead_id, contato_whatsapp_id, usuario_id, empresa_id,
          direcao, tipo, conteudo, media_url, media_filename, media_mimetype, media_tamanho,
          erro, enviado_at
        ) VALUES ($1, $2, $3, $4, 'saida', $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          leadId || null, contatoId, usuarioId, empresaId,
          tipo, caption || null,
          mediaUrl, originalFilename, mimetype, fileSize,
          error.message
        ]
      );

      return { success: false, error: error.message };
    }
  },

  // Envia mídia JÁ ARMAZENADA em disco (ex.: anexo de follow-up). Diferente de enviarMedia,
  // não recebe upload temporário — resolve o arquivo a partir do media_url salvo.
  async enviarMediaArmazenada(
    usuarioId: number,
    empresaId: number,
    contatoId: number,
    mediaUrl: string,
    mimetype: string,
    originalFilename: string,
    caption?: string,
    leadId?: number,
    origem: OrigemMensagem = 'manual'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const contato = await this.getById(contatoId, empresaId);
    if (!contato) throw new Error('Contato nao encontrado');

    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) throw new Error('WhatsApp nao configurado');

    // media_url é servido em /uploads/... a partir da raiz do app.
    const absPath = path.join('/var/www/apps/gestao_financeira', mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(absPath)) {
      throw new Error(`Arquivo de mídia não encontrado: ${mediaUrl}`);
    }
    // Leitura ASSÍNCRONA: `readFileSync` de um vídeo de 20MB trava a event loop do
    // processo inteiro — nenhuma requisição HTTP é atendida enquanto isso, e o
    // orçamento de execução do follow-up não conseguiria nem contar o tempo.
    const fileBuffer = await fs.promises.readFile(absPath);
    const base64 = fileBuffer.toString('base64');

    let tipo = 'documento';
    if (mimetype.startsWith('image/')) tipo = 'imagem';
    else if (mimetype.startsWith('audio/')) tipo = 'audio';
    else if (mimetype.startsWith('video/')) tipo = 'video';

    // Mesmo contrato de erro de enviarMensagemOuFalhar: status + origem viajam no Error.
    // Sem isso, um follow-up COM MÍDIA que falhasse por instância fora do ar (503) subia
    // como "Request failed with status code 503" sem status nem origem — e o scheduler
    // não conseguia separar "esperar" de "queimar".
    let response: any;
    try {
      response = await instancia(porta).post(`/send-media`, {
        number: contato.whatsapp_id,
        media: base64,
        mimetype,
        filename: originalFilename,
        caption: caption || undefined
      }, { timeout: 60000 });
    } catch (error: any) {
      const motivo = error.response?.data?.details || error.response?.data?.error || error.message;
      const erro: any = new Error(motivo || 'Falha ao enviar mídia via WhatsApp');
      if (error.response?.status) erro.status = error.response.status;
      throw marcarOrigemErro(erro, 'whatsapp');
    }

    if (!response.data.success) {
      throw marcarOrigemErro(new Error(response.data.error || 'Erro ao enviar midia'), 'whatsapp');
    }

    await query(
      `INSERT INTO historico_mensagens (
        lead_id, contato_whatsapp_id, usuario_id, empresa_id,
        whatsapp_message_id, direcao, tipo, conteudo,
        media_url, media_filename, media_mimetype, media_tamanho,
        origem, enviado_at
      ) VALUES ($1, $2, $3, $4, $5, 'saida', $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
      [
        leadId || null, contatoId, usuarioId, empresaId,
        response.data.messageId || null, tipo, caption || null,
        mediaUrl, originalFilename, mimetype, fileBuffer.length,
        origem,
      ]
    );

    return { success: true, messageId: response.data.messageId };
  },

  // Garante um contato_whatsapp para o lead a partir do TELEFONE quando ele ainda não
  // tem contato vinculado (ex.: lead novo da Hotmart que nunca conversou). Reaproveita
  // um contato existente do mesmo número (com/sem DDI 55 e com/sem o 9º dígito) ou cria
  // um novo, e vincula ao lead. Retorna o contatoId, ou null se o telefone for inválido.
  async resolverContatoParaLead(
    leadId: number,
    usuarioId: number,
    empresaId: number
  ): Promise<number | null> {
    const leadRes = await query(`SELECT telefone FROM leads WHERE id = $1 AND empresa_id = $2`, [leadId, empresaId]);
    const digits = String(leadRes.rows[0]?.telefone || '').replace(/\D/g, '');
    if (!digits) return null;

    // Rejeita só o que não é telefone (ramal, ID colado, lixo). Número estrangeiro
    // é aceito: antes a regra exigia DDI 55 e descartava lead de fora do Brasil.
    if (digits.length < 10 || digits.length > 15) return null;

    // O JID precisa de DDI; o resto do número não é tocado.
    const norm = comDDIParaEnvio(digits);
    const variants = new Set<string>(variantesTelefone(digits));

    // 1) Tenta reusar um contato individual já existente deste usuário com o mesmo número.
    const existente = await query(
      `SELECT id FROM contatos_whatsapp
       WHERE usuario_id = $1 AND is_grupo = false
         AND REGEXP_REPLACE(COALESCE(numero, ''), '[^0-9]', '', 'g') = ANY($2::text[])
       ORDER BY id LIMIT 1`,
      [usuarioId, [...variants]]
    );

    let contatoId: number;
    if (existente.rows[0]) {
      contatoId = existente.rows[0].id;
    } else {
      // 2) Cria o contato (whatsapp_id no formato JID a partir do número normalizado).
      const novo = await query(
        `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at)
         VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
         ON CONFLICT (usuario_id, whatsapp_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [usuarioId, empresaId, `${norm}@c.us`, norm]
      );
      contatoId = novo.rows[0].id;
    }

    // Vincula o lead ao contato (só se ainda estiver sem vínculo).
    await query(
      `UPDATE leads SET contato_whatsapp_id = $1 WHERE id = $2 AND contato_whatsapp_id IS NULL`,
      [contatoId, leadId]
    );
    return contatoId;
  },

  async marcarLido(contatoId: number, empresaId: number, leadId?: number): Promise<void> {
    // Número oficial: avisa a Meta que alguém leu (tiques azuis para o cliente). Marcar
    // a mais recente marca as anteriores. Best-effort: falhar aqui não impede zerar o
    // contador do CRM.
    try {
      const conta = await contaAtivaDoContato(contatoId, empresaId);
      if (conta) {
        const ultima = await query(
          `SELECT whatsapp_message_id FROM historico_mensagens
            WHERE contato_whatsapp_id = $1 AND empresa_id = $2 AND direcao = 'entrada'
              AND lido_at IS NULL AND whatsapp_message_id LIKE 'wamid.%'
            ORDER BY enviado_at DESC LIMIT 1`,
          [contatoId, empresaId]
        );
        const id = ultima.rows[0]?.whatsapp_message_id;
        if (id) await markMessageAsRead(id, credenciaisDa(conta));
      }
    } catch (err: any) {
      console.warn(`[Contatos] não marcou como lida na Meta (contato #${contatoId}): ${err.message}`);
    }

    // Marcar mensagens de entrada como lidas (filtrar por empresa)
    await query(
      `UPDATE historico_mensagens SET lido_at = CURRENT_TIMESTAMP
       WHERE contato_whatsapp_id = $1 AND empresa_id = $2 AND direcao = 'entrada' AND lido_at IS NULL`,
      [contatoId, empresaId]
    );

    // Zerar contador no contato
    await query(
      `UPDATE contatos_whatsapp SET mensagens_nao_lidas = 0 WHERE id = $1 AND empresa_id = $2`,
      [contatoId, empresaId]
    );

    // Zerar contador no lead se informado
    if (leadId) {
      await query(
        `UPDATE leads SET mensagens_nao_lidas = 0 WHERE id = $1`,
        [leadId]
      );
    }
  },

  async registrarWebhook(usuarioId: number): Promise<{ success: boolean; error?: string }> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) {
      return { success: false, error: 'WhatsApp nao configurado' };
    }

    try {
      const webhookUrl = `http://localhost:4100/api/crm/webhook/whatsapp`;
      await instancia(porta).post(`/webhook/register`, {
        url: webhookUrl,
        secret: WEBHOOK_SECRET
      }, { timeout: 5000 });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getGrupos(usuarioId: number): Promise<any[]> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) throw new Error('WhatsApp não configurado');

    try {
      const response = await instancia(porta).get(`/groups`, { timeout: 30000 });
      if (!response.data.success) throw new Error('Erro ao buscar grupos do WhatsApp');
      return response.data.groups || [];
    } catch (error: any) {
      if (error.response?.status === 503 || error.response?.data?.error?.includes('não conectado')) {
        throw new Error('WhatsApp não conectado');
      }
      throw error;
    }
  },

  async getParticipantesGrupo(usuarioId: number, empresaId: number, groupId: string): Promise<any> {
    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;
    if (!porta) throw new Error('WhatsApp não configurado');

    const encodedId = encodeURIComponent(groupId);
    const response = await instancia(porta).get(`/groups/${encodedId}/participants`, {
      timeout: 15000
    });
    if (!response.data.success) throw new Error('Erro ao buscar participantes do grupo');

    // O grupo só traz o número; a lista mostra o nome que a conta já tem para ele.
    const participants = response.data.participants || [];
    const nomes = await this.nomesConhecidos(participants.map((p: any) => p.number), empresaId, porta);
    return {
      ...response.data,
      participants: participants.map((p: any) => ({
        ...p,
        nome: nomes.get(chaveTelefone(p.number) || '') || null,
      })),
    };
  },

  /**
   * O nome que a conta já tem para cada número, por ordem de confiança: contato da
   * empresa (nome da agenda antes do nome de perfil), agenda do próprio chip (store da
   * instância, que conhece contato que nunca conversou) e, por último, um lead da
   * empresa. A chave do mapa é `chaveTelefone`, então com/sem DDI e 9º dígito casam.
   */
  async nomesConhecidos(numeros: string[], empresaId: number, porta?: number | null): Promise<Map<string, string>> {
    const nomes = new Map<string, string>();
    const chaves = new Set(numeros.map(chaveTelefone).filter((c): c is string => !!c));
    if (!chaves.size) return nomes;
    const variantes = [...new Set(numeros.flatMap(n => variantesTelefone(n)))];

    const guardar = (numero: string, nome: string | null | undefined) => {
      const chave = chaveTelefone(numero);
      const limpo = String(nome || '').trim();
      // Nome sem letra é o telefone gravado como nome; "Participante 55…" é o
      // marcador que esta importação usava quando não achava nome.
      if (!chave || !chaves.has(chave) || nomes.has(chave)) return;
      if (!/[a-zà-ÿ]/i.test(limpo) || /^participante\s+\d+$/i.test(limpo)) return;
      nomes.set(chave, limpo.slice(0, 200));
    };

    const contatos = await query(
      `SELECT numero, nome, nome_push FROM contatos_whatsapp
        WHERE empresa_id = $1
          AND COALESCE(is_grupo, false) = false
          AND REGEXP_REPLACE(COALESCE(numero, ''), '[^0-9]', '', 'g') = ANY($2::text[])
        ORDER BY ultima_mensagem_at DESC NULLS LAST`,
      [empresaId, variantes]
    );
    // Duas passadas: nome da agenda de qualquer contato vence o nome de perfil.
    for (const r of contatos.rows) guardar(r.numero, r.nome);
    for (const r of contatos.rows) guardar(r.numero, r.nome_push);

    if (porta && nomes.size < chaves.size) {
      try {
        const resp = await instancia(porta).get('/chats', { timeout: 10000 });
        const chats: any[] = resp.data?.chats || [];
        for (const c of chats) guardar(String(c.id || '').replace(/@.*$/, ''), c.name);
        for (const c of chats) guardar(String(c.id || '').replace(/@.*$/, ''), c.pushname);
      } catch {
        // Chip fora do ar: fica com o que o banco sabe.
      }
    }

    if (nomes.size < chaves.size) {
      const leads = await query(
        `SELECT telefone, nome FROM leads
          WHERE empresa_id = $1 AND arquivado = false
            AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
          ORDER BY updated_at DESC NULLS LAST`,
        [empresaId, variantes]
      );
      for (const r of leads.rows) guardar(r.telefone, r.nome);
    }

    return nomes;
  },

  async importarParticipantesComoLeads(
    usuarioId: number,
    empresaId: number,
    groupId: string,
    funilId: number,
    participanteIds: Array<string | { id: string; number?: string }>,
    estagioIdParam?: number,
    responsavelId?: number
  ): Promise<{ criados: number; jaExistem: number; comNome: number }> {
    let criados = 0;
    let jaExistem = 0;
    let comNome = 0;

    // O funil vem do body: tem que ser da empresa do token.
    const funilResult = await query(
      `SELECT id FROM funis WHERE id = $1 AND empresa_id = $2`,
      [funilId, empresaId]
    );
    if (!funilResult.rows[0]) throw new Error('Funil não encontrado');

    let estagioId: number;

    if (estagioIdParam) {
      // Validar que o estágio pertence ao funil
      const estagioResult = await query(
        `SELECT id FROM estagios_funil WHERE id = $1 AND funil_id = $2 LIMIT 1`,
        [estagioIdParam, funilId]
      );
      if (!estagioResult.rows[0]) {
        throw new Error('Estágio não pertence ao funil informado');
      }
      estagioId = estagioIdParam;
    } else {
      // Estágio de entrada; sem nenhum marcado, o primeiro da ordem — a mesma regra da
      // importação por planilha. Exigir `is_entrada` travava 12 funis (Vendas CRM incluso).
      const estagioResult = await query(
        `SELECT id FROM estagios_funil
          WHERE funil_id = $1
          ORDER BY is_entrada DESC NULLS LAST, ordem ASC, id ASC
          LIMIT 1`,
        [funilId]
      );
      if (!estagioResult.rows[0]) {
        throw new Error('Funil não possui estágios configurados');
      }
      estagioId = estagioResult.rows[0].id;
    }

    const numeros: string[] = [];
    for (const participante of participanteIds) {
      const participantId = typeof participante === 'string' ? participante : participante.id;
      // Participantes @lid usam Meta ID — usar o campo number que contém o telefone real
      const phoneFromNumber = typeof participante === 'object' && participante.number ? participante.number.replace(/\D/g, '') : null;
      const numero = phoneFromNumber || String(participantId || '').replace(/@.*$/, '');
      // Rejeitar se não parecer telefone válido (IDs do Meta com 15+ dígitos sem number)
      if (!phoneFromNumber && numero.replace(/\D/g, '').length > 15) continue;
      if (numero) numeros.push(numero);
    }

    const usuarioResult = await query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [usuarioId]);
    const nomes = await this.nomesConhecidos(numeros, empresaId, usuarioResult.rows[0]?.whatsapp_porta);

    for (const numero of numeros) {
      // Duplicata é por funil: o mesmo número pode estar em outro funil da empresa.
      const duplicata = await leadsService.telefoneExiste(numero, empresaId, undefined, funilId);
      if (duplicata.existe) {
        jaExistem++;
        continue;
      }

      const nome = nomes.get(chaveTelefone(numero) || '');

      // Card do mesmo nome no mesmo funil, criado à mão SEM telefone: é a mesma pessoa, e
      // a checagem por telefone não o enxerga. Completa o número dele em vez de duplicar.
      if (nome) {
        const semTelefone = await query(
          `SELECT id FROM leads
            WHERE empresa_id = $1 AND funil_id = $2 AND arquivado = false
              AND REGEXP_REPLACE(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ''
              AND LOWER(TRIM(nome)) = LOWER(TRIM($3::text))`,
          [empresaId, funilId, nome]
        );
        if (semTelefone.rows.length === 1) {
          const leadId = semTelefone.rows[0].id;
          await query(`UPDATE leads SET telefone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [numero, leadId]);
          await this.resolverContatoParaLead(leadId, usuarioId, empresaId);
          jaExistem++;
          continue;
        }
      }
      if (nome) comNome++;

      const leadResult = await query(
        `INSERT INTO leads (
           usuario_id, empresa_id, funil_id, estagio_id,
           nome, telefone, origem, temperatura, responsavel_id
         ) VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp', 'frio', $7)
         RETURNING id`,
        [usuarioId, empresaId, funilId, estagioId, nome || numero, numero, responsavelId || null]
      );

      // Reaproveita o contato do usuário com o número em qualquer grafia (com/sem DDI
      // e 9º dígito) antes de criar outro — e vincula o lead, senão o card nasce sem conversa.
      await this.resolverContatoParaLead(leadResult.rows[0].id, usuarioId, empresaId);

      criados++;
    }

    return { criados, jaExistem, comNome };
  }
};
