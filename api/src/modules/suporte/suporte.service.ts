import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { pool, query } from '../../config/database';
import { enviarEmail, remetenteDuoFuturo } from '../../services/email.service';

/**
 * Suporte por ticket, com atendimento HUMANO na primeira linha.
 *
 * REGRA DE OURO: abrir chamado e avisar a equipe NÃO dependem da IA.
 *
 *   cliente abre → ticket gravado (transação) → entra na fila humana
 *   → equipe avisada → só então, e só se ligado de propósito, a IA entra
 *
 * Até 25/08/2026 era o contrário: `criar` chamava `responderComIA`, e o aviso à
 * equipe era efeito colateral de a IA decidir escalar (`[ESCALAR]`). Como a IA
 * nunca rodou em produção (sem `SUPORTE_IA_API_KEY` e sem credencial da empresa
 * interna), TODO chamado caía em `aguardando_suporte` **em silêncio**: o cliente
 * recebia "o Duo já está olhando" e ninguém da equipe ficava sabendo.
 *
 * Por isso a notificação mudou de dono. Quem avisa a equipe é quem coloca o
 * ticket na fila — `criar`, `responderComoCliente` e `marcarParaEquipe` —,
 * nunca a IA. Falha de IA (sem chave, sem saldo, timeout, resposta vazia,
 * exceção) não muda nada disso: o ticket já está na fila e a equipe já sabe.
 *
 * A chave de IA usada aqui é a da **DuoFuturo**, nunca a do cliente: quem paga
 * pelo atendimento somos nós. Ela sai de `SUPORTE_IA_API_KEY` ou, faltando isso,
 * das credenciais da empresa interna (`SUPORTE_IA_EMPRESA_ID`, a 32).
 */

export type StatusTicket = 'aberto' | 'aguardando_cliente' | 'aguardando_suporte' | 'resolvido' | 'fechado';
export type AutorMensagem = 'cliente' | 'agente_ia' | 'suporte';
export type TipoMensagem = 'mensagem' | 'nota_interna' | 'evento';

export interface Ticket {
  id: number;
  empresa_id: number;
  usuario_id: number;
  assunto: string;
  categoria: string;
  prioridade: string;
  status: StatusTicket;
  canal: string;
  email_contato: string | null;
  created_at: string;
  updated_at: string;
  resolvido_at: string | null;
  primeira_resposta_at: string | null;
  usuario_nome?: string;
  empresa_nome?: string;
  total_mensagens?: number;
}

export interface TicketMensagem {
  id: number;
  ticket_id: number;
  autor: AutorMensagem;
  usuario_id: number | null;
  conteudo: string;
  automatica: boolean;
  tipo: TipoMensagem;
  visivel_cliente: boolean;
  created_at: string;
  autor_nome?: string;
  anexos?: TicketAnexo[];
}

export interface TicketAnexo {
  id: number;
  ticket_id: number;
  mensagem_id: number | null;
  nome_original: string;
  mimetype: string;
  tamanho_bytes: number;
  created_at: string;
}

const CATEGORIAS = ['duvida', 'problema', 'sugestao', 'cobranca'];
const PRIORIDADES = ['baixa', 'normal', 'alta'];
const EMAIL_SUPORTE = process.env.EMAIL_SUPORTE || 'suporte@duofuturo.tech';

// ── Anexos ──────────────────────────────────────────────────────────────────
// Fora de /uploads/whatsapp de propósito: são coisas diferentes, com donos e
// regras de acesso diferentes, e misturá-las tornaria a autorização ambígua.
const ANEXOS_DIR = '/var/www/apps/gestao_financeira/uploads/suporte';
const ANEXO_TAMANHO_MAX = 10 * 1024 * 1024; // 10 MB — print de tela não passa disso
const ANEXO_EXTENSOES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']);
const ANEXO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'application/pdf': '.pdf',
};

/**
 * Tipo REAL pelos primeiros bytes (magic number). Devolve null para qualquer coisa
 * que não seja imagem aceita ou PDF — inclusive script, ELF e ZIP disfarçados.
 */
function tipoPelaAssinatura(b: Buffer): string | null {
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (b.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  // WEBP: "RIFF" .... "WEBP"
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF'
      && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** Frase que a IA usa quando decide que o caso é de gente. */
const MARCA_ESCALAR = '[ESCALAR]';

/**
 * A IA só fala com o cliente se alguém ligar isso de propósito — padrão:
 * DESLIGADA. Sem esta trava, configurar `SUPORTE_IA_API_KEY` amanhã (que é
 * necessário para a IA copiloto da equipe) religaria sozinho o atendimento
 * automático ao cliente, que é justamente o que não queremos hoje.
 */
const RESPOSTA_AUTOMATICA_IA = process.env.SUPORTE_IA_RESPOSTA_AUTOMATICA === 'true';

/** Status em que o chamado está na fila da equipe. */
const FILA_HUMANA = 'aguardando_suporte';

/** Como o status aparece no texto do evento — o valor cru não é para ser lido. */
const ROTULO_STATUS_EVENTO: Record<string, string> = {
  aberto: 'aberto',
  aguardando_cliente: 'aguardando o cliente',
  aguardando_suporte: 'na fila da equipe',
  resolvido: 'resolvido',
  fechado: 'fechado',
};

/**
 * Transição de status disparada por uma MENSAGEM nova, com `resolvido_at` derivado
 * do status. Exportado para o teste usar a regra real em vez de reescrevê-la.
 *
 * Até 25/08/2026 só `alterarStatus` tocava `resolvido_at`. O efeito: chamado
 * resolvido que o cliente reabria voltava para `aguardando_suporte` CARREGANDO a
 * data de resolução antiga — e qualquer métrica de tempo-até-resolução contaria o
 * reaberto como resolvido. Aqui a coluna é consequência do status, nunca sobra.
 *
 * `COALESCE` preserva a data quando o chamado JÁ estava resolvido, para uma
 * mensagem nova não reescrever o instante da resolução original.
 *
 * $1 = ticket_id, $2 = novo status.
 */
export const SQL_STATUS_POR_MENSAGEM = `
  UPDATE tickets
     SET status = $2::varchar,
         resolvido_at = CASE WHEN $2::varchar IN ('resolvido','fechado')
                             THEN COALESCE(resolvido_at, now()) ELSE NULL END,
         updated_at = now()
   WHERE id = $1 AND status NOT IN ('fechado')`;

// ─────────────────────────────────────────────────────────────────────────────

async function credenciaisIA(): Promise<{ apiKey: string; modelo: string } | null> {
  const doEnv = process.env.SUPORTE_IA_API_KEY;
  if (doEnv) {
    return { apiKey: doEnv, modelo: process.env.SUPORTE_IA_MODELO || 'claude-sonnet-4-6' };
  }

  const empresaInterna = Number(process.env.SUPORTE_IA_EMPRESA_ID || 32);
  const res = await query(
    'SELECT api_key, modelo FROM empresa_ia_credenciais WHERE empresa_id = $1 LIMIT 1',
    [empresaInterna]
  );
  const row = res.rows[0];
  if (!row?.api_key) return null;
  return { apiKey: row.api_key, modelo: row.modelo || 'claude-sonnet-4-6' };
}

function promptSuporte(ticket: Ticket, empresaNome: string, usuarioNome: string): string {
  return `Você é o Duo, o assistente de suporte da DuoFuturo — mascote peça de quebra-cabeça, tratado no masculino.
Está atendendo ${usuarioNome}, da empresa ${empresaNome}, num chamado de suporte do Gestão Financeira CRM.

Assunto do chamado: "${ticket.assunto}" (categoria: ${ticket.categoria}).

O QUE VOCÊ CONHECE DO PRODUTO
- CRM com funil Kanban, leads, estágios, automações e cadências de follow-up.
- WhatsApp conectado por QR Code, uma instância por usuário; disparos em massa
  com intervalo anti-ban; histórico de conversa dentro do card do lead.
- Agente de IA que responde leads no WhatsApp, configurável por estágio e por lead.
- Financeiro: receitas, despesas, parcelas, clientes, dashboard.
- E-mail: SMTP por empresa, disparos e assinatura por usuário (em /gestao/perfil).
- Planos Starter, Profissional e Enterprise, com fidelidade mensal, trimestral,
  semestral ou anual. Usuário adicional custa R$ 100/mês.

COMO RESPONDER
- Em português do Brasil, direto, no máximo uns 3 parágrafos curtos.
- Passo a passo numerado quando for "como faço X".
- Se faltar informação para responder, PERGUNTE o que falta em vez de chutar.
- Nunca invente prazo, valor, política de reembolso ou combinado comercial.

QUANDO PASSAR PARA A EQUIPE
Responda começando a mensagem exatamente com ${MARCA_ESCALAR} quando o caso
envolver: dinheiro (cobrança, reembolso, cancelamento, fatura), suspeita de bug
ou perda de dados, pedido explícito de falar com uma pessoa, ou qualquer coisa
que você não saiba responder com segurança. Depois da marca, escreva ao cliente
o que você entendeu e diga que a equipe assume daqui. A marca é removida antes
de o cliente ver — ela não faz parte do texto.`;
}

/** Conversa até aqui, no formato que o SDK espera. */
async function historicoParaIA(ticketId: number): Promise<Anthropic.MessageParam[]> {
  const res = await query(
    `SELECT autor, conteudo FROM ticket_mensagens WHERE ticket_id = $1 ORDER BY created_at ASC, id ASC`,
    [ticketId]
  );

  const mensagens: Anthropic.MessageParam[] = [];
  for (const m of res.rows) {
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    // A API recusa dois turnos seguidos do mesmo papel; juntar é mais fiel do
    // que descartar, e sem isso um cliente que escreve duas vezes trava a resposta.
    const ultima = mensagens[mensagens.length - 1];
    if (ultima && ultima.role === role) {
      ultima.content = `${ultima.content}\n\n${m.conteudo}`;
    } else {
      mensagens.push({ role, content: m.conteudo });
    }
  }

  // Prefill: terminar em assistant faz a API completar a própria fala em vez de
  // responder. Foi exatamente o que quebrou o follow-up com IA em 07/2026.
  if (mensagens.length && mensagens[mensagens.length - 1].role === 'assistant') {
    mensagens.push({ role: 'user', content: '(o cliente aguarda uma resposta)' });
  }
  return mensagens;
}

/**
 * Erro que o CLIENTE pode ler: "descreva o assunto", "chamado fechado". Tudo
 * que não é desta classe é problema nosso e vira mensagem genérica lá fora —
 * mensagem de erro do Postgres ou stack trace não são assunto de cliente.
 */
export class ErroValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroValidacao';
  }
}

/**
 * O texto do cliente entra em e-mail HTML. Sem escapar, um chamado com `<` vira
 * marcação e a mensagem chega picotada para a equipe — e a caixa de suporte
 * abriria conteúdo de terceiro sem tratamento.
 */
function escaparHtml(texto: string): string {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────

export const suporteService = {
  /**
   * Resposta automática da IA ao cliente. **Desligada por padrão** — só roda com
   * `SUPORTE_IA_RESPOSTA_AUTOMATICA=true`.
   *
   * Nunca lança e nunca é caminho crítico: quando ela falha (sem chave, sem
   * saldo, timeout, resposta vazia), o ticket continua na fila humana, onde já
   * estava desde o INSERT, e a equipe já foi avisada por `criar`. O
   * `marcarParaEquipe` daqui é rede de segurança para o caso de a IA ter movido
   * o ticket para `aguardando_cliente` antes de quebrar.
   */
  async responderComIA(ticketId: number): Promise<void> {
    if (!RESPOSTA_AUTOMATICA_IA) return;
    try {
      const ticket = await this.getById(ticketId);
      if (!ticket) return;

      const creds = await credenciaisIA();
      if (!creds) {
        console.warn('[suporte] sem chave de IA — ticket', ticketId, 'segue com a equipe');
        await this.marcarParaEquipe(ticketId, 'a IA não pôde responder (sem chave)');
        return;
      }

      const ctx = await query(
        `SELECT u.nome AS usuario_nome, e.nome AS empresa_nome
           FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
          WHERE u.id = $1`,
        [ticket.usuario_id]
      );

      const anthropic = new Anthropic({ apiKey: creds.apiKey });
      const resposta = await anthropic.messages.create({
        model: creds.modelo,
        max_tokens: 1024,
        system: promptSuporte(ticket, ctx.rows[0]?.empresa_nome || 'sua empresa', ctx.rows[0]?.usuario_nome || 'você'),
        messages: await historicoParaIA(ticketId),
      });

      const bruto = resposta.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
        .trim();

      if (!bruto) {
        await this.marcarParaEquipe(ticketId, 'a IA devolveu resposta vazia');
        return;
      }

      const escalar = bruto.startsWith(MARCA_ESCALAR);
      const texto = escalar ? bruto.slice(MARCA_ESCALAR.length).trim() : bruto;

      await this.adicionarMensagem(ticketId, {
        autor: 'agente_ia',
        conteudo: texto,
        automatica: true,
        // A IA já respondeu: a bola volta para o cliente, a menos que ela mesma
        // tenha pedido gente.
        novoStatus: escalar ? 'aguardando_suporte' : 'aguardando_cliente',
      });

      if (escalar) {
        await this.avisarEquipe(ticketId, texto);
      }
    } catch (err: any) {
      console.error('[suporte] IA falhou no ticket', ticketId, '—', err?.message || err);
      await this.marcarParaEquipe(ticketId, `a IA falhou (${err?.message || 'erro desconhecido'})`).catch(() => {});
    }
  },

  /**
   * Devolve o chamado à fila da equipe e **garante o aviso**.
   *
   * O aviso sai só quando a transição acontece de verdade (`RETURNING id` com o
   * status atual no WHERE). É o que impede e-mail repetido: o ticket nasce em
   * `aguardando_suporte` e já foi anunciado por `criar`, então uma falha de IA
   * logo depois não avisa duas vezes. E a garantia é do banco, não da memória do
   * processo — o que importa com as 3 instâncias do cluster PM2 rodando juntas.
   */
  async marcarParaEquipe(ticketId: number, motivo: string): Promise<void> {
    const res = await query(
      // `resolvido_at = NULL`: devolver à fila é reabrir. Ver `adicionarMensagem`.
      `UPDATE tickets SET status = $2::varchar, resolvido_at = NULL, updated_at = now()
        WHERE id = $1 AND status NOT IN ('resolvido', 'fechado', $2::varchar)
        RETURNING id`,
      [ticketId, FILA_HUMANA]
    );
    if (res.rowCount) await this.avisarEquipe(ticketId, motivo);
  },

  async criar(params: {
    empresaId: number;
    usuarioId: number;
    assunto: string;
    categoria?: string;
    prioridade?: string;
    mensagem: string;
    emailContato?: string;
  }): Promise<Ticket> {
    const assunto = String(params.assunto || '').trim();
    const mensagem = String(params.mensagem || '').trim();
    if (assunto.length < 3) throw new ErroValidacao('Descreva o assunto do chamado');
    if (mensagem.length < 10) throw new ErroValidacao('Conte um pouco mais sobre o que está acontecendo');

    const categoria = CATEGORIAS.includes(params.categoria || '') ? params.categoria : 'duvida';

    // PRIORIDADE NÃO VEM DO CLIENTE. Todo chamado nasce 'normal'; quem reclassifica é
    // a equipe. Deixar o cliente escolher faz todo mundo marcar "alta" e a fila perde
    // o sinal. O campo continua no payload de propósito — ignorá-lo aqui é o que
    // impede que um POST direto na API contorne a regra da tela.
    // A regra automática que já existia segue valendo: `avisarEquipe` marca
    // [PRIORIDADE] no assunto quando a categoria é 'cobranca'.
    const prioridade = 'normal';

    // Ticket e primeira mensagem numa transação só: um chamado sem a mensagem
    // que o cliente escreveu é pior que nenhum chamado — a equipe abriria um
    // card vazio, sem ter o que responder. Antes eram dois INSERTs soltos.
    const cliente = await pool.connect();
    let ticket: Ticket;
    try {
      await cliente.query('BEGIN');
      const res = await cliente.query(
        `INSERT INTO tickets (empresa_id, usuario_id, assunto, categoria, prioridade, status, email_contato)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [params.empresaId, params.usuarioId, assunto.slice(0, 200), categoria, prioridade, FILA_HUMANA, params.emailContato || null]
      );
      ticket = res.rows[0];
      await cliente.query(
        `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo)
         VALUES ($1, 'cliente', $2, $3)`,
        [ticket.id, params.usuarioId, mensagem]
      );
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      cliente.release();
    }

    // Daqui para baixo o chamado JÁ EXISTE e JÁ ESTÁ na fila da equipe (o INSERT
    // nasce em `aguardando_suporte`). Nada abaixo pode derrubá-lo, por isso tudo
    // sai fora da requisição — quem abriu vê a tela responder na hora.
    //
    // A ordem importa e é a da premissa: avisar a equipe primeiro, IA só depois
    // (e só se ligada). Por isso o `.finally`, e não dois `void` soltos.
    void this.avisarEquipe(ticket.id, 'chamado novo', mensagem)
      .finally(() => { void this.responderComIA(ticket.id); });
    void this.enviarEmailAbertura(ticket.id);

    return ticket;
  },

  async listar(params: {
    empresaId: number;
    usuarioId: number;
    /** super_admin vê os chamados de todas as empresas. */
    todos?: boolean;
    status?: string;
  }): Promise<Ticket[]> {
    const cond: string[] = [];
    const vals: any[] = [];

    // Dois escopos, e só dois:
    //   Central (atendente)  → todos os chamados, de todas as empresas;
    //   Meus chamados        → só os que o próprio usuário abriu.
    //
    // O filtro era por `empresa_id`, e `usuarioId` chegava aqui sem ser usado: na
    // prática todo usuário da empresa lia o chamado dos colegas (na Panteras, a
    // Débora veria os da Jéssica) — inclusive assunto de cobrança e acesso. O
    // recorte por empresa continua no `getById` como defesa em profundidade.
    if (!params.todos) {
      vals.push(params.usuarioId);
      cond.push(`t.usuario_id = $${vals.length}`);
      vals.push(params.empresaId);
      cond.push(`t.empresa_id = $${vals.length}`);
    }
    if (params.status && params.status !== 'todos') {
      vals.push(params.status);
      cond.push(`t.status = $${vals.length}`);
    }

    const res = await query(
      `SELECT t.*, u.nome AS usuario_nome, e.nome AS empresa_nome,
              (SELECT COUNT(*)::int FROM ticket_mensagens m WHERE m.ticket_id = t.id) AS total_mensagens
         FROM tickets t
         JOIN usuarios u ON u.id = t.usuario_id
         JOIN empresas e ON e.id = t.empresa_id
        ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
        ORDER BY
          -- O que espera resposta nossa sobe; resolvido e fechado descem.
          CASE t.status WHEN 'aguardando_suporte' THEN 0 WHEN 'aberto' THEN 1
                        WHEN 'aguardando_cliente' THEN 2 ELSE 3 END,
          t.updated_at DESC
        LIMIT 200`,
      vals
    );
    return res.rows;
  },

  /**
   * `empresaId`/`usuarioId` ausentes = visão de atendente (Central), que lê
   * qualquer chamado. Informados, valem juntos: a empresa é o recorte externo e o
   * usuário é o dono do chamado. Sem o filtro por usuário, bastava trocar o id na
   * URL para ler o chamado de um colega da mesma empresa.
   */
  async getById(id: number, empresaId?: number, usuarioId?: number): Promise<Ticket | null> {
    const cond: string[] = ['t.id = $1'];
    const vals: any[] = [id];
    if (empresaId) { vals.push(empresaId); cond.push(`t.empresa_id = $${vals.length}`); }
    if (usuarioId) { vals.push(usuarioId); cond.push(`t.usuario_id = $${vals.length}`); }
    const res = await query(
      `SELECT t.*, u.nome AS usuario_nome, e.nome AS empresa_nome
         FROM tickets t
         JOIN usuarios u ON u.id = t.usuario_id
         JOIN empresas e ON e.id = t.empresa_id
        WHERE ${cond.join(' AND ')}`,
      vals
    );
    return res.rows[0] || null;
  },

  /**
   * `empresaId` é defesa em profundidade: o controller já checou o dono do
   * ticket antes de chegar aqui, mas o recorte por empresa vive no SQL para não
   * depender de ninguém lembrar da checagem na próxima rota que for escrita.
   * Sem `empresaId` (só o atendente), lê qualquer chamado.
   */
  async getMensagens(ticketId: number, empresaId?: number): Promise<TicketMensagem[]> {
    // `empresaId` presente = é o CLIENTE lendo: some com o que não é para ele.
    // O filtro de visibilidade vive aqui, no SQL, e não na tela — nota interna que
    // chega ao navegador já vazou, mesmo que a interface não a desenhe.
    const doCliente = empresaId != null;
    const res = await query(
      `SELECT m.*, u.nome AS autor_nome
         FROM ticket_mensagens m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.ticket_id = $1
          ${doCliente ? 'AND m.visivel_cliente = true' : ''}
          ${doCliente ? 'AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = m.ticket_id AND t.empresa_id = $2)' : ''}
        ORDER BY m.created_at ASC, m.id ASC`,
      doCliente ? [ticketId, empresaId] : [ticketId]
    );
    const mensagens: TicketMensagem[] = res.rows;
    if (mensagens.length === 0) return mensagens;

    // Anexos numa consulta só, distribuídos em memória: uma query por mensagem
    // faria N+1 num histórico que cresce sem teto.
    //
    // Inclui os ÓRFÃOS (`mensagem_id IS NULL`) de propósito. Na abertura do chamado
    // o anexo é enviado DEPOIS de o ticket existir — a primeira mensagem já foi
    // gravada dentro da transação de `criar`, então não há como amarrá-lo a ela no
    // momento do upload. Órfão é, por definição, anexo da abertura: ele é exibido
    // na primeira mensagem do histórico.
    const anexos = await query(
      `SELECT id, ticket_id, mensagem_id, nome_original, mimetype, tamanho_bytes, created_at
         FROM ticket_anexos
        WHERE ticket_id = $1 AND (mensagem_id IS NULL OR mensagem_id = ANY($2::int[]))
        ORDER BY id ASC`,
      [ticketId, mensagens.map((m) => m.id)]
    );
    const porMensagem = new Map<number, TicketAnexo[]>();
    const primeiraId = mensagens[0].id;
    for (const a of anexos.rows) {
      const alvo = a.mensagem_id ?? primeiraId;
      const lista = porMensagem.get(alvo) || [];
      lista.push(a);
      porMensagem.set(alvo, lista);
    }
    for (const m of mensagens) m.anexos = porMensagem.get(m.id) || [];
    return mensagens;
  },

  /**
   * Evento do sistema no MESMO histórico: "resolvido por X", "prioridade → alta".
   *
   * Entra como linha de `tipo = 'evento'` em vez de tabela de auditoria separada,
   * porque o valor está em ler a ordem dos fatos junto com a conversa. `autor` é
   * quem provocou o evento — sem usuário (job, automação) fica 'suporte'.
   */
  async registrarEvento(
    ticketId: number, texto: string,
    opcoes: { usuarioId?: number; visivelCliente?: boolean } = {}
  ): Promise<void> {
    try {
      await this.adicionarMensagem(ticketId, {
        autor: 'suporte',
        usuarioId: opcoes.usuarioId,
        conteudo: texto,
        automatica: true,
        tipo: 'evento',
        // Padrão: evento é interno. Quem quer contar ao cliente pede explicitamente.
        visivelCliente: opcoes.visivelCliente ?? false,
      });
    } catch (err: any) {
      // Evento é registro, não operação: falhar aqui não pode derrubar a ação que
      // o gerou (mudar status, subir anexo). Fica no log e a vida segue.
      console.warn(`[suporte] evento não registrado no ticket ${ticketId} —`, err?.message || err);
    }
  },

  /** Nota interna da equipe. Nunca vai ao cliente e nunca muda o status. */
  async notaInterna(ticketId: number, usuarioId: number, conteudo: string): Promise<TicketMensagem> {
    return this.adicionarMensagem(ticketId, {
      autor: 'suporte', usuarioId, conteudo, tipo: 'nota_interna', visivelCliente: false,
    });
  },

  /**
   * Prioridade é da EQUIPE (o cliente não escolhe — ver `criar`). A mudança fica
   * registrada como evento interno, senão "por que este chamado é alta?" não tem
   * resposta depois.
   */
  async alterarPrioridade(ticketId: number, prioridade: string, usuarioId: number): Promise<Ticket | null> {
    if (!PRIORIDADES.includes(prioridade)) {
      throw new ErroValidacao('Prioridade inválida');
    }
    const atual = await this.getById(ticketId);
    if (!atual) throw new ErroValidacao('Chamado não encontrado');
    if (atual.prioridade === prioridade) return atual;

    const res = await query(
      `UPDATE tickets SET prioridade = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [ticketId, prioridade]
    );
    await this.registrarEvento(ticketId, `Prioridade alterada de ${atual.prioridade} para ${prioridade}.`, { usuarioId });
    return res.rows[0] || null;
  },

  async adicionarMensagem(
    ticketId: number,
    params: {
      autor: AutorMensagem;
      usuarioId?: number;
      conteudo: string;
      automatica?: boolean;
      novoStatus?: StatusTicket;
      /** 'mensagem' (fala com o cliente) | 'nota_interna' | 'evento'. Default 'mensagem'. */
      tipo?: TipoMensagem;
      /** Sobrescreve a visibilidade. Nota interna é forçada a false, sempre. */
      visivelCliente?: boolean;
      /** Anexos já enviados que passam a pertencer a esta mensagem. */
      anexoIds?: number[];
    }
  ): Promise<TicketMensagem> {
    const conteudo = String(params.conteudo || '').trim();
    if (!conteudo) throw new ErroValidacao('A mensagem não pode ficar vazia');

    const tipo: TipoMensagem = params.tipo || 'mensagem';
    // Nota interna nunca é visível ao cliente — o banco também recusa (constraint
    // `ticket_mensagens_nota_privada`), mas errar aqui devolveria um 500 em vez de
    // um comportamento correto.
    const visivel = tipo === 'nota_interna' ? false : (params.visivelCliente ?? true);

    const res = await query(
      `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo, automatica, tipo, visivel_cliente)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ticketId, params.autor, params.usuarioId || null, conteudo, !!params.automatica, tipo, visivel]
    );

    // Anexos: amarra os órfãos a esta mensagem. O `ticket_id` no WHERE impede que
    // um id de anexo de OUTRO chamado seja pendurado aqui — o id vem do cliente.
    if (params.anexoIds?.length) {
      await query(
        `UPDATE ticket_anexos SET mensagem_id = $1
          WHERE id = ANY($2::int[]) AND ticket_id = $3 AND mensagem_id IS NULL`,
        [res.rows[0].id, params.anexoIds, ticketId]
      );
    }

    // Primeira resposta da EQUIPE, carimbada uma única vez (base da métrica de
    // tempo de primeira resposta). `IS NULL` no WHERE é o que garante "uma vez".
    if (params.autor === 'suporte' && tipo === 'mensagem') {
      await query(
        `UPDATE tickets SET primeira_resposta_at = now()
          WHERE id = $1 AND primeira_resposta_at IS NULL`,
        [ticketId]
      );
    }

    if (params.novoStatus) {
      // `resolvido_at` acompanha o status, sempre. Antes só `alterarStatus` tocava
      // essa coluna, então um chamado resolvido que o cliente reabria voltava para
      // `aguardando_suporte` CARREGANDO a data de resolução antiga — e qualquer
      // tempo-até-resolução contaria o reaberto como resolvido. Aqui a coluna é
      // derivada do status novo: só `resolvido`/`fechado` têm data, e ela é
      // preservada (`COALESCE`) para não mudar quando o status não muda de classe.
      await query(SQL_STATUS_POR_MENSAGEM, [ticketId, params.novoStatus]);
    } else {
      await query('UPDATE tickets SET updated_at = now() WHERE id = $1', [ticketId]);
    }

    return res.rows[0];
  },

  /**
   * Resposta do cliente. Reabre o que estava resolvido, devolve o caso à fila da
   * equipe e avisa — sempre. Resposta de cliente é evento, não estado: mesmo num
   * chamado que já estava com a equipe, ninguém fica sabendo que chegou texto
   * novo se não sair aviso. Por isso aqui é `avisarEquipe` direto, e não
   * `marcarParaEquipe` (que só avisa quando o status muda).
   */
  async responderComoCliente(ticketId: number, usuarioId: number, conteudo: string, anexoIds?: number[]): Promise<TicketMensagem> {
    const ticket = await this.getById(ticketId);
    if (!ticket) throw new ErroValidacao('Chamado não encontrado');
    if (ticket.status === 'fechado') throw new ErroValidacao('Este chamado está fechado. Abra um novo.');

    // Com a resposta automática ligada, a IA continua tendo a primeira palavra
    // nos chamados que ainda não são de gente — e ela mesma decide o destino.
    const comEquipe = ticket.status === FILA_HUMANA;
    if (RESPOSTA_AUTOMATICA_IA && !comEquipe) {
      const msg = await this.adicionarMensagem(ticketId, { autor: 'cliente', usuarioId, conteudo, novoStatus: 'aberto', anexoIds });
      void this.responderComIA(ticketId);
      return msg;
    }

    const msg = await this.adicionarMensagem(ticketId, {
      autor: 'cliente',
      usuarioId,
      conteudo,
      novoStatus: FILA_HUMANA,
      anexoIds,
    });
    void this.avisarEquipe(ticketId, 'o cliente respondeu', conteudo);
    return msg;
  },

  /** Resposta da equipe. Tira o ticket da fila e devolve a bola ao cliente. */
  async responderComoSuporte(ticketId: number, usuarioId: number, conteudo: string, anexoIds?: number[]): Promise<TicketMensagem> {
    const msg = await this.adicionarMensagem(ticketId, {
      autor: 'suporte',
      usuarioId,
      conteudo,
      novoStatus: 'aguardando_cliente',
      anexoIds,
    });
    void this.enviarEmailResposta(ticketId, conteudo, 'a equipe de suporte');
    return msg;
  },

  /**
   * `$2::varchar` não é enfeite. Sem o cast, o mesmo parâmetro serve a
   * `status = $2` (varchar, pelo tipo da coluna) e a `$2 IN ('resolvido',…)`
   * (text, pelos literais), e o Postgres recusa a query inteira com
   * `42P08 inconsistent types deduced for parameter $2`.
   *
   * Estava assim desde a 068: TODA chamada de "Marcar como resolvido" e de
   * "Reabrir" devolvia 400. Ninguém percebeu porque não havia chamado nenhum
   * no banco para clicar — apareceu na bateria de testes da fase 0.
   */
  async alterarStatus(ticketId: number, status: StatusTicket, empresaId?: number, usuarioId?: number): Promise<Ticket | null> {
    const res = await query(
      `UPDATE tickets
          SET status = $2::varchar,
              resolvido_at = CASE WHEN $2::varchar IN ('resolvido','fechado') THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1
          ${empresaId ? 'AND empresa_id = $3' : ''}
        RETURNING *`,
      empresaId ? [ticketId, status, empresaId] : [ticketId, status]
    );
    const atualizado = res.rows[0] || null;
    // Registra no histórico apenas quando a transição aconteceu de fato. Chamado
    // resolvido é a única transição que o cliente precisa ver acontecer.
    if (atualizado) {
      await this.registrarEvento(ticketId, `Chamado marcado como ${ROTULO_STATUS_EVENTO[status] || status}.`, {
        usuarioId,
        visivelCliente: status === 'resolvido' || status === 'fechado',
      });
    }
    return atualizado;
  },

  // ── e-mails ───────────────────────────────────────────────────────────────
  // Todos saem pelo remetente institucional e nenhum derruba a operação: um
  // chamado registrado sem e-mail de aviso ainda é um chamado; um erro de SMTP
  // que impedisse a abertura, não.

  /**
   * Envia com retentativa e devolve quantas tentativas foram gastas. Ao esgotar,
   * lança um erro que carrega `tentativas` e o texto de CADA falha do provedor —
   * é isso que o log de alerta precisa para ser investigável depois.
   */
  async enviarComRetentativa(
    destino: string, assunto: string, html: string, maxTentativas = 2
  ): Promise<{ tentativas: number }> {
    const falhas: string[] = [];
    for (let n = 1; n <= maxTentativas; n++) {
      try {
        await enviarEmail(destino, assunto, html, remetenteDuoFuturo('Suporte DuoFuturo'));
        return { tentativas: n };
      } catch (err: any) {
        falhas.push(`tentativa ${n}: ${err?.message || err}`);
        console.warn(`[suporte] envio para ${destino} falhou na tentativa ${n}/${maxTentativas} — ${err?.message || err}`);
        if (n < maxTentativas) await new Promise(r => setTimeout(r, 3000));
      }
    }
    const erro: any = new Error(falhas.join(' | '));
    erro.tentativas = maxTentativas;
    throw erro;
  },

  async enviarEmailAbertura(ticketId: number): Promise<void> {
    try {
      const ticket = await this.getById(ticketId);
      if (!ticket) return;
      const destino = ticket.email_contato || (await this.emailDoUsuario(ticket.usuario_id));
      if (!destino) return;

      // Não prometa IA. Até 25/08/2026 este e-mail dizia que "o Duo já está
      // olhando e responde em instantes" — e o Duo nunca olhou, porque nunca
      // houve chave. Prometer atendimento que não existe é pior que não avisar.
      await this.enviarComRetentativa(
        destino,
        `[#${ticket.id}] ${ticket.assunto}`,
        `<p>Olá!</p>
         <p>Recebemos seu chamado <strong>#${ticket.id} — ${ticket.assunto}</strong>.</p>
         <p>Ele já está na fila da nossa equipe de suporte. Assim que houver resposta,
            ela aparece dentro do sistema e você recebe um aviso por aqui.</p>
         <p>Acompanhe em <a href="https://duofuturo.tech/gestao/suporte">duofuturo.tech/gestao/suporte</a>.</p>
         <p>— Suporte DuoFuturo · ${EMAIL_SUPORTE}</p>`
      );
    } catch (err: any) {
      // Não é ALERTA: o chamado está gravado e a equipe já sabe. Ainda assim o
      // cliente ficou sem confirmação, e isso precisa ser rastreável.
      console.error(
        `[suporte] e-mail de ABERTURA nao chegou ao cliente | ticket=${ticketId}` +
        ` | tentativas=${err?.tentativas ?? 1} | erro_provedor=${err?.message || err}`
      );
    }
  },

  async enviarEmailResposta(ticketId: number, conteudo: string, quem: string): Promise<void> {
    try {
      const ticket = await this.getById(ticketId);
      if (!ticket) return;
      const destino = ticket.email_contato || (await this.emailDoUsuario(ticket.usuario_id));
      if (!destino) return;

      const trecho = conteudo.length > 600 ? `${conteudo.slice(0, 600)}…` : conteudo;
      await this.enviarComRetentativa(
        destino,
        `[#${ticket.id}] ${ticket.assunto}`,
        `<p>Há uma resposta de ${quem} no seu chamado <strong>#${ticket.id}</strong>:</p>
         <blockquote style="border-left:3px solid #D2B773;margin:12px 0;padding:4px 0 4px 12px;color:#374151">
           ${escaparHtml(trecho).replace(/\n/g, '<br>')}
         </blockquote>
         <p>Responda em <a href="https://duofuturo.tech/gestao/suporte">duofuturo.tech/gestao/suporte</a>.</p>
         <p>— Suporte DuoFuturo · ${EMAIL_SUPORTE}</p>`
      );
    } catch (err: any) {
      console.error(
        `[suporte] e-mail de RESPOSTA nao chegou ao cliente | ticket=${ticketId}` +
        ` | tentativas=${err?.tentativas ?? 1} | erro_provedor=${err?.message || err}`
      );
    }
  },

  /**
   * Avisa a caixa oficial que há chamado esperando gente.
   *
   * O corpo é montado com o que SEMPRE existe — dados do ticket e o texto do
   * cliente —, nunca com um resumo produzido pela IA. Era essa dependência que
   * fazia o aviso sumir junto com ela.
   *
   * Nunca lança: quem chama está fora da requisição do cliente. Mas se falhar
   * mesmo com a retentativa, o log sai com a marca `[suporte][ALERTA]`, que é o
   * que se procura no `pm2 logs` quando um cliente cobra resposta.
   */
  async avisarEquipe(ticketId: number, motivo: string, trecho?: string): Promise<void> {
    try {
      const ticket = await this.getById(ticketId);
      if (!ticket) return;

      const corpo = (trecho ?? (await this.primeiraMensagem(ticketId)) ?? '(sem descrição)').slice(0, 1200);
      const urgente = ticket.prioridade === 'alta' || ticket.categoria === 'cobranca';

      await this.enviarComRetentativa(
        EMAIL_SUPORTE,
        `[#${ticket.id}]${urgente ? ' [PRIORIDADE]' : ''} ${ticket.assunto}`,
        `<p><strong>${escaparHtml(ticket.empresa_nome || '')}</strong> · ${escaparHtml(ticket.usuario_nome || '')}
            · categoria ${escaparHtml(ticket.categoria)} · prioridade ${escaparHtml(ticket.prioridade)}</p>
         <p>Motivo do aviso: <strong>${escaparHtml(motivo)}</strong>.</p>
         <blockquote style="border-left:3px solid #D2B773;margin:12px 0;padding:4px 0 4px 12px;color:#374151">
           ${escaparHtml(corpo).replace(/\n/g, '<br>')}
         </blockquote>
         <p><a href="https://duofuturo.tech/gestao/suporte">Abrir no painel</a></p>`
      );
    } catch (err: any) {
      // A falha do e-mail à equipe é a única deste módulo que deixa um cliente
      // sem atendimento. O log traz TUDO o que se precisa para investigar sem
      // abrir o banco: `grep '\[suporte\]\[ALERTA\]'` nos logs do PM2.
      const t = await this.getById(ticketId).catch(() => null);
      console.error(
        `[suporte][ALERTA] equipe NAO foi avisada` +
        ` | ticket=${ticketId}` +
        ` | empresa=${t?.empresa_id ?? '?'} (${t?.empresa_nome ?? '?'})` +
        ` | usuario=${t?.usuario_id ?? '?'} (${t?.usuario_nome ?? '?'})` +
        ` | destinatario=${EMAIL_SUPORTE}` +
        ` | motivo="${motivo}"` +
        ` | status=${t?.status ?? '?'}` +
        ` | tentativas=${err?.tentativas ?? 1}` +
        ` | erro_provedor=${err?.message || err}`
      );
    }
  },

  /** Primeira coisa que o cliente escreveu — o que a equipe precisa ler. */
  async primeiraMensagem(ticketId: number): Promise<string | null> {
    const res = await query(
      `SELECT conteudo FROM ticket_mensagens
        WHERE ticket_id = $1 AND autor = 'cliente'
        ORDER BY created_at ASC, id ASC LIMIT 1`,
      [ticketId]
    );
    return res.rows[0]?.conteudo || null;
  },

  // ── Anexos (Fase 4) ────────────────────────────────────────────────────────

  /**
   * Validação do arquivo, na ordem em que fica mais barato recusar.
   *
   * MIME e extensão são AFIRMAÇÕES de quem envia — `curl -F "f=@x.sh;type=image/png"`
   * passa nos dois. Por isso a última checagem lê os primeiros bytes: assinatura
   * (magic number) é a única coisa que diz o que o arquivo é de fato. Aceitamos só
   * imagem e PDF, que é o que um print de tela precisa; nada que o sistema
   * operacional possa querer executar.
   */
  async validarArquivoAnexo(
    arquivo: { path: string; originalname: string; mimetype: string; size: number }
  ): Promise<{ ok: boolean; erro?: string; mimetype?: string }> {
    if (arquivo.size > ANEXO_TAMANHO_MAX) {
      return { ok: false, erro: `Arquivo muito grande. O limite é ${Math.floor(ANEXO_TAMANHO_MAX / 1024 / 1024)} MB.` };
    }
    const ext = path.extname(arquivo.originalname || '').toLowerCase();
    if (!ANEXO_EXTENSOES.has(ext)) {
      return { ok: false, erro: 'Formato não aceito. Envie imagem (PNG, JPG, WEBP, GIF) ou PDF.' };
    }
    if (!ANEXO_MIMES.has(arquivo.mimetype)) {
      return { ok: false, erro: 'Formato não aceito. Envie imagem (PNG, JPG, WEBP, GIF) ou PDF.' };
    }

    // Assinatura real do conteúdo.
    let cabecalho: Buffer;
    try {
      const fd = await fs.promises.open(arquivo.path, 'r');
      try {
        const buf = Buffer.alloc(12);
        const { bytesRead } = await fd.read(buf, 0, 12, 0);
        cabecalho = buf.subarray(0, bytesRead);
      } finally {
        await fd.close();
      }
    } catch {
      return { ok: false, erro: 'Não foi possível ler o arquivo enviado.' };
    }

    const real = tipoPelaAssinatura(cabecalho);
    if (!real) {
      return { ok: false, erro: 'O conteúdo do arquivo não é uma imagem nem um PDF.' };
    }
    // O MIME que vale é o DETECTADO, não o declarado: é ele que vai para o banco e
    // volta no Content-Type do download.
    return { ok: true, mimetype: real };
  },

  /**
   * Move o temporário do multer para a pasta da empresa com nome UUID e registra.
   *
   * Nunca reaproveita o nome do cliente no filesystem, e a pasta é por empresa —
   * o que mantém a árvore legível e dá um segundo recorte natural.
   */
  async moverERegistrarAnexo(params: {
    ticketId: number; empresaId: number; usuarioId: number;
    arquivoTemporario: string; nomeOriginal: string; mimetype: string; tamanhoBytes: number;
  }): Promise<TicketAnexo> {
    const pasta = path.join(ANEXOS_DIR, String(params.empresaId));
    await fs.promises.mkdir(pasta, { recursive: true });

    const ext = EXTENSAO_POR_MIME[params.mimetype] || '.bin';
    const nome = `${randomUUID()}${ext}`;
    await fs.promises.copyFile(params.arquivoTemporario, path.join(pasta, nome));

    const relativo = `/uploads/suporte/${params.empresaId}/${nome}`;
    const anexo = await this.registrarAnexo({
      ticketId: params.ticketId,
      empresaId: params.empresaId,
      usuarioId: params.usuarioId,
      caminho: relativo,
      nomeOriginal: params.nomeOriginal || nome,
      mimetype: params.mimetype,
      tamanhoBytes: params.tamanhoBytes,
    });
    await this.registrarEvento(params.ticketId, `Anexo adicionado: ${params.nomeOriginal}.`, { usuarioId: params.usuarioId });
    return anexo;
  },

  /**
   * Caminho absoluto de um anexo, confinado em ANEXOS_DIR.
   *
   * O `caminho` vem do banco (foi o servidor que o gerou), mas a checagem de
   * confinamento fica aqui de qualquer jeito: é barata e transforma um eventual
   * registro adulterado em 404 em vez de leitura de arquivo arbitrário.
   */
  caminhoAbsolutoAnexo(relativo: string): string | null {
    const semPrefixo = relativo.replace(/^\/uploads\/suporte\/?/, '');
    const absoluto = path.resolve(ANEXOS_DIR, semPrefixo);
    if (absoluto !== ANEXOS_DIR && !absoluto.startsWith(ANEXOS_DIR + path.sep)) return null;
    return absoluto;
  },

  /**
   * Registra um anexo já gravado no disco.
   *
   * O nome no filesystem é gerado aqui (UUID), NUNCA derivado do nome que o
   * cliente mandou: nome de arquivo é entrada não confiável — path traversal,
   * extensão dupla (`foto.png.sh`), caractere de controle, nome vazio. O nome
   * original vira só rótulo de exibição e nunca toca o disco.
   */
  async registrarAnexo(params: {
    ticketId: number; empresaId: number; usuarioId: number;
    caminho: string; nomeOriginal: string; mimetype: string; tamanhoBytes: number;
  }): Promise<TicketAnexo> {
    const res = await query(
      `INSERT INTO ticket_anexos
         (ticket_id, empresa_id, usuario_id, caminho, nome_original, mimetype, tamanho_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, ticket_id, mensagem_id, nome_original, mimetype, tamanho_bytes, created_at`,
      [params.ticketId, params.empresaId, params.usuarioId, params.caminho,
       params.nomeOriginal.slice(0, 255), params.mimetype.slice(0, 120), params.tamanhoBytes]
    );
    return res.rows[0];
  },

  /**
   * Anexo para download, com a autorização já resolvida.
   *
   * `empresaId` informado = cliente: só anexo de chamado da empresa dele. Sem ele
   * (atendente) qualquer anexo. A checagem é por JOIN no ticket, não pelo caminho
   * no disco — caminho é dado, não permissão.
   */
  async getAnexoParaDownload(
    anexoId: number, empresaId?: number
  ): Promise<{ caminho: string; nome_original: string; mimetype: string } | null> {
    const res = await query(
      `SELECT a.caminho, a.nome_original, a.mimetype
         FROM ticket_anexos a
         JOIN tickets t ON t.id = a.ticket_id
        WHERE a.id = $1 ${empresaId ? 'AND t.empresa_id = $2' : ''}`,
      empresaId ? [anexoId, empresaId] : [anexoId]
    );
    return res.rows[0] || null;
  },

  // ── IA copiloto do atendente (Fase 6) ──────────────────────────────────────

  /**
   * A IA ASSISTE quem atende — não responde o cliente.
   *
   * Devolve classificação, prioridade sugerida, resumo e um rascunho de resposta
   * para o atendente revisar. Nada daqui é enviado a ninguém: o rascunho volta
   * como texto na tela e só sai se uma pessoa clicar em enviar. É a premissa 4, e
   * é o oposto da `responderComIA`, que fala com o cliente e segue desligada por
   * padrão (`SUPORTE_IA_RESPOSTA_AUTOMATICA`).
   *
   * Nunca lança por falta de IA: sem chave configurada devolve `disponivel: false`
   * com o motivo, e a Central continua funcionando sem o painel. Atendimento não
   * pode depender da IA — mesma regra da fase 0.
   */
  async sugestaoParaAtendente(ticketId: number): Promise<{
    disponivel: boolean;
    motivo?: string;
    classificacao?: string;
    prioridade_sugerida?: string;
    resumo?: string;
    resposta_sugerida?: string;
  }> {
    const ticket = await this.getById(ticketId);
    if (!ticket) throw new ErroValidacao('Chamado não encontrado');

    const creds = await credenciaisIA();
    if (!creds) {
      return { disponivel: false, motivo: 'A chave de IA do suporte (SUPORTE_IA_API_KEY) não está configurada.' };
    }

    // O histórico da IA inclui nota interna de propósito: é contexto do atendente,
    // e o resultado não vai ao cliente sem revisão humana.
    const hist = await query(
      `SELECT autor, tipo, conteudo FROM ticket_mensagens
        WHERE ticket_id = $1 ORDER BY created_at ASC, id ASC LIMIT 40`,
      [ticketId]
    );
    const conversa = hist.rows
      .map((m: any) => `[${m.tipo === 'nota_interna' ? 'nota interna da equipe' : m.autor}] ${m.conteudo}`)
      .join('\n');

    const sistema = `Você ajuda a EQUIPE de suporte da DuoFuturo a atender um chamado do Gestão Financeira CRM.
Você NÃO fala com o cliente: o que você escrever é lido por um atendente humano, que revisa antes de enviar.

Devolva SOMENTE um JSON válido, sem cercas de código, com estas chaves:
{"classificacao":"duvida|problema|sugestao|cobranca","prioridade_sugerida":"baixa|normal|alta","resumo":"...","resposta_sugerida":"..."}

- "resumo": o problema em no máximo 2 frases, para quem nunca leu o chamado.
- "resposta_sugerida": rascunho em português do Brasil, direto, no máximo 3
  parágrafos curtos, passo a passo numerado quando for "como faço X".
- Prioridade alta é para dinheiro (cobrança, reembolso, cancelamento), suspeita de
  perda de dados ou operação parada. Não infle: se for dúvida de uso, é normal.
- Nunca invente prazo, valor, política de reembolso ou combinado comercial. Se
  faltar informação, diga no resumo o que precisa ser perguntado.`;

    try {
      const anthropic = new Anthropic({ apiKey: creds.apiKey, timeout: 45_000, maxRetries: 1 });
      const r = await anthropic.messages.create({
        model: creds.modelo,
        max_tokens: 1024,
        system: sistema,
        messages: [{
          role: 'user',
          content: `Chamado #${ticket.id} — "${ticket.assunto}" (categoria ${ticket.categoria}, prioridade atual ${ticket.prioridade}).\nEmpresa: ${ticket.empresa_nome}. Quem abriu: ${ticket.usuario_nome}.\n\nHistórico:\n${conversa}`,
        }],
      });
      const bruto = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

      // O modelo às vezes embrulha o JSON em cerca de código, apesar da instrução.
      const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const dados = JSON.parse(limpo);
      return {
        disponivel: true,
        classificacao: CATEGORIAS.includes(dados.classificacao) ? dados.classificacao : undefined,
        prioridade_sugerida: PRIORIDADES.includes(dados.prioridade_sugerida) ? dados.prioridade_sugerida : undefined,
        resumo: typeof dados.resumo === 'string' ? dados.resumo : undefined,
        resposta_sugerida: typeof dados.resposta_sugerida === 'string' ? dados.resposta_sugerida : undefined,
      };
    } catch (err: any) {
      // Inclui JSON malformado: o atendente vê "não foi possível" e atende do
      // mesmo jeito. Melhor sem sugestão do que com sugestão inventada.
      console.warn(`[suporte] copiloto falhou no ticket ${ticketId} —`, err?.message || err);
      return { disponivel: false, motivo: 'Não foi possível gerar a sugestão agora. Você pode atender normalmente.' };
    }
  },

  // ── Métricas (Fase 7) ──────────────────────────────────────────────────────

  /**
   * Números da Central. `empresaId` restringe a uma empresa (visão do cliente);
   * sem ele, é o consolidado do atendimento.
   *
   * Tempo de primeira resposta usa `primeira_resposta_at` (carimbado uma vez na
   * primeira fala da equipe) e tempo de resolução usa `resolvido_at` — que desde
   * 25/08 é limpo quando o chamado reabre, então reaberto não conta como resolvido.
   * Sem essa correção estas duas médias seriam otimistas e ninguém perceberia.
   */
  async metricas(empresaId?: number): Promise<any> {
    const cond = empresaId ? 'WHERE empresa_id = $1' : '';
    const vals = empresaId ? [empresaId] : [];
    const res = await query(
      `SELECT
         COUNT(*)::int                                                      AS total,
         COUNT(*) FILTER (WHERE status = 'aguardando_suporte')::int         AS na_fila,
         COUNT(*) FILTER (WHERE status = 'aguardando_cliente')::int         AS com_cliente,
         COUNT(*) FILTER (WHERE status IN ('resolvido','fechado'))::int     AS encerrados,
         COUNT(*) FILTER (WHERE prioridade = 'alta'
                            AND status NOT IN ('resolvido','fechado'))::int AS abertos_alta,
         -- Só quem já foi respondido entra na média; chamado ainda sem resposta
         -- não tem tempo de resposta, e tratá-lo como zero mentiria para baixo.
         ROUND(AVG(EXTRACT(EPOCH FROM (primeira_resposta_at - created_at)) / 60.0)
               FILTER (WHERE primeira_resposta_at IS NOT NULL))::int        AS min_primeira_resposta,
         ROUND(AVG(EXTRACT(EPOCH FROM (resolvido_at - created_at)) / 60.0)
               FILTER (WHERE resolvido_at IS NOT NULL))::int                AS min_resolucao,
         COUNT(*) FILTER (WHERE primeira_resposta_at IS NULL
                            AND status NOT IN ('resolvido','fechado'))::int AS sem_resposta
       FROM tickets ${cond}`,
      vals
    );
    const porCategoria = await query(
      `SELECT categoria, COUNT(*)::int AS total FROM tickets ${cond} GROUP BY categoria ORDER BY total DESC`,
      vals
    );
    return { ...res.rows[0], por_categoria: porCategoria.rows };
  },

  async emailDoUsuario(usuarioId: number): Promise<string | null> {
    const res = await query('SELECT email FROM usuarios WHERE id = $1', [usuarioId]);
    return res.rows[0]?.email || null;
  },
};
