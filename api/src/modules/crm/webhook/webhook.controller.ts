import { Request, Response, NextFunction } from 'express';
import { query } from '../../../config/database';
import { adicionarJobAgente } from '../../agente-ia/agente-ia.queue';
import { automacoesGrupoService as automacoesService } from '../../automacoes/automacoes-grupo.service';
import { leadsService } from '../leads/leads.service';
import { variantesTelefone, telefonePlausivel, podeSerContatoNovo } from '../_shared/telefone';
import { normalizarUtmSource } from '../_shared/utm';
import { campanhaDoEvento, donoPedidoNaUrl } from '../_shared/sendflow';
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

// Webhook de compra da Hotmart (evento PURCHASE_APPROVED) → cria lead no CRM.
// Autenticado pelo hottok no header X-HOTMART-HOTTOK (fallback body.hottok).
// O comprador cai sempre no funil "Boas vindas" (id 32), sob responsabilidade da
// Gabriela (id 27). O ESTÁGIO de entrada é definido pelo PRODUTO comprado:
//   - Escola de Empreendedorismo (product.id 5510712) → "Entrada - ESCOLA" (id 243)
//   - Formação Líderes Quânticos (product.id 7956451) → "Entrada - ESCOLA" (id 243)
// Os dois produtos compartilham o mesmo estágio hoje: o estágio próprio do Leadership
// (id 245) foi excluído do funil e o "Boas vindas" ficou só com a cadência da Escola.
// A conexão de origem continua distinguida no log e pode voltar a ter estágio próprio
// trocando HOTMART_ESTAGIO_LEADERSHIP_ID no .env.
// O hottok NÃO serve para rotear: as duas ofertas usam a mesma conta Hotmart e
// portanto o MESMO token — ele só autentica. O roteamento é pelo product.id.
// A camada de boas-vindas no WhatsApp é configurada pelo próprio usuário na
// ferramenta (não é disparada aqui).
const HOTMART_HOTTOK = process.env.HOTMART_WEBHOOK_HOTTOK || '';
const HOTMART_LEADERSHIP_HOTTOK = process.env.HOTMART_LEADERSHIP_HOTTOK || '';
const HOTMART_EMPRESA_ID = Number(process.env.HOTMART_EMPRESA_ID) || 5;
const HOTMART_FUNIL_ID = Number(process.env.HOTMART_FUNIL_ID) || 32;
const HOTMART_RESPONSAVEL_ID = Number(process.env.HOTMART_RESPONSAVEL_ID) || 27;
const HOTMART_ESTAGIO_ESCOLA_ID = Number(process.env.HOTMART_ESTAGIO_ESCOLA_ID) || 243;
const HOTMART_ESTAGIO_LEADERSHIP_ID = Number(process.env.HOTMART_ESTAGIO_LEADERSHIP_ID) || 243;
// Produtos Hotmart → estágio de entrada. Escola é o padrão (produto desconhecido cai em ESCOLA).
const HOTMART_PRODUTO_LEADERSHIP_ID = Number(process.env.HOTMART_PRODUTO_LEADERSHIP_ID) || 7956451;
// Carrinho abandonado (PURCHASE_OUT_OF_SHOPPING_CART) → funil "Escola Empreendedorismo" (24),
// estágio "Entrada de Leads" (208). Sem automação: o time comercial recupera manualmente.
const HOTMART_ABANDONO_FUNIL_ID = Number(process.env.HOTMART_ABANDONO_FUNIL_ID) || 24;
const HOTMART_ABANDONO_ESTAGIO_ID = Number(process.env.HOTMART_ABANDONO_ESTAGIO_ID) || 208;
// Proprietária dos leads de carrinho abandonado: Jéssica Machado (id 45).
const HOTMART_ABANDONO_RESPONSAVEL_ID = Number(process.env.HOTMART_ABANDONO_RESPONSAVEL_ID) || 45;

// Webhook de captação genérica de formulário de site → cria lead no funil
// "Escola Empreendedorismo" (id 24), estágio de entrada "Entrada de Leads" (id 208),
// sob responsabilidade da Jéssica (comercial, id 45). Só usa Nome e Telefone (país+DDD+número).
// Autenticado via X-Webhook-Secret (header) ou ?secret= / ?token= (query).
const ESCOLA_FORM_SECRET = process.env.ESCOLA_FORM_WEBHOOK_SECRET || '';
const ESCOLA_FORM_EMPRESA_ID = Number(process.env.ESCOLA_FORM_EMPRESA_ID) || 5;
const ESCOLA_FORM_FUNIL_ID = Number(process.env.ESCOLA_FORM_FUNIL_ID) || 24;
const ESCOLA_FORM_ESTAGIO_ID = Number(process.env.ESCOLA_FORM_ESTAGIO_ID) || 208;
const ESCOLA_FORM_RESPONSAVEL_ID = Number(process.env.ESCOLA_FORM_RESPONSAVEL_ID) || 45;
const ESCOLA_FORM_ORIGEM = 'Escola Empreendedorismo (form site)';

// Webhook do formulário "Caixa Rápido" (WordPress/Elementor) → mesmo funil da Escola
// Empreendedorismo (24), estágio "Entrada de Leads" (208), mas sob responsabilidade da
// Débora (id 22) e com origem própria, para separar a campanha no relatório.
// Diferente do form-escola, aqui o payload é qualificado: além de nome e telefone vêm
// e-mail, negócio e três respostas (faturamento atual, objetivo e maior desafio) que vão
// para as notas do lead — é o que o comercial usa para abrir a conversa.
// O secret é o mesmo do form-escola por padrão (mesmo site, mesma equipe); defina
// CAIXA_RAPIDO_FORM_WEBHOOK_SECRET no .env para dar um token só dele.
const CAIXA_FORM_SECRET =
  process.env.CAIXA_RAPIDO_FORM_WEBHOOK_SECRET || process.env.ESCOLA_FORM_WEBHOOK_SECRET || '';
const CAIXA_FORM_EMPRESA_ID = Number(process.env.CAIXA_RAPIDO_FORM_EMPRESA_ID) || 5;
const CAIXA_FORM_FUNIL_ID = Number(process.env.CAIXA_RAPIDO_FORM_FUNIL_ID) || 24;
const CAIXA_FORM_ESTAGIO_ID = Number(process.env.CAIXA_RAPIDO_FORM_ESTAGIO_ID) || 208;
const CAIXA_FORM_RESPONSAVEL_ID = Number(process.env.CAIXA_RAPIDO_FORM_RESPONSAVEL_ID) || 22;
const CAIXA_FORM_ORIGEM = process.env.CAIXA_RAPIDO_FORM_ORIGEM || 'Caixa Rápido';

// Monta o bloco de notas do Caixa Rápido, pulando o que não veio preenchido.
function notasCaixaRapido(campos: {
  email: string;
  negocio: string;
  faturamento: string;
  objetivo: string;
  desafio: string;
  origemUrl: string;
}): string {
  return [
    'Formulário Caixa Rápido',
    // Sempre presente (vira `outros` quando falta): é o rótulo que o dashboard de
    // integrações usa para separar as semanas da campanha, e um campo que só
    // aparece às vezes viraria um gráfico com buraco em vez de um balde.
    `Origem (URL): ${campos.origemUrl}`,
    campos.negocio ? `Negócio: ${campos.negocio}` : '',
    campos.email ? `E-mail: ${campos.email}` : '',
    campos.faturamento ? `Faturamento hoje: ${campos.faturamento}` : '',
    campos.objetivo ? `Objetivo em 6 a 12 meses: ${campos.objetivo}` : '',
    campos.desafio ? `Maior desafio: ${campos.desafio}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Webhook de eventos do SendFlow (plataforma de automação de WhatsApp) → cria lead
// no funil "Escola Empreendedorismo" (24), estágio "Entrada de Leads" (208), com a
// Débora (22) como proprietária e origem "Desafio 52 semanas" — a MESMA string que
// os 76 leads já existentes da campanha usam, para o relatório não partir em dois.
// Autenticado pelo "Sendtok" da campanha, aceito no header (X-Sendtok /
// X-Sendflow-Sendtok / X-Webhook-Secret / Authorization: Bearer), na query
// (?sendtok= / ?token= / ?secret=) ou no corpo: o painel do SendFlow não deixa
// escolher onde o token viaja, então aceitamos os três — e a URL entregue ao cliente
// já leva ?sendtok= embutido, que funciona mesmo se a plataforma não mandar nada.
const SENDFLOW_SENDTOK = process.env.SENDFLOW_WEBHOOK_SENDTOK || '';
const SENDFLOW_EMPRESA_ID = Number(process.env.SENDFLOW_EMPRESA_ID) || 5;
const SENDFLOW_FUNIL_ID = Number(process.env.SENDFLOW_FUNIL_ID) || 24;
const SENDFLOW_ESTAGIO_ID = Number(process.env.SENDFLOW_ESTAGIO_ID) || 208;
const SENDFLOW_RESPONSAVEL_ID = Number(process.env.SENDFLOW_RESPONSAVEL_ID) || 22;
// leads.origem é VARCHAR(50) — curta e idêntica à que já está no banco.
const SENDFLOW_ORIGEM = (process.env.SENDFLOW_ORIGEM || 'Desafio 52 semanas').slice(0, 50);
const SENDFLOW_CAMPANHA = process.env.SENDFLOW_CAMPANHA || 'Desafio 52 Semanas';

// O dono do lead vem da URL (`&dono=<id>`): o evento do SendFlow não diz por qual
// número a campanha foi disparada, então cada conta/número do SendFlow é cadastrada
// com a própria URL. Id que não é usuário ativo da empresa cai no padrão (Débora) —
// um lead com o dono errado é melhor do que um lead perdido, e o log avisa.
async function donoDoLeadSendflow(q: Record<string, unknown>): Promise<number> {
  const pedido = donoPedidoNaUrl(q);
  if (!pedido) return SENDFLOW_RESPONSAVEL_ID;
  const r = await query(
    `SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true`,
    [pedido, SENDFLOW_EMPRESA_ID]
  );
  if (r.rows.length) return pedido;
  console.warn(`[SendFlow] dono=${pedido} não é usuário ativo da empresa ${SENDFLOW_EMPRESA_ID} — usando ${SENDFLOW_RESPONSAVEL_ID}`);
  return SENDFLOW_RESPONSAVEL_ID;
}

// Webhook do app de Diagnóstico (/var/www/apps/diagnostico) → cria o lead que
// preencheu o diagnóstico no funil "Funil Principal" (id 46) da conta DuoFuturo
// (empresa 32), estágio de entrada "Novos" (288), sob responsabilidade do
// suporte@duofuturo.tech (usuário 57).
// Diferente dos webhooks de formulário de site, aqui o payload é JSON estruturado
// gerado pela nossa própria app — não precisa do fallback por rótulo do Elementor.
// Chamado em dois momentos:
//   evento=iniciado  → cria o lead ao enviar o formulário (não perde quem abandona)
//   evento=concluido → anexa o resultado (score, perfil e plano) como anotação
// Autenticado via X-Webhook-Secret (header) ou ?secret= / ?token= (query).
const DIAG_FORM_SECRET = process.env.DIAGNOSTICO_FORM_WEBHOOK_SECRET || '';
const DIAG_FORM_EMPRESA_ID = Number(process.env.DIAGNOSTICO_FORM_EMPRESA_ID) || 32;
const DIAG_FORM_FUNIL_ID = Number(process.env.DIAGNOSTICO_FORM_FUNIL_ID) || 46;
const DIAG_FORM_ESTAGIO_ID = Number(process.env.DIAGNOSTICO_FORM_ESTAGIO_ID) || 288;
const DIAG_FORM_RESPONSAVEL_ID = Number(process.env.DIAGNOSTICO_FORM_RESPONSAVEL_ID) || 57;

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

// ── SendFlow: leitura tolerante do payload ────────────────────────────────────
// O corpo do SendFlow muda com o evento e com o que o usuário monta no fluxo: os
// dados do contato tanto podem vir na raiz quanto dentro de `data`, `contact`,
// `chat`, `lead` ou de uma lista de variáveis {name, value}. Em vez de adivinhar o
// caminho, achatamos o corpo inteiro num par [chave normalizada, valor] e
// procuramos pelo NOME do campo, onde quer que ele esteja.
function achatarPayload(valor: any, out: Array<[string, string]> = [], prof = 0): Array<[string, string]> {
  if (valor == null || prof > 5) return out;
  if (Array.isArray(valor)) {
    for (const item of valor) achatarPayload(item, out, prof + 1);
    return out;
  }
  if (typeof valor !== 'object') return out;

  // Par {name|key|field|label, value} — formato de variável / campo customizado.
  const nomeCampo = valor.name ?? valor.key ?? valor.field ?? valor.label;
  const valorCampo = valor.value ?? valor.raw_value;
  if (typeof nomeCampo === 'string' && valorCampo != null && typeof valorCampo !== 'object') {
    out.push([normKey(nomeCampo), String(valorCampo).trim()]);
  }

  for (const [k, v] of Object.entries(valor)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.every(i => i == null || typeof i !== 'object')) {
      // lista de primitivos (tags, por exemplo) vira texto
      out.push([normKey(k), v.filter(Boolean).join(', ')]);
      continue;
    }
    if (typeof v === 'object') achatarPayload(v, out, prof + 1);
    else out.push([normKey(k), String(v).trim()]);
  }
  return out;
}

// Chaves que NUNCA descrevem o contato — "nome" aqui é o nome da campanha, do
// grupo, do fluxo. Sem isso o lead nasceria chamado "Desafio 52 Semanas".
const SENDFLOW_CHAVES_RUIDO = /\b(grupo|group|campanha|campaign|fluxo|flow|funil|funnel|tag|arquivo|file|midia|media|instancia|instance|conta|account|usuario|user|agente|agent|bot|template|evento|event|webhook)\b/;

// Procura o valor de um campo: primeiro por chave exata, depois por chave que
// CONTENHA o alias como palavra inteira (ex.: "contact phone"), ignorando ruído.
function acharCampo(campos: Array<[string, string]>, aliases: string[]): string {
  const alvos = aliases.map(normKey);
  for (const alvo of alvos) {
    for (const [k, v] of campos) if (v && k === alvo) return v;
  }
  for (const alvo of alvos) {
    for (const [k, v] of campos) {
      if (!v || SENDFLOW_CHAVES_RUIDO.test(k)) continue;
      if (k.split(' ').includes(alvo)) return v;
    }
  }
  return '';
}

// Estágios que pedem card para quem escreve a este usuário. Nenhum usuário marcado
// (NULL ou lista vazia) = todos os números da empresa.
async function estagiosComAutoLead(empresaId: number, usuarioId: number) {
  const r = await query(
    `SELECT ef.id AS estagio_id, ef.funil_id
       FROM estagios_funil ef
       JOIN funis f ON f.id = ef.funil_id
      WHERE f.empresa_id = $1
        AND f.ativo = true
        AND ef.auto_criar_lead = true
        AND (ef.auto_criar_lead_usuarios IS NULL
             OR array_length(ef.auto_criar_lead_usuarios, 1) IS NULL
             OR $2 = ANY(ef.auto_criar_lead_usuarios))`,
    [empresaId, usuarioId]
  );
  return r.rows as Array<{ estagio_id: number; funil_id: number }>;
}

// Cria o contato de quem escreveu pela primeira vez, no nome do dono da instância —
// só se algum estágio da empresa captura as mensagens dele. O nome chega depois, pelo
// `pushname`, no mesmo bloco que atualiza qualquer contato.
async function contatoParaPrimeiraMensagem(
  dono: { id: number; empresa_id: number }, jid: string, numero: string
): Promise<{ id: number; usuario_id: number; empresa_id: number } | null> {
  if (!podeSerContatoNovo(jid, numero)) return null;
  if ((await estagiosComAutoLead(dono.empresa_id, dono.id)).length === 0) return null;
  const r = await query(
    `INSERT INTO contatos_whatsapp (usuario_id, empresa_id, whatsapp_id, numero, is_grupo, sincronizado_at)
     VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP)
     ON CONFLICT (usuario_id, whatsapp_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id, usuario_id, empresa_id`,
    [dono.id, dono.empresa_id, `${numero}@c.us`, numero]
  );
  return r.rows[0] ?? null;
}

// Telefone tem validação própria: qualquer chave "phone-like" é candidata, mas só
// vale a que passa em telefonePlausivel (descarta DDI solto, id numérico, "phone_code").
function acharTelefone(campos: Array<[string, string]>): string {
  const chavesFone = ['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'number', 'msisdn', 'fone', 'contato', 'contact', 'remotejid', 'jid'];
  const candidatos: string[] = [];
  for (const [k, v] of campos) {
    if (!v) continue;
    const tokens = k.split(' ');
    if (!chavesFone.some(c => tokens.includes(c))) continue;
    if (tokens.includes('code') || tokens.includes('ddi') || tokens.includes('id')) continue;
    if (/@g\.us/i.test(v)) continue;                  // jid de GRUPO, não de pessoa
    if (/group|grupo/.test(k)) continue;              // groupJid, groupId, grupo_numero…
    candidatos.push(v);
  }
  for (const c of candidatos) {
    const digitos = String(c).replace(/\D/g, '');
    if (telefonePlausivel(digitos)) return digitos;
  }
  return '';
}

// O evento de entrada no grupo só traz o NÚMERO — o SendFlow não manda nome. Antes de
// deixar o card com a cara de um telefone, procura o nome nos contatos de WhatsApp da
// própria empresa: boa parte de quem entra na campanha já conversou com algum chip.
// Contato de grupo (is_grupo) fica de fora, e o push name é o último recurso.
async function nomeDoContatoConhecido(telefone: string, empresaId: number): Promise<string> {
  const variantes = variantesTelefone(telefone);
  if (!variantes.length) return '';
  const r = await query(
    `SELECT nome, nome_push FROM contatos_whatsapp
      WHERE empresa_id = $1
        AND COALESCE(is_grupo, false) = false
        AND REGEXP_REPLACE(numero, '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY (nullif(nome, '') IS NULL), ultima_mensagem_at DESC NULLS LAST
      LIMIT 1`,
    [empresaId, variantes]
  );
  const achado = String(r.rows[0]?.nome || r.rows[0]?.nome_push || '').trim();
  // Nome sem uma letra sequer é o próprio telefone gravado como nome ("+55 85 9176-2563"),
  // e não ajuda ninguém: nesse caso é melhor deixar o card com o número normalizado.
  return /[a-zà-ÿ]/i.test(achado) ? achado : '';
}

// No SendFlow a campanha É um grupo de WhatsApp: o evento que interessa é
// `group.updated.members.added`, e a pessoa que entrou vem em `data.number` — o
// `groupJid`/`groupId` ao lado é o GRUPO, não ela (por isso acharTelefone descarta
// chave com "group"/"grupo" e valor com @g.us).
// O que NÃO pode virar lead é o evento de SAÍDA: quem saiu do grupo, foi removido ou
// bloqueou. Esses só viram anotação, e só se a pessoa já estiver no funil.
function ehEventoDeSaida(evento: string): boolean {
  return /(removed|remove|removido|left|leave|saiu|exit|deleted|delete|blocked|bloqueado|unsubscribe|opt.?out)/i.test(evento);
}

// Garante que o estágio de destino de um lead automático ainda existe no funil.
// Estágio configurado por env/constante pode ser excluído pelo usuário na ferramenta —
// como leads.estagio_id tem FK ON DELETE RESTRICT, o insert quebraria com 500 e a origem
// (Hotmart, form) ficaria reenviando. Nesse caso caímos no estágio de entrada do funil.
// Retorna null se o próprio funil não existir (aí não há destino possível).
async function resolverEstagioEntrada(funilId: number, estagioPreferido: number): Promise<number | null> {
  const existe = await query(
    `SELECT 1 FROM estagios_funil WHERE id = $1 AND funil_id = $2`,
    [estagioPreferido, funilId]
  );
  if (existe.rows.length > 0) return estagioPreferido;

  const entrada = await query(
    `SELECT id FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC, id ASC LIMIT 1`,
    [funilId]
  );
  if (entrada.rows.length === 0) {
    console.error(`[Webhook] Funil ${funilId} sem estágios — impossível criar lead`);
    return null;
  }
  console.warn(
    `[Webhook] Estágio ${estagioPreferido} não existe no funil ${funilId}; ` +
    `usando o estágio de entrada ${entrada.rows[0].id}`
  );
  return entrada.rows[0].id;
}

// Monta o telefone do comprador da Hotmart a partir de checkout_phone_code + checkout_phone.
// A Hotmart é inconsistente no `code`: às vezes vem o DDI ("55"), às vezes repete o DDD
// ("11", "53", "62"...) que já está no `phone` — concatenar cego gerava número de 13 dígitos
// inválido (ex.: 11 + 11976937828 = 1111976937828) que nunca chegava no WhatsApp.
// Regra: se o `phone` já é um número nacional completo (10 ou 11 dígitos), o `code` só é
// aproveitado quando for um DDI estrangeiro de verdade — se for "55" ou uma repetição do
// DDD, assumimos Brasil. A normalização final (9º dígito) fica no leadsService.create.
function montarTelefoneHotmart(phoneCode: any, phone: any): string {
  const code = String(phoneCode || '').replace(/\D/g, '');
  const fone = String(phone || '').replace(/\D/g, '');
  if (!fone) return '';

  // Já veio completo com DDI 55 (55 + DDD + 8/9 dígitos)
  if (fone.startsWith('55') && (fone.length === 12 || fone.length === 13)) return fone;

  // Nacional: DDD + 8/9 dígitos
  if (fone.length === 10 || fone.length === 11) {
    if (!code || code === '55' || code === fone.slice(0, 2)) return `55${fone}`;
    return `${code}${fone}`; // DDI estrangeiro legítimo (ex.: 351 + 912345678)
  }

  return `${code}${fone}`;
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
  // Usa o modelo Gemini configurado; se o provider for Anthropic, cai no gemini-2.5-flash.
  // Era gemini-2.0-flash, que o Google desligou: de 09/07 a 15/09/2026 todo áudio da
  // Panteras (provider claude) voltou 404 e chegou ao agente sem transcrição (755 erros).
  const modelo = config.modelo?.startsWith('gemini') ? config.modelo : 'gemini-2.5-flash';

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
        isGroup, groupId, participant, pushname,
        // Porta da instância que recebeu a mensagem — é o que amarra a mensagem a UM dono
        port
      } = req.body;

      if (!from) {
        return res.status(400).json({ error: 'Campo "from" obrigatorio' });
      }

      // Dono da instância que recebeu a mensagem. Sem isso a busca de contato é só
      // pelo número, e um mesmo número cadastrado em duas empresas fazia a MESMA
      // mensagem ser gravada nas duas — conversa da Panteras aparecendo no CRM da
      // DuoFuturo e vice-versa (4.308 mensagens até 19/08/2026).
      // Sem dono não há empresa, e gravar "em todas que tiverem o número" é exatamente
      // o vazamento. Até 15/09/2026 as duas situações abaixo caíam no comportamento
      // antigo: `port` era opcional (para instância ainda não reiniciada) e porta sem
      // dono seguia sem filtro — o caso da 3010, que ficou órfã quando a master@
      // passou para o número oficial. Toda instância no ar carimba `port` desde 01/09,
      // e o canal oficial também.
      if (!port) {
        console.warn(`[Webhook] Mensagem sem "port" descartada (from=${from}) — não há como saber de que empresa ela é`);
        return res.json({ success: true, processed: false, reason: 'sem_porta' });
      }
      const donoResult = await query(
        `SELECT id, empresa_id FROM usuarios WHERE whatsapp_porta = $1 AND ativo = true LIMIT 1`,
        [Number(port)]
      );
      const donoInstancia: { id: number; empresa_id: number } | null = donoResult.rows[0] ?? null;
      if (!donoInstancia) {
        console.warn(`[Webhook] Porta ${port} sem usuário dono — mensagem descartada (from=${from})`);
        return res.json({ success: true, processed: false, reason: 'porta_sem_dono' });
      }

      // Reação (#188, migration 086): atributo da mensagem reagida, nunca um balão.
      // A mensagem é achada pelo id do WhatsApp dentro da empresa do dono da porta —
      // o mesmo recorte que impede a conversa de uma empresa aparecer em outra.
      if (req.body.event === 'reaction') {
        const { targetId, emoji } = req.body;
        if (!targetId) return res.json({ success: true, processed: false, reason: 'reacao_sem_alvo' });
        const coluna = fromMe ? 'reacao_minha' : 'reacao_contato';
        const r = await query(
          `UPDATE historico_mensagens SET ${coluna} = $3
            WHERE empresa_id = $1 AND whatsapp_message_id = $2 AND grupo_whatsapp_id IS NULL`,
          [donoInstancia.empresa_id, String(targetId), String(emoji || '').slice(0, 16) || null]
        );
        return res.json({ success: true, processed: (r.rowCount ?? 0) > 0, reason: r.rowCount ? undefined : 'mensagem_reagida_fora_do_crm' });
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

      // A conversa é da EMPRESA dona da instância: o mesmo número pode estar cadastrado
      // em outras empresas, e a mensagem não é delas.
      //
      // O recorte é por EMPRESA, não por usuário. Entre 19 e 21/08/2026 o filtro era
      // `usuario_id === dono.id`, e como vários chips da mesma empresa atendem os mesmos
      // contatos (466 números da Panteras têm contato em mais de um operador), toda
      // mensagem cujo contato pertencia a outro operador era DESCARTADA — nem histórico
      // nem contato novo. Foram 508 mensagens 1:1 perdidas em dois dias, e o card parava
      // de atualizar enquanto a conversa seguia no WhatsApp.
      if (donoInstancia) {
        const daEmpresa = contatosResult.rows.filter(
          (c: any) => c.empresa_id === donoInstancia!.empresa_id
        );
        // Dentro da empresa, o contato do próprio dono da porta tem preferência: quando
        // ele existe, a conversa é dele, e gravar também na cópia de outro operador
        // duplicaria a mensagem em dois cards.
        const doDono = daEmpresa.filter((c: any) => c.usuario_id === donoInstancia!.id);
        contatosResult = { ...contatosResult, rows: doDono.length > 0 ? doDono : daEmpresa };
      }

      if (contatosResult.rows.length === 0) {
        // Auto-vinculação: buscar leads com telefone correspondente que ainda não têm contato vinculado
        const leadsParaVincular = await query(
          `SELECT l.id, l.nome, l.usuario_id, l.empresa_id
           FROM leads l
           WHERE l.arquivado = false
             AND l.contato_whatsapp_id IS NULL
             AND REGEXP_REPLACE(COALESCE(l.telefone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
             AND ($2::int IS NULL OR l.empresa_id = $2)`,
          [numerosVariantes, donoInstancia?.empresa_id ?? null]
        );

        if (leadsParaVincular.rows.length === 0) {
          // Quem escreve pela PRIMEIRA vez não tem contato nem lead — e é justamente quem
          // o "Criar lead automaticamente" do estágio promete capturar. Até 23/09/2026 a
          // mensagem era descartada aqui, antes de chegar ao auto-lead (#177, Anchor: a
          // Flaviane escreveu 6 vezes para os dois chips e nada entrou). O motivo era não
          // haver como saber de quem é a instância; desde 15/09 o `port` é obrigatório e o
          // dono está resolvido. Só vale para número que um estágio da empresa pediu para
          // capturar — sem isso, toda conversa pessoal do chip viraria contato no CRM.
          const contatoNovo = direcao === 'entrada' && !isGroup
            ? await contatoParaPrimeiraMensagem(donoInstancia, contatoIdentifier || from, numero)
            : null;
          if (!contatoNovo) {
            console.log(`[Webhook] Contato nao encontrado: ${from} (numero: ${numero})${isGroup ? ` [grupo: ${groupId}]` : ''}`);
            return res.json({ success: true, processed: false, reason: 'contato_nao_encontrado' });
          }
          console.log(`[Webhook] Primeira mensagem de ${numero}: contato #${contatoNovo.id} criado para o usuário #${donoInstancia.id} (estágio com criação automática)`);
          contatosResult = { ...contatosResult, rows: [contatoNovo] };
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

        if (contatosCriados.length > 0) {
          contatosResult = { ...contatosResult, rows: contatosCriados };
        }
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

        // Duplicata ANTES de gravar a mídia: o arquivo era escrito e só depois o
        // `continue` descartava a mensagem — cada eco deixava um órfão no disco.
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

        // Salvar midia se houver. Grupo não guarda arquivo (migration 076): não aparece
        // no card e era 2/3 da mídia da Panteras. A mensagem entra com tipo e legenda.
        if (hasMedia && mediaData && !isGroup) {
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
          // `origem`: o webhook capta o que entra (recebida) e o que o operador manda
          // pelo celular/app (manual). Nenhum dos dois entra no espaçamento anti-ban —
          // conversa de gente não pode segurar a fila de automação. As mensagens que a
          // automação envia já são gravadas pelo próprio caminho de envio, com a origem
          // certa, e as capturas de eco delas são descartadas antes daqui.
          `INSERT INTO historico_mensagens (
            contato_whatsapp_id, usuario_id, empresa_id, whatsapp_message_id,
            direcao, tipo, conteudo, media_url, media_filename, media_mimetype, media_tamanho,
            grupo_whatsapp_id, grupo_nome, origem,
            enviado_at, resposta_a_message_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, to_timestamp($15), $16)`,
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
            direcao === 'entrada' ? 'recebida' : 'manual',
            timestamp || Math.floor(Date.now() / 1000),
            req.body.quotedId ? String(req.body.quotedId).slice(0, 100) : null
          ]
        );

        // Mensagem de GRUPO fica registrada e para aqui. Ela é atribuída ao
        // contato do participante (não existe "contato grupo" com histórico),
        // então tratá-la como conversa 1:1 fazia o CRM concluir que o lead
        // respondeu: zerava aguardando_resposta, mexia em ultima_resposta_cliente_at,
        // somava mensagem não lida, registrava atividade e — o pior — disparava a
        // automação de estagio_apos_resposta_id, movendo o lead de estágio porque
        // alguém falou num grupo. A conversa individual é a única que conta.
        if (isGroup) {
          console.log(`[Webhook] Mensagem de grupo registrada (contato ${contatoId}, grupo ${groupId}) — sem efeito no lead`);
          continue;
        }

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

        // Buscar lead(s) vinculados a este contato. Um contato pode ter leads em mais
        // de um funil — ordena para eleger um lead PRINCIPAL determinístico (primeiro
        // com agente IA ativo; desempate pela atividade mais recente), que recebe o
        // vínculo da mensagem e o job do agente. Antes, o lead_id do histórico ficava
        // com o último do loop (aleatório) e o agente era enfileirado para TODOS os
        // leads, podendo responder em dobro.
        const leadsResult = await query(
          `SELECT l.id, COALESCE(l.agente_ia_ativo, ef.agente_ia_ativo, false) AS agente_ativo
           FROM leads l
           LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
           WHERE l.contato_whatsapp_id = $1 AND l.arquivado = false
           ORDER BY COALESCE(l.agente_ia_ativo, ef.agente_ia_ativo, false) DESC,
                    l.data_ultimo_contato DESC NULLS LAST, l.id DESC`,
          [contatoId]
        );
        const leadPrincipal = leadsResult.rows[0] || null;

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
                // moverPorAutomacao também encerra a cadência pendente do estágio
                // anterior e inicia a do novo (antes o UPDATE cru deixava a cadência
                // antiga ativa e a nova nunca começava).
                await leadsService.moverPorAutomacao(
                  lead.id, contato.empresa_id, usuarioId, estagioInfo.estagio_apos_resposta_id,
                  `Movido automaticamente para "${estagioInfo.estagio_destino_nome || '?'}" após resposta do lead`,
                  {
                    trigger: 'resposta_lead',
                    estagio_anterior_nome: estagioInfo.estagio_nome,
                  }
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

        }

        if (leadPrincipal) {
          // Vincular mensagem ao lead PRINCIPAL (uma vez, fora do loop)
          await query(
            `UPDATE historico_mensagens SET lead_id = $1
             WHERE contato_whatsapp_id = $2 AND whatsapp_message_id = $3`,
            [leadPrincipal.id, contatoId, messageId]
          );

          // Enfileirar agente IA apenas para o lead principal — no máximo UMA resposta
          // por mensagem recebida, mesmo com o contato em vários funis.
          if (direcao === 'entrada' && tipo === 'texto' && body && !isGroup) {
            adicionarJobAgente(contatoId, leadPrincipal.id, body, usuarioId, contato.empresa_id)
              .catch((err: any) => console.error(`[AgenteIA] Erro ao enfileirar job para lead #${leadPrincipal.id}:`, err.message));
          }
          // Foto, vídeo ou documento COM legenda: a legenda costuma ser a pergunta ("paro
          // aqui e depois passo o cartão?" com o print da tela). Só texto chegava ao agente,
          // e 52 legendas em 30 dias ficaram sem resposta. O agente não vê o arquivo — o
          // aviso no texto é para ele não fingir que viu.
          if (direcao === 'entrada' && ['imagem', 'video', 'documento'].includes(tipo) && body && !isGroup) {
            adicionarJobAgente(contatoId, leadPrincipal.id, `[${tipo} anexado, você não consegue ver o arquivo] ${body}`, usuarioId, contato.empresa_id)
              .catch((err: any) => console.error(`[AgenteIA] Erro ao enfileirar job para lead #${leadPrincipal.id}:`, err.message));
          }
          // Áudio: transcreve via Gemini e enfileira (requer gemini_api_key na config do agente)
          if (direcao === 'entrada' && tipo === 'audio' && mediaData && !isGroup) {
            transcreverEEnfileirar(contatoId, leadPrincipal.id, usuarioId, contato.empresa_id, mediaData, mimetype)
              .catch((err: any) => console.error(`[AgenteIA] Erro transcrição áudio lead #${leadPrincipal.id}:`, err.message));
          }
        }

        // Criação automática de lead: estágios com auto_criar_lead ativo cujo número
        // (usuario_id) casa com o dono deste contato. Dedup por funil evita recriação.
        if (direcao === 'entrada' && !isGroup) {
          try {
            for (const est of await estagiosComAutoLead(empresaId, usuarioId)) {
              const novo = await leadsService.autoCriarLeadDoWhatsApp(
                empresaId, usuarioId, contatoId, est.funil_id, est.estagio_id
              );
              if (novo) {
                // O card nasce DEPOIS do bloco acima, que só alcança leads que já
                // existiam: sem isto a mensagem que o criou ficava sem lead_id e o
                // card entrava sem o selo de não lida — quem escreve pela primeira
                // vez era justamente quem não aparecia como "nova mensagem".
                await query(
                  `UPDATE leads SET
                     mensagens_nao_lidas = COALESCE(mensagens_nao_lidas, 0) + 1,
                     ultima_resposta_cliente_at = CURRENT_TIMESTAMP,
                     data_ultimo_contato = CURRENT_TIMESTAMP
                   WHERE id = $1`,
                  [novo.id]
                );
                await query(
                  `UPDATE historico_mensagens SET lead_id = $1
                   WHERE contato_whatsapp_id = $2 AND whatsapp_message_id = $3 AND lead_id IS NULL`,
                  [novo.id, contatoId, messageId]
                );
                console.log(`[Webhook] Auto-lead criado #${novo.id} (contato ${contatoId}, número user #${usuarioId}) no funil ${est.funil_id}/estágio ${est.estagio_id}`);
              }
            }
          } catch (autoErr: any) {
            console.error(`[Webhook] Erro na criação automática de lead (contato ${contatoId}):`, autoErr.message);
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

  // Recebe o preenchimento de um formulário de site (WordPress/Elementor, Google Forms,
  // HTML puro, etc.) e cria o lead no funil "Escola Empreendedorismo", estágio "Entrada de Leads".
  // Só aproveita Nome e Telefone (país+DDD+número, ex.: 5531999998888).
  // Autenticada via header X-Webhook-Secret OU query string (?secret= / ?token=).
  async receberFormEscola(req: Request, res: Response, next: NextFunction) {
    try {
      if (!ESCOLA_FORM_SECRET) {
        console.error('[FormEscola] ESCOLA_FORM_WEBHOOK_SECRET não configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }
      const secret = req.headers['x-webhook-secret'] || req.query.secret || req.query.token;
      if (secret !== ESCOLA_FORM_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      // Nome: aceita nome/name/first_name (+ sobrenome opcional) por Field ID ou por rótulo.
      const nome = pickFormField(req.body, ['nome', 'name', 'first_name', 'primeiro_nome'])
        || pickByTokens(req.body, ['nome']);
      const sobrenome = pickFormField(req.body, ['sobrenome', 'last_name', 'surname'])
        || pickByTokens(req.body, ['sobrenome']);
      // Telefone: país+DDD+número. A normalização BR é feita pelo leadsService.create.
      const telefone = pickFormField(req.body, ['telefone', 'phone', 'celular', 'whatsapp', 'tel'])
        || pickByTokens(req.body, ['telefone']) || pickByTokens(req.body, ['celular'])
        || pickByTokens(req.body, ['whatsapp']);

      const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();

      if (!nomeCompleto || !telefone) {
        console.warn('[FormEscola] Payload sem nome/telefone:', JSON.stringify(req.body).slice(0, 500));
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
      }

      const estagioEscola = await resolverEstagioEntrada(ESCOLA_FORM_FUNIL_ID, ESCOLA_FORM_ESTAGIO_ID);
      if (!estagioEscola) {
        return res.status(500).json({ error: 'Funil de destino sem estágios' });
      }

      try {
        const lead = await leadsService.create(
          ESCOLA_FORM_EMPRESA_ID,
          ESCOLA_FORM_RESPONSAVEL_ID,
          {
            funil_id: ESCOLA_FORM_FUNIL_ID,
            estagio_id: estagioEscola,   // "Entrada de Leads"
            responsavel_id: ESCOLA_FORM_RESPONSAVEL_ID,
            nome: nomeCompleto,
            telefone,
            origem: ESCOLA_FORM_ORIGEM,
          },
          false // requireTarefa = false (lead automático de captação)
        );
        console.log(`[FormEscola] Lead #${lead.id} criado: "${lead.nome}" (${telefone})`);
        return res.status(201).json({ success: true, lead_id: lead.id });
      } catch (err: any) {
        // Duplicata de telefone no funil: já existe lead → 200 para o form não reenviar.
        if (/Já existe um lead/i.test(err?.message || '')) {
          console.log(`[FormEscola] Duplicata ignorada: ${err.message}`);
          return res.json({ success: true, duplicate: true, message: err.message });
        }
        throw err;
      }
    } catch (error) {
      console.error('[FormEscola] Erro no webhook do formulário Escola Empreendedorismo:', error);
      next(error);
    }
  },

  // Recebe o preenchimento do formulário "Caixa Rápido" (WordPress/Elementor) e cria o
  // lead no funil "Escola Empreendedorismo", estágio "Entrada de Leads", com a Débora
  // como proprietária e origem "Caixa Rápido". Ver constantes CAIXA_FORM_* no topo.
  // Autenticada via header X-Webhook-Secret OU query string (?secret= / ?token=) —
  // o Elementor Pro não deixa configurar header customizado.
  async receberFormCaixaRapido(req: Request, res: Response, next: NextFunction) {
    try {
      if (!CAIXA_FORM_SECRET) {
        console.error('[CaixaRapido] Nenhum secret configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }
      const secret = req.headers['x-webhook-secret'] || req.query.secret || req.query.token;
      if (secret !== CAIXA_FORM_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      // Cada campo aceita o Field ID configurado no Elementor e, como rede de segurança,
      // o rótulo da pergunta (que é o que o Elementor manda quando o Field ID fica no
      // padrão "field_abc123").
      const nome = pickFormField(req.body, ['nome', 'nome_completo', 'name', 'first_name'])
        || pickByTokens(req.body, ['nome']);
      const sobrenome = pickFormField(req.body, ['sobrenome', 'last_name', 'surname'])
        || pickByTokens(req.body, ['sobrenome']);
      const telefone = pickFormField(req.body, ['whatsapp', 'telefone', 'phone', 'celular', 'tel'])
        || pickByTokens(req.body, ['whatsapp']) || pickByTokens(req.body, ['telefone'])
        || pickByTokens(req.body, ['celular']);
      const email = pickFormField(req.body, ['email', 'e_mail', 'mail'])
        || pickByTokens(req.body, ['email']) || pickByTokens(req.body, ['mail']);
      const negocio = pickFormField(req.body, ['negocio', 'seu_negocio', 'business', 'empresa'])
        || pickByTokens(req.body, ['negocio']);

      // As duas perguntas de faturamento têm a MESMA palavra-chave: o desempate é pelo
      // resto do rótulo — "hoje/atual/medio/mensal" contra "objetivo/meta/proximos/meses".
      const faturamento =
        pickFormField(req.body, ['faturamento', 'faturamento_atual', 'faturamento_hoje'])
        || pickByTokens(req.body, ['faturamento'], ['hoje', 'atual', 'medio', 'mensal']);
      const objetivo =
        pickFormField(req.body, ['objetivo', 'objetivo_faturamento', 'meta', 'objetivo_6_12'])
        || pickByTokens(req.body, ['faturamento'], ['objetivo', 'meta', 'proximos', 'meses'])
        || pickByTokens(req.body, ['objetivo']);
      const desafio = pickFormField(req.body, ['desafio', 'maior_desafio', 'challenge'])
        || pickByTokens(req.body, ['desafio']);

      // De qual link a pessoa veio: `?utm_source=semana2` na URL da landing, que o
      // JavaScript da página guarda na chegada e manda no envio. Só nomes explícitos
      // de utm entram aqui — `origem` NÃO, porque a página já manda nesse campo uma
      // constante sua ("landing-seu-plano-de-liberdade-financeira") que não é campanha.
      const utmSource = normalizarUtmSource(
        pickFormField(req.body, ['utm_source', 'utm', 'utm_origem', 'source', 'origem_url'])
      );

      const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();

      // Só nome e telefone são obrigatórios: o resto é qualificação, e perder um lead
      // porque um rótulo mudou no WordPress seria pior do que recebê-lo incompleto.
      if (!nomeCompleto || !telefone) {
        console.warn('[CaixaRapido] Payload sem nome/telefone:', JSON.stringify(req.body).slice(0, 500));
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
      }

      const notas = notasCaixaRapido({ email, negocio, faturamento, objetivo, desafio, origemUrl: utmSource });

      // A origem carrega a campanha: "Caixa Rápido - semana2". O prefixo é o que
      // mantém o lead reconhecível pelo catálogo do dashboard de integrações
      // (`origemPrefixo`), e o corte em 50 é o tamanho da coluna.
      const origemLead = `${CAIXA_FORM_ORIGEM} - ${utmSource}`.slice(0, 50);

      // O funil 24 recebe outras campanhas: se a pessoa já está lá, as respostas são
      // anexadas ao card existente em vez de virar lead duplicado — o estágio e a origem
      // do card antigo ficam intactos (um lead em "Fechamento" não volta para a entrada).
      const duplicata = await leadsService.telefoneExiste(
        telefone,
        CAIXA_FORM_EMPRESA_ID,
        undefined,
        CAIXA_FORM_FUNIL_ID
      );
      if (duplicata.existe && duplicata.lead_id) {
        const carimbo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await query(
          `UPDATE leads
              SET notas = concat_ws(E'\\n\\n', nullif(notas, ''), $2::text),
                  email = coalesce(nullif(email, ''), $3::text),
                  updated_at = NOW()
            WHERE id = $1`,
          [duplicata.lead_id, `[${carimbo}] ${notas}`, email || null]
        );
        console.log(`[CaixaRapido] Lead #${duplicata.lead_id} já existia — respostas anexadas`);
        return res.json({ success: true, duplicate: true, lead_id: duplicata.lead_id });
      }

      const estagio = await resolverEstagioEntrada(CAIXA_FORM_FUNIL_ID, CAIXA_FORM_ESTAGIO_ID);
      if (!estagio) {
        return res.status(500).json({ error: 'Funil de destino sem estágios' });
      }

      const lead = await leadsService.create(
        CAIXA_FORM_EMPRESA_ID,
        CAIXA_FORM_RESPONSAVEL_ID,
        {
          funil_id: CAIXA_FORM_FUNIL_ID,
          estagio_id: estagio,
          responsavel_id: CAIXA_FORM_RESPONSAVEL_ID,
          nome: nomeCompleto,
          telefone,
          email: email || undefined,
          empresa: negocio || undefined,
          origem: origemLead,
          notas,
        },
        false // requireTarefa = false (lead automático de captação)
      );

      console.log(`[CaixaRapido] Lead #${lead.id} criado: "${lead.nome}" (${telefone})`);
      return res.status(201).json({ success: true, lead_id: lead.id });
    } catch (error) {
      console.error('[CaixaRapido] Erro no webhook do formulário Caixa Rápido:', error);
      next(error);
    }
  },

  // Confere se a URL do webhook está no ar (o painel do SendFlow e o cliente testam
  // colando o endereço no navegador, que é um GET). Não cria nada e não exige token.
  async statusSendflow(_req: Request, res: Response) {
    return res.json({
      success: true,
      webhook: 'sendflow',
      metodo: 'POST',
      configurado: Boolean(SENDFLOW_SENDTOK),
    });
  },

  // Recebe um evento de usuário do SendFlow e cria o lead da campanha no funil
  // "Escola Empreendedorismo". Ver constantes SENDFLOW_* no topo do arquivo.
  async receberSendflow(req: Request, res: Response, next: NextFunction) {
    try {
      if (!SENDFLOW_SENDTOK) {
        console.error('[SendFlow] SENDFLOW_WEBHOOK_SENDTOK não configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }

      const body: any = req.body || {};
      const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      const enviado = String(
        req.headers['x-sendtok'] || req.headers['x-sendflow-sendtok'] || req.headers['sendtok']
        || req.headers['x-webhook-secret'] || bearer
        || req.query.sendtok || req.query.token || req.query.secret
        || body.sendtok || body.token || body.secret || ''
      ).trim();

      if (enviado.toUpperCase() !== SENDFLOW_SENDTOK.toUpperCase()) {
        console.warn('[SendFlow] Sendtok ausente ou inválido');
        return res.status(401).json({ error: 'Sendtok invalido' });
      }

      const campos = achatarPayload(body);
      const evento = acharCampo(campos, ['evento', 'event', 'event_type', 'tipo', 'type', 'acao', 'action', 'trigger']);

      // O corpo inteiro vai para o log: o formato do SendFlow não é documentado e muda
      // por evento, então é por aqui que se confere o mapeamento de campos em produção.
      console.log(`[SendFlow] evento "${evento || '?'}" recebido:`, JSON.stringify(body).slice(0, 1500));

      const telefone = acharTelefone(campos);

      // Evento sem telefone de gente (teste do painel, evento de sistema, placeholder):
      // responde 200 para o SendFlow não marcar o webhook como quebrado e desligá-lo.
      if (!telefone) {
        // O botão "Testar" do SendFlow manda o payload de exemplo da documentação, com
        // number "0000000000000". Ignorar é o certo — mas a resposta precisa dizer que
        // o teste FUNCIONOU, senão o painel mostra só "ignorado" e parece falha.
        const numeroBruto = acharCampo(campos, ['number', 'numero', 'phone', 'telefone', 'whatsapp']);
        const ehTeste = /^(\d)\1+$/.test(String(numeroBruto).replace(/\D/g, ''));
        console.warn('[SendFlow] Evento sem telefone válido, ignorado:', JSON.stringify(body).slice(0, 600));
        return res.json({
          success: true,
          ignorado: true,
          teste: ehTeste || undefined,
          motivo: ehTeste
            ? 'Conexao OK: payload de teste do SendFlow (numero 0000000000000) recebido e reconhecido. Nenhum lead criado, de proposito.'
            : 'evento sem telefone',
        });
      }

      const nome = acharCampo(campos, [
        'nome', 'name', 'nome_completo', 'full_name', 'primeiro_nome', 'first_name',
        'push_name', 'pushname', 'contact_name', 'nome_contato',
      ]);
      const email = acharCampo(campos, ['email', 'e_mail', 'mail']);
      const tags = acharCampo(campos, ['tags', 'tag', 'etiquetas']);
      // A campanha e o grupo do SendFlow vão para as notas: é o que diz ao comercial
      // por onde a pessoa entrou quando a mesma conta roda mais de uma campanha.
      const campanha = acharCampo(campos, ['campaignname', 'campaign_name', 'campanha', 'campaign']);
      const grupo = acharCampo(campos, ['groupname', 'group_name', 'grupo', 'group']);
      // Club do Livro e Desafio 52 Semanas chegam pela mesma conta: é o nome do grupo
      // (ou da campanha) que decide a origem do lead.
      const destino = campanhaDoEvento(campanha, grupo, {
        origem: SENDFLOW_ORIGEM,
        campanha: SENDFLOW_CAMPANHA,
      });

      // Sem nome no payload, tenta o contato de WhatsApp já conhecido; em último caso o
      // card fica com o número — melhor um lead identificável pelo telefone do que nenhum.
      const nomeConhecido = nome || await nomeDoContatoConhecido(telefone, SENDFLOW_EMPRESA_ID);
      const nomeLead = (nomeConhecido || telefone).slice(0, 200);

      const notas = [
        `Campanha ${campanha || destino.campanha} (SendFlow)`,
        grupo ? `Grupo: ${grupo}` : '',
        evento ? `Evento: ${evento}` : '',
        tags ? `Tags: ${tags}` : '',
        email ? `E-mail: ${email}` : '',
      ].filter(Boolean).join('\n');

      // Saída do grupo não cria lead: no máximo anota no card de quem já está no funil.
      // Criar lead de quem acabou de sair seria entregar ao comercial o oposto do lead.
      if (ehEventoDeSaida(evento)) {
        const jaExiste = await leadsService.telefoneExiste(
          telefone, SENDFLOW_EMPRESA_ID, undefined, SENDFLOW_FUNIL_ID
        );
        if (!jaExiste.existe || !jaExiste.lead_id) {
          console.log(`[SendFlow] Saída "${evento}" de ${telefone} sem lead no funil — ignorada`);
          return res.json({ success: true, ignorado: true, motivo: 'evento de saída' });
        }
        const carimboSaida = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await query(
          `UPDATE leads
              SET notas = concat_ws(E'\\n\\n', nullif(notas, ''), $2::text),
                  updated_at = NOW()
            WHERE id = $1`,
          [jaExiste.lead_id, `[${carimboSaida}] Saiu do grupo (SendFlow) — evento ${evento}${grupo ? ` — ${grupo}` : ''}`]
        );
        console.log(`[SendFlow] Saída anotada no lead #${jaExiste.lead_id}`);
        return res.json({ success: true, lead_id: jaExiste.lead_id, anotacao: true });
      }

      // O funil 24 recebe várias campanhas: quem já está lá recebe o evento anexado
      // às notas, sem mudar estágio nem origem — um lead em "Fechamento" não volta
      // para a entrada porque o SendFlow disparou de novo.
      const duplicata = await leadsService.telefoneExiste(
        telefone, SENDFLOW_EMPRESA_ID, undefined, SENDFLOW_FUNIL_ID
      );
      if (duplicata.existe && duplicata.lead_id) {
        const carimbo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await query(
          `UPDATE leads
              SET notas = concat_ws(E'\\n\\n', nullif(notas, ''), $2::text),
                  email = coalesce(nullif(email, ''), $3::text),
                  updated_at = NOW()
            WHERE id = $1`,
          [duplicata.lead_id, `[${carimbo}] ${notas}`, email || null]
        );
        console.log(`[SendFlow] Lead #${duplicata.lead_id} já existia — evento anexado`);
        return res.json({ success: true, duplicate: true, lead_id: duplicata.lead_id });
      }

      const estagio = await resolverEstagioEntrada(SENDFLOW_FUNIL_ID, SENDFLOW_ESTAGIO_ID);
      if (!estagio) {
        return res.status(500).json({ error: 'Funil de destino sem estágios' });
      }

      const dono = await donoDoLeadSendflow(req.query as Record<string, unknown>);
      const lead = await leadsService.create(
        SENDFLOW_EMPRESA_ID,
        dono,
        {
          funil_id: SENDFLOW_FUNIL_ID,
          estagio_id: estagio,              // "Entrada de Leads"
          responsavel_id: dono,             // &dono= da URL; sem ele, a Débora
          nome: nomeLead,
          telefone,
          email: email || undefined,
          origem: destino.origem,
          notas,
        },
        false // requireTarefa = false (lead automático de captação)
      );

      console.log(`[SendFlow] Lead #${lead.id} criado: "${lead.nome}" (${telefone}) · ${destino.origem} · dono ${dono}${evento ? ` — evento ${evento}` : ''}`);
      return res.status(201).json({ success: true, lead_id: lead.id });
    } catch (error: any) {
      // Duplicata em corrida (dois eventos no mesmo instante): 200 para não reenviar.
      if (/Já existe um lead/i.test(error?.message || '')) {
        console.log(`[SendFlow] Duplicata ignorada: ${error.message}`);
        return res.json({ success: true, duplicate: true, message: error.message });
      }
      console.error('[SendFlow] Erro no webhook do SendFlow:', error);
      next(error);
    }
  },

  // Recebe o lead do app de Diagnóstico e cria/atualiza no "Funil Principal" da
  // conta DuoFuturo. Ver constantes DIAG_FORM_* no topo do arquivo.
  async receberFormDiagnostico(req: Request, res: Response, next: NextFunction) {
    try {
      if (!DIAG_FORM_SECRET) {
        console.error('[FormDiagnostico] DIAGNOSTICO_FORM_WEBHOOK_SECRET não configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }
      const secret = req.headers['x-webhook-secret'] || req.query.secret || req.query.token;
      if (secret !== DIAG_FORM_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      const b = req.body || {};
      const nome = String(b.nome || '').trim();
      const telefone = String(b.telefone || '').trim();
      if (!nome || !telefone) {
        console.warn('[FormDiagnostico] Payload sem nome/telefone:', JSON.stringify(b).slice(0, 400));
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
      }

      const evento = b.evento === 'concluido' ? 'concluido' : 'iniciado';
      const diagnostico = String(b.diagnostico || 'Diagnóstico').trim();
      // leads.origem é VARCHAR(50) — o nome completo do diagnóstico vai nas notas
      const origem = `${diagnostico} (diagnóstico)`.slice(0, 50);

      // Bloco de resultado — só existe no evento de conclusão
      const linhasResultado = evento === 'concluido' ? [
        b.score != null && `Score geral: ${b.score}/100`,
        b.perfil && `Perfil de maturidade: ${b.perfil}`,
        b.etapa && `Ponto de partida: ${b.etapa}`,
        Array.isArray(b.prioridades) && b.prioridades.length > 0 &&
          `\nPrioridades identificadas:\n${b.prioridades.map((p: string) => `- ${p}`).join('\n')}`,
        Array.isArray(b.servicos) && b.servicos.length > 0 &&
          `\nServiços indicados (nesta ordem):\n${b.servicos.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`,
        b.resultado_url && `\nResultado completo: ${b.resultado_url}`,
      ].filter(Boolean).join('\n') : '';

      const notasBase = [
        `Origem: ${diagnostico}`,
        b.cargo && `Cargo: ${b.cargo}`,
        b.faturamento_atual && `Faturamento informado: ${b.faturamento_atual}`,
      ].filter(Boolean).join('\n');

      // Já existe lead deste telefone neste funil? Então o diagnóstico foi
      // concluído depois de o lead ter sido criado no início — anexa anotação.
      const existente = await leadsService.telefoneExiste(
        telefone, DIAG_FORM_EMPRESA_ID, undefined, DIAG_FORM_FUNIL_ID
      );

      if (existente.existe && existente.lead_id) {
        if (!linhasResultado) {
          console.log(`[FormDiagnostico] Lead #${existente.lead_id} já existe, evento "${evento}" sem resultado — ignorado`);
          return res.json({ success: true, duplicate: true, lead_id: existente.lead_id });
        }
        await query(
          `INSERT INTO anotacoes_lead (lead_id, empresa_id, usuario_id, conteudo, tipo, origem)
           VALUES ($1, $2, $3, $4, 'importante', 'sistema')`,
          [
            existente.lead_id,
            DIAG_FORM_EMPRESA_ID,
            DIAG_FORM_RESPONSAVEL_ID,
            `${diagnostico} concluído\n\n${linhasResultado}`,
          ]
        );
        console.log(`[FormDiagnostico] Resultado anexado ao lead #${existente.lead_id} ("${existente.lead_nome}")`);
        return res.json({ success: true, lead_id: existente.lead_id, anotacao: true });
      }

      const estagio = await resolverEstagioEntrada(DIAG_FORM_FUNIL_ID, DIAG_FORM_ESTAGIO_ID);
      if (!estagio) {
        return res.status(500).json({ error: 'Funil de destino sem estágios' });
      }

      const lead = await leadsService.create(
        DIAG_FORM_EMPRESA_ID,
        DIAG_FORM_RESPONSAVEL_ID,
        {
          funil_id: DIAG_FORM_FUNIL_ID,
          estagio_id: estagio,
          responsavel_id: DIAG_FORM_RESPONSAVEL_ID,
          nome,
          telefone,
          email: b.email || undefined,
          cargo: b.cargo || undefined,
          origem,
          notas: [notasBase, linhasResultado].filter(Boolean).join('\n') || undefined,
        },
        false // requireTarefa = false (lead automático de captação)
      );
      console.log(`[FormDiagnostico] Lead #${lead.id} criado: "${lead.nome}" (${telefone}) — evento ${evento}`);
      return res.status(201).json({ success: true, lead_id: lead.id });

    } catch (error: any) {
      // Duplicata em corrida: responde 200 para a app não reenviar
      if (/Já existe um lead/i.test(error?.message || '')) {
        console.log(`[FormDiagnostico] Duplicata ignorada: ${error.message}`);
        return res.json({ success: true, duplicate: true, message: error.message });
      }
      console.error('[FormDiagnostico] Erro no webhook do diagnóstico:', error);
      next(error);
    }
  },

  // Recebe a notificação de compra da Hotmart (webhook 2.0.0) e cria o lead no CRM.
  // Apenas o evento PURCHASE_APPROVED gera lead; os demais são reconhecidos com 200 e ignorados.
  async receberCompraHotmart(req: Request, res: Response, next: NextFunction) {
    try {
      if (!HOTMART_HOTTOK) {
        console.error('[Hotmart] HOTMART_WEBHOOK_HOTTOK não configurado no .env');
        return res.status(500).json({ error: 'Webhook não configurado' });
      }
      // Autenticação: o hottok (header X-HOTMART-HOTTOK, fallback body.hottok em 1.0)
      // só valida a origem. As duas ofertas compartilham a mesma conta Hotmart, então
      // aceitamos QUALQUER token configurado — o roteamento é feito depois pelo product.id.
      const hottok = String(req.headers['x-hotmart-hottok'] || req.body?.hottok || '');
      const tokensValidos = [HOTMART_HOTTOK, HOTMART_LEADERSHIP_HOTTOK].filter(Boolean);
      if (!hottok || !tokensValidos.includes(hottok)) {
        return res.status(401).json({ error: 'hottok invalido' });
      }

      const body = req.body || {};
      const event = body.event || body.data?.event;

      // Carrinho abandonado: iniciou o checkout e não finalizou → cria lead de recuperação
      // no funil "Escola Empreendedorismo" / estágio "Entrada de Leads" (sem automação).
      if (event === 'PURCHASE_OUT_OF_SHOPPING_CART') {
        const d = body.data || {};
        const b = d.buyer || {};
        const nomeAb = String(b.name || [b.first_name, b.last_name].filter(Boolean).join(' ') || '').trim();
        const emailAb = String(b.email || '').trim();
        const telefoneAb = montarTelefoneHotmart(
          b.checkout_phone_code,
          b.checkout_phone || (typeof b.phone === 'string' ? b.phone : '')
        );
        const produtoAb = String(d.product?.name || '').trim();

        if (!nomeAb && !telefoneAb && !emailAb) {
          console.warn('[Hotmart/Abandono] Payload sem comprador reconhecido:', JSON.stringify(body).slice(0, 500));
          return res.status(400).json({ error: 'Nenhum dado de comprador (nome/telefone/email)' });
        }

        const notasAb = [
          'Carrinho abandonado — iniciou o checkout e não finalizou a compra',
          produtoAb && `Produto: ${produtoAb}${d.product?.id ? ` (#${d.product.id})` : ''}`,
          d.offer?.code && `Oferta: ${d.offer.code}`,
        ].filter(Boolean).join('\n');

        const estagioAb = await resolverEstagioEntrada(HOTMART_ABANDONO_FUNIL_ID, HOTMART_ABANDONO_ESTAGIO_ID);
        if (!estagioAb) {
          return res.status(500).json({ error: 'Funil de destino sem estágios' });
        }

        try {
          const lead = await leadsService.create(
            HOTMART_EMPRESA_ID,
            HOTMART_ABANDONO_RESPONSAVEL_ID,
            {
              funil_id: HOTMART_ABANDONO_FUNIL_ID,
              estagio_id: estagioAb,
              responsavel_id: HOTMART_ABANDONO_RESPONSAVEL_ID,   // proprietária: Jéssica
              nome: nomeAb || telefoneAb || emailAb,
              telefone: telefoneAb || undefined,
              email: emailAb || undefined,
              titulo: produtoAb || undefined,
              origem: 'Abandono carrinho',
              notas: notasAb || undefined,
            },
            false // requireTarefa = false (lead automático de captação)
          );
          console.log(`[Hotmart/Abandono] Lead #${lead.id} criado: "${lead.nome}" (${telefoneAb || emailAb}) — proprietária #${HOTMART_ABANDONO_RESPONSAVEL_ID}`);
          return res.status(201).json({ success: true, lead_id: lead.id, tipo: 'carrinho_abandonado' });
        } catch (err: any) {
          if (/Já existe um lead/i.test(err?.message || '')) {
            console.log(`[Hotmart/Abandono] Duplicata ignorada: ${err.message}`);
            return res.json({ success: true, duplicate: true, message: err.message });
          }
          throw err;
        }
      }

      // Só compra aprovada gera lead. Outros eventos: responde 200 para a Hotmart não reenviar.
      if (event && event !== 'PURCHASE_APPROVED') {
        return res.json({ success: true, processed: false, reason: `evento_ignorado:${event}` });
      }

      const data = body.data || {};
      const buyer = data.buyer || {};
      const purchase = data.purchase || {};

      // Roteamento por PRODUTO (não por hottok): cada oferta entra num estágio distinto
      // do funil "Boas vindas". Produto desconhecido cai no estágio da Escola (padrão).
      const produtoId = Number(data.product?.id) || 0;
      let estagioEntradaId: number;
      let conexao: string;
      if (produtoId === HOTMART_PRODUTO_LEADERSHIP_ID) {
        estagioEntradaId = HOTMART_ESTAGIO_LEADERSHIP_ID;
        conexao = 'Leadership';
      } else {
        estagioEntradaId = HOTMART_ESTAGIO_ESCOLA_ID;
        conexao = 'ESCOLA';
      }
      const estagioResolvido = await resolverEstagioEntrada(HOTMART_FUNIL_ID, estagioEntradaId);
      if (!estagioResolvido) {
        return res.status(500).json({ error: 'Funil de destino sem estágios' });
      }

      // Proteção contra parcelado/recorrência: cobranças seguintes de assinatura/parcelamento
      // inteligente trazem recurrence_number > 1 → não recriam lead (evita boas-vindas repetida).
      const recorrencia = Number(purchase.recurrence_number);
      if (recorrencia && recorrencia > 1) {
        console.log(`[Hotmart] Recorrência #${recorrencia} ignorada (transação ${purchase.transaction || '?'})`);
        return res.json({ success: true, processed: false, reason: 'recorrencia' });
      }

      const nome = String(buyer.name || [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || '').trim();
      const email = String(buyer.email || '').trim();
      // Telefone: checkout_phone_code + checkout_phone, com fallback para phone (string).
      // A normalização BR final é feita pelo leadsService.create.
      const telefone = montarTelefoneHotmart(
        buyer.checkout_phone_code,
        buyer.checkout_phone || (typeof buyer.phone === 'string' ? buyer.phone : '')
      );
      const cpfCnpj = String(buyer.document || '').trim();

      const produto = String(data.product?.name || '').trim();
      const valor = Number(purchase.price?.value) || 0;
      const origem = 'Hotmart';

      // Bloco de notas com todos os dados aproveitáveis da compra (só os campos presentes).
      const addr = buyer.address || {};
      const pay = purchase.payment || {};
      const fmtData = (v: any) => {
        const n = Number(v);
        return n ? new Date(n).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
      };
      const notas = [
        produto && `Produto: ${produto}${data.product?.id ? ` (#${data.product.id})` : ''}`,
        valor && `Valor: ${purchase.price?.currency_value || 'R$'} ${valor.toFixed(2)}`,
        pay.type && `Pagamento: ${pay.type}${pay.installments_number ? ` em ${pay.installments_number}x` : ''}`,
        purchase.transaction && `Transação: ${purchase.transaction}`,
        purchase.offer?.code && `Oferta: ${purchase.offer.code}`,
        cpfCnpj && `Documento: ${cpfCnpj}${buyer.document_type ? ` (${buyer.document_type})` : ''}`,
        (addr.city || addr.state) && `Local: ${[addr.city, addr.state].filter(Boolean).join('/')}`,
        addr.zipcode && `CEP: ${addr.zipcode}`,
        fmtData(purchase.approved_date || purchase.order_date) && `Compra: ${fmtData(purchase.approved_date || purchase.order_date)}`,
      ].filter(Boolean).join('\n') || undefined;

      if (!nome && !telefone && !email) {
        console.warn('[Hotmart] Payload sem comprador reconhecido:', JSON.stringify(body).slice(0, 500));
        return res.status(400).json({ error: 'Nenhum dado de comprador (nome/telefone/email)' });
      }

      try {
        const lead = await leadsService.create(
          HOTMART_EMPRESA_ID,
          HOTMART_RESPONSAVEL_ID,
          {
            funil_id: HOTMART_FUNIL_ID,
            estagio_id: estagioResolvido,      // estágio de entrada conforme a conexão (ESCOLA/Leadership)
            responsavel_id: HOTMART_RESPONSAVEL_ID,
            nome: nome || telefone || email,
            telefone: telefone || undefined,
            email: email || undefined,
            titulo: produto || undefined,
            cpf_cnpj: cpfCnpj || undefined,
            valor_potencial: valor || undefined,
            origem,
            notas,
          },
          false // requireTarefa = false (lead automático de captação)
        );
        console.log(`[Hotmart/${conexao}] Lead #${lead.id} criado: "${lead.nome}" (${telefone || email}) — ${produto || origem}`);
        return res.status(201).json({ success: true, lead_id: lead.id });
      } catch (err: any) {
        // Duplicata no funil: comprador já é lead (ex.: reenvio do evento) → 200 sem recriar.
        if (/Já existe um lead/i.test(err?.message || '')) {
          console.log(`[Hotmart] Duplicata ignorada: ${err.message}`);
          return res.json({ success: true, duplicate: true, message: err.message });
        }
        throw err;
      }
    } catch (error) {
      console.error('[Hotmart] Erro no webhook de compra:', error);
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
  },

  // Telemetria de conexão: a instância Baileys empurra aqui cada desconexão
  // (logout/ban/rede...). Registra no log append-only whatsapp_conexao_eventos,
  // mapeando a porta → usuário/empresa. Autenticado pelo mesmo X-Webhook-Secret.
  async registrarConexao(req: Request, res: Response, next: NextFunction) {
    try {
      const secret = req.headers['x-webhook-secret'];
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Webhook secret invalido' });
      }

      const { port, categoria, motivo, code, registrado } = req.body || {};
      const porta = Number(port);
      if (!porta) {
        return res.status(400).json({ error: 'Campo "port" obrigatorio' });
      }

      // Mapeia a porta → usuário/empresa (pode não existir se a porta foi liberada)
      const dono = await query(
        `SELECT id, empresa_id FROM usuarios WHERE whatsapp_porta = $1 LIMIT 1`,
        [porta]
      );
      const usuarioId = dono.rows[0]?.id ?? null;
      const empresaId = dono.rows[0]?.empresa_id ?? null;

      await query(
        `INSERT INTO whatsapp_conexao_eventos
           (porta, usuario_id, empresa_id, categoria, motivo, status_code, registrado)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [porta, usuarioId, empresaId, categoria || null, motivo || null,
         Number.isFinite(Number(code)) ? Number(code) : null,
         typeof registrado === 'boolean' ? registrado : null]
      );

      // Marca o usuário como desconectado (o /status confirmará quando reconectar)
      if (usuarioId) {
        await query(`UPDATE usuarios SET whatsapp_conectado = FALSE WHERE id = $1`, [usuarioId]);
      }

      if (categoria === 'ban') {
        console.warn(`[Webhook Conexão] ⛔ BAN detectado na porta ${porta} (usuário ${usuarioId ?? '?'}): ${motivo}`);
      }

      return res.json({ success: true, usuarioId, empresaId });
    } catch (error) {
      console.error('[Webhook Conexão] Erro:', error);
      next(error);
    }
  }
};
