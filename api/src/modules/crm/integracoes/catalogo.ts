/**
 * Catálogo das integrações que criam lead no CRM.
 *
 * Uma integração é reconhecida por DUAS coisas, e as duas são necessárias:
 *
 *  - `origens` — o que ela grava em `leads.origem`. É o PRIMEIRO toque: quem trouxe
 *    o lead para o CRM.
 *  - `marcador` — o bloco que ela escreve em `leads.notas`. É UM toque, e pode cair
 *    num card que já existia.
 *
 * Os webhooks de captação anexam em vez de duplicar quando o telefone já está no funil
 * (a regra de "duplicata anexa" descrita no CLAUDE.md). Na prática isso significa que um
 * lead com origem `Desafio 52 semanas` pode carregar o formulário do Caixa Rápido nas
 * notas, e um lead importado pode carregar os dois. Olhar só para `origem` esconderia
 * justamente os toques que trazem o dado qualificado — que é o que este dashboard existe
 * para mostrar.
 *
 * Ao criar um webhook novo, entre aqui também: sem uma linha neste catálogo o lead até
 * é criado, mas nasce invisível para o dashboard de integrações.
 */

export type CanalIntegracao = 'webhook' | 'banco' | 'interno';

export interface DefinicaoIntegracao {
  id: string;
  nome: string;
  descricao: string;
  /** Por onde o lead entra. É o que se confere quando alguém diz "parou de chegar". */
  entrada: string;
  canal: CanalIntegracao;
  /** Valores de `leads.origem` gravados por esta integração. */
  origens: string[];
  /**
   * Prefixo de `leads.origem` quando a integração carimba um sufixo variável.
   *
   * Hoje só o Caixa Rápido, que anexa o `utm_source` da landing ("Caixa Rápido -
   * semana2") para separar as semanas da campanha. Sem o prefixo, o lead novo
   * deixaria de ser reconhecido pela origem e a atribuição de "quem trouxe"
   * cairia silenciosamente no primeiro bloco das notas — os 88 leads anteriores
   * ao utm continuam casando pelo valor exato em `origens`.
   */
  origemPrefixo?: string;
  /** Reconhece um bloco de notas desta integração pela PRIMEIRA linha dele. */
  marcador?: RegExp;
  /** Quando a primeira linha não basta para decidir, olha o corpo do bloco. */
  marcadorCorpo?: RegExp;
}

/**
 * A ORDEM importa: a detecção para no primeiro que casar. Os marcadores mais
 * específicos vêm antes dos que só olham um rótulo genérico como "Produto:".
 */
export const CATALOGO: DefinicaoIntegracao[] = [
  {
    id: 'caixa_rapido',
    nome: 'Caixa Rápido',
    descricao:
      'Formulário da campanha Caixa Rápido no WordPress/Elementor. Traz e-mail, negócio e as três respostas de qualificação.',
    entrada: 'POST /crm/webhook/form-caixa-rapido',
    canal: 'webhook',
    origens: ['Caixa Rápido'],
    origemPrefixo: 'Caixa Rápido - ',
    marcador: /^Formul[áa]rio Caixa R[áa]pido/i,
  },
  {
    id: 'sendflow',
    nome: 'SendFlow — grupos de WhatsApp',
    descricao:
      'Entrada de pessoas nos grupos de WhatsApp da campanha. No SendFlow a campanha É um grupo, e o evento que interessa é a adição de membro.',
    entrada: 'POST /crm/webhook/sendflow',
    canal: 'webhook',
    origens: ['Desafio 52 semanas'],
    marcador: /\(SendFlow\)\s*$/i,
  },
  {
    id: 'hotmart_abandono',
    nome: 'Hotmart — carrinho abandonado',
    descricao: 'Quem iniciou o checkout na Hotmart e não finalizou a compra.',
    entrada: 'POST /crm/webhook/hotmart (PURCHASE_OUT_OF_SHOPPING_CART)',
    canal: 'webhook',
    origens: ['Abandono carrinho'],
    marcador: /^Carrinho abandonado/i,
  },
  {
    id: 'hotmart',
    nome: 'Hotmart — compra aprovada',
    descricao: 'Compra aprovada na Hotmart, roteada pelo id do produto. Traz produto, valor, pagamento e localidade.',
    entrada: 'POST /crm/webhook/hotmart (PURCHASE_APPROVED)',
    canal: 'webhook',
    origens: ['Hotmart'],
    marcadorCorpo: /^Transa[çc][ãa]o:/im,
  },
  {
    id: 'diagnostico',
    nome: 'Diagnóstico IA',
    descricao:
      'App de Diagnóstico. O lead entra ao começar o questionário e ganha score, perfil e plano recomendado ao concluir.',
    entrada: 'App /diagnostico (POST /crm/leads com service token)',
    canal: 'banco',
    origens: ['diagnostico'],
    marcadorCorpo: /^(Score geral:|Perfil de maturidade:|Faturamento atual:.*Meta de faturamento:)/im,
  },
  {
    id: 'embaixadores',
    nome: 'Embaixadores / Sucessores',
    descricao:
      'Indicações premiadas do app Sucessores da Prosperidade. Grava direto no banco do CRM, sem passar por webhook.',
    entrada: 'App /sucessores (INSERT direto em leads)',
    canal: 'banco',
    origens: ['Campanha Agosto', 'Embaixadores 5 Milhões'],
    marcador: /^(Destino:|Indicado por:)/i,
  },
  {
    id: 'leadership_form',
    nome: 'Leadership — formulário do site',
    descricao: 'Formulário do site do Leadership Club.',
    entrada: 'POST /crm/webhook/form-leadership',
    canal: 'webhook',
    origens: ['Leadership (form site)'],
    marcadorCorpo: /^Faturamento 2:/im,
  },
  {
    id: 'escola_form',
    nome: 'Escola — formulário do site',
    descricao:
      'Formulário do site da Escola de Empreendedorismo. Só nome e telefone — a rota está no ar e configurada, mas nenhum lead chegou por ela até agora.',
    entrada: 'POST /crm/webhook/form-escola',
    canal: 'webhook',
    origens: ['Escola Empreendedorismo (form site)'],
  },
  {
    id: 'cadastro_app',
    nome: 'Cadastro no app',
    descricao:
      'Conta criada em /gestao/register. Vira lead no CRM da DuoFuturo com plano, forma de começar e o id da conta.',
    entrada: 'auth.registrar → onboarding/lead-cadastro.ts',
    canal: 'interno',
    origens: ['Cadastro no app'],
    marcador: /^Cadastro no app/i,
  },
  {
    id: 'whatsapp_auto',
    nome: 'WhatsApp — lead automático',
    descricao:
      'Mensagem recebida num estágio com "criar lead automático" ligado, ou o botão de criar lead a partir do contato.',
    entrada: 'POST /crm/webhook/whatsapp',
    canal: 'interno',
    origens: ['whatsapp'],
  },
  {
    id: 'whatsapp_grupo',
    nome: 'WhatsApp — importação de grupo',
    descricao: 'Participantes de um grupo importados em lote pela aba Grupos, dentro de Contatos.',
    entrada: 'CRM → Contatos → Grupos',
    canal: 'interno',
    origens: [],
  },
];

export const POR_ID = new Map(CATALOGO.map((d) => [d.id, d]));

/** Todas as origens conhecidas — é o `IN (...)` da consulta. */
export const ORIGENS_CONHECIDAS = CATALOGO.flatMap((d) => d.origens);

/** Origens com sufixo variável, já no formato do `LIKE` do Postgres. */
export const ORIGENS_PREFIXOS = CATALOGO.flatMap((d) =>
  d.origemPrefixo ? [`${d.origemPrefixo}%`] : []
);

/**
 * Regex única que casa qualquer bloco de notas reconhecido, para o `~` do Postgres.
 * Serve só para PRÉ-FILTRAR: quem decide de qual integração é o bloco é o parser.
 * Um lead que só tem o bloco nas notas (duplicata anexada num card importado) não
 * apareceria sem isto.
 */
export const REGEX_NOTAS_SQL = [
  'Formul[áa]rio Caixa R[áa]pido',
  '\\(SendFlow\\)',
  'Carrinho abandonado',
  'Transa[çc][ãa]o:',
  'Score geral:',
  'Perfil de maturidade:',
  'Meta de faturamento:',
  'Indicado por:',
  'Faturamento 2:',
  'Cadastro no app',
].join('|');

/**
 * A integração de um lead a partir da origem.
 *
 * O caso do WhatsApp é o único que a origem sozinha não resolve: importação de grupo e
 * lead automático gravam as duas `origem = 'whatsapp'`, e só o nome separa — a
 * importação nomeia o card como "Participante <número>". São operações diferentes (uma
 * é lote manual, a outra é gatilho de mensagem) e misturá-las inflaria o WhatsApp
 * automático em mais de 100%.
 */
export function integracaoDaOrigem(origem: string | null, nome: string | null): string | null {
  if (!origem) return null;
  if (origem === 'whatsapp') {
    return /^Participante\s/i.test(String(nome || '')) ? 'whatsapp_grupo' : 'whatsapp_auto';
  }
  const def =
    CATALOGO.find((d) => d.origens.includes(origem)) ??
    CATALOGO.find((d) => d.origemPrefixo && origem.startsWith(d.origemPrefixo));
  return def ? def.id : null;
}
