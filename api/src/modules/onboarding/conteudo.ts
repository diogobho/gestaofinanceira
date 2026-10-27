/**
 * O conteúdo de boas-vindas, por plano.
 *
 * A pessoa que recebe isto JÁ criou a conta e já está usando — o texto começa em
 * "sua conta está pronta, faça isto primeiro", nunca em "crie sua conta".
 *
 * As trilhas são cumulativas (Profissional = Starter + WhatsApp/CRM; Enterprise =
 * Profissional + IA), e nenhum passo pode prometer o que o plano não vende: o
 * Starter não tem CRM, e mandar um cliente dele "montar o funil" é mandá-lo para
 * uma tela que ele não contratou.
 *
 * > Desde a migration 081 o plano RESTRINGE de verdade (`shared/capacidades.ts`),
 * > e isto aqui deixou de ser só conteúdo: passo que ensina o que o plano recusa
 * > vira um 403 na cara de quem acabou de assinar. Foi o que aconteceu com
 * > "Dispare para muita gente" no Profissional, corrigido em 20/09/2026.
 *
 * > **O canal de WhatsApp é o que separa Profissional de Enterprise**: um conecta
 * > o próprio número por QR Code e conversa com quem já respondeu; o outro conecta
 * > o número oficial da Meta e pode iniciar conversa. Por isso o passo da conexão
 * > NÃO é herdado — cada plano tem o seu, e ensinar QR Code ao Enterprise manda o
 * > cliente procurar um código que a tela dele nem mostra mais (migration 084).
 *
 * Os nomes de tela são os REAIS do menu: Dashboard · CRM / Funil · CRM Dashboard ·
 * CRM CX · Clientes · Receitas · Despesas · Parcelas · Sessões · WhatsApp ·
 * Agente IA · Config. E-mail · Suporte · Minha Conta · Perfil. Ao mexer no menu,
 * atualize também esta lista — texto que manda procurar tela inexistente é pior
 * do que texto nenhum.
 *
 * Isto é o PADRÃO: o que vale em produção é a linha de `onboarding_modelos`,
 * editável pela equipe em /gestao/onboarding sem deploy. A primeira leitura
 * semeia a tabela com o que está aqui.
 */

export type PlanoSlug = 'starter' | 'profissional' | 'enterprise';

export interface Passo {
  titulo: string;
  /** Uma ou duas frases. HTML simples (só <strong> e <a>) — é corpo de e-mail. */
  texto: string;
}

/** Como o e-mail e o WhatsApp se referem ao plano, e qual PDF vai junto. */
export const PLANOS: Record<PlanoSlug, { nome: string; pdf: string; resumo: string }> = {
  starter: {
    nome: 'Starter',
    pdf: 'primeiros-passos-starter.pdf',
    resumo: 'organizar o financeiro do seu negócio',
  },
  profissional: {
    nome: 'Profissional',
    pdf: 'primeiros-passos-profissional.pdf',
    resumo: 'unir o financeiro, o WhatsApp e o funil de vendas num lugar só',
  },
  enterprise: {
    nome: 'Enterprise',
    pdf: 'primeiros-passos-enterprise.pdf',
    resumo: 'colocar o atendimento e o acompanhamento de clientes no automático',
  },
};

/**
 * Dos três planos, o slug. Vai pelo NOME (é o que a tabela `planos` tem de
 * estável entre ambientes) e cai no id só como desempate; qualquer coisa
 * desconhecida vira Starter, a trilha que não promete o que não existe.
 */
export function planoSlug(nome?: string | null, id?: number | null): PlanoSlug {
  const n = String(nome || '').toLowerCase();
  if (n.includes('enterprise')) return 'enterprise';
  if (n.includes('profissional') || n.includes('professional')) return 'profissional';
  if (n.includes('starter')) return 'starter';
  if (id === 3) return 'enterprise';
  if (id === 2) return 'profissional';
  return 'starter';
}

const PASSOS_STARTER: Passo[] = [
  {
    titulo: 'Cadastre os seus clientes',
    texto:
      'Em <strong>Clientes</strong>, clique em <strong>Novo Cliente</strong>. ' +
      'É a lista que o resto do sistema usa para saber de quem é cada cobrança.',
  },
  {
    titulo: 'Lance a primeira receita',
    texto:
      'Em <strong>Receitas</strong>, registre uma venda ou um serviço. ' +
      'Pode ser à vista ou parcelada — o sistema cria as parcelas para você.',
  },
  {
    titulo: 'Lance as suas despesas',
    texto:
      'Em <strong>Despesas</strong>, coloque o que sai todo mês (aluguel, fornecedor, imposto). ' +
      'Use as categorias: é o que responde depois "com o que eu gastei".',
  },
  {
    titulo: 'Acompanhe e dê baixa em Parcelas',
    texto:
      'Em <strong>Parcelas</strong> você vê o que está a receber, o que vence hoje e o que atrasou. ' +
      'Ao receber, marque como paga — é assim que o Dashboard fica confiável.',
  },
  {
    titulo: 'Leia o Dashboard e exporte o PDF',
    texto:
      'O <strong>Dashboard</strong> mostra entradas, saídas, quem pagou e com o que você gastou. ' +
      'O botão <strong>Exportar PDF</strong> gera o relatório do período com a sua identidade.',
  },
  {
    titulo: 'Deixe a sua cara nos e-mails',
    texto:
      'Em <strong>Perfil</strong>, monte a sua assinatura de e-mail — nome, contato e logo. ' +
      'Ela entra nos e-mails que você envia e no cabeçalho dos relatórios em PDF.',
  },
  {
    titulo: 'Pergunte ao Duo',
    texto:
      'O balãozinho no canto da tela responde sobre os seus próprios números: ' +
      '"quanto entrou este mês?", "quem está devendo?". É mais rápido do que procurar no menu.',
  },
  {
    titulo: 'Instale no celular',
    texto:
      'No Android, abra o sistema no Chrome e use os três pontinhos › <strong>Instalar aplicativo</strong>. ' +
      'No iPhone, abra no Safari e use Compartilhar › <strong>Adicionar à Tela de Início</strong>.',
  },
];

/**
 * A conexão do WhatsApp, um passo por plano — é aqui que os dois produtos se
 * separam, e é o único passo que NÃO é herdado de um plano para o outro.
 */
const PASSO_CANAL_QR: Passo = {
  titulo: 'Conecte o WhatsApp da empresa',
  texto:
    'Em <strong>WhatsApp</strong>, aponte a câmera do celular para o QR Code, como no WhatsApp Web. ' +
    'Comece devagar nos primeiros dias: muita conversa nova de uma vez é o que faz o WhatsApp bloquear um número.',
};

const PASSO_CANAL_OFICIAL: Passo = {
  titulo: 'Conecte o seu número oficial da Meta',
  texto:
    'Em <strong>WhatsApp</strong>, clique em <strong>Conectar meu número oficial</strong> e siga a janela da Meta: ' +
    'ela pede o cadastro da sua empresa, a verificação do número e uma forma de pagamento na conta dela. ' +
    'Sem QR Code e sem celular ligado. Se a tela pedir para falar com a gente, é só clicar — a conexão é feita junto com você.',
};

/** Vem logo depois de conectar: é o que muda o dia a dia de quem veio do QR Code. */
const PASSO_REGRAS_OFICIAL: Passo = {
  titulo: 'Entenda as duas regras do número oficial',
  texto:
    'Texto livre só sai até <strong>24h depois da última mensagem do cliente</strong>; fora dessa janela vai um ' +
    '<strong>modelo aprovado</strong> pela Meta, e o sistema avisa qual é o caso em cada conversa. ' +
    'As mensagens que você inicia são cobradas pela Meta, direto na conta da sua empresa.',
};

const PASSOS_PROFISSIONAL: Passo[] = [
  {
    titulo: 'Ligue o seu e-mail',
    texto:
      'Em <strong>Config. E-mail</strong>, cadastre o SMTP da sua empresa para os disparos saírem do seu domínio. ' +
      'O passo a passo com telas está no guia em anexo.',
  },
  {
    titulo: 'Monte o seu funil',
    texto:
      'Em <strong>CRM / Funil</strong>, ajuste as colunas (estágios) ao jeito que você vende. ' +
      'Cada cartão é um cliente em potencial; arrastar entre colunas é o que mostra onde cada negócio está.',
  },
  {
    titulo: 'Traga os seus contatos',
    texto:
      'Crie leads em <strong>+ Novo Lead</strong> ou use <strong>Importar</strong> para subir a sua planilha de uma vez.',
  },
  {
    titulo: 'Converse pelo cartão do lead',
    texto:
      'Abra o cartão e use a aba de WhatsApp: a conversa fica guardada ali, junto das anotações e das tarefas. ' +
      'Ninguém precisa procurar no celular o que foi combinado.',
  },
];

/**
 * O envio em massa também é por plano, pelo mesmo motivo do canal: `disparo_whatsapp`
 * é capacidade do Enterprise (migration 081). O Profissional recebe a versão de
 * e-mail — com o porquê, que é o que transforma uma negativa em caminho de upgrade.
 */
const PASSO_DISPARO_EMAIL: Passo = {
  titulo: 'Dispare e-mail para muita gente de uma vez',
  texto:
    'O botão <strong>E-mail</strong> manda a mesma mensagem para os leads que você escolher, com intervalo entre os envios. ' +
    'No WhatsApp, o seu plano conversa com quem já respondeu: iniciar conversa em massa por um número comum é o que faz a Meta bloqueá-lo, ' +
    'e por isso esse envio é do Enterprise, pelo número oficial.',
};

const PASSO_DISPARO_TUDO: Passo = {
  titulo: 'Dispare para muita gente de uma vez',
  texto:
    'Os botões <strong>Disparar</strong> e <strong>E-mail</strong> mandam a mesma mensagem para os leads que você escolher. ' +
    'No WhatsApp o disparo sai pelo número oficial, com modelo aprovado — é o canal que pode falar primeiro sem pôr o seu número em risco.',
};

const PASSO_RELATORIO_CANAIS: Passo = {
  titulo: 'Veja o que cada canal trouxe',
  texto:
    'O <strong>CRM Dashboard</strong> mostra quantos leads entraram, de onde vieram e quanto virou venda.',
};

const PASSOS_ENTERPRISE: Passo[] = [
  {
    titulo: 'Configure o seu agente de IA',
    texto:
      'Em <strong>Agente IA › Configurar Agente</strong>, cole a sua chave de API, escolha o modelo e ' +
      'escreva como ele deve falar. Só o dono da conta vê esta tela — e o dono é você.',
  },
  {
    titulo: 'Dê instruções por estágio',
    texto:
      'Cada coluna do funil pode ter a sua própria instrução: o agente fala de um jeito com quem acabou de chegar ' +
      'e de outro com quem já recebeu proposta.',
  },
  {
    titulo: 'Deixe o follow-up no automático',
    texto:
      'Na visão <strong>Fluxo</strong> do funil, monte a cadência: a mensagem sai sozinha em D+1, D+3, D+7… ' +
      'para ninguém esfriar esquecido.',
  },
  {
    titulo: 'Defina o horário de envio',
    texto:
      'Em <strong>Agendamentos › Horário de envio</strong>, diga em que horas e em que dias o sistema pode falar com o seu cliente. ' +
      'Nada sai de madrugada nem no domingo sem você mandar.',
  },
  {
    titulo: 'Dê um número para cada pessoa do time',
    texto:
      'Cada pessoa pode ter o seu próprio número — oficial ou por QR Code, um de cada vez. ' +
      'O cliente continua falando com quem ele já conhece, e você vê tudo de um lugar só.',
  },
  {
    titulo: 'Chame a sua equipe',
    texto:
      'Em <strong>Configurações</strong>, crie os acessos do time e escolha o que cada um enxerga.',
  },
];

/**
 * As trilhas. Cumulativas no financeiro e no CRM — e NÃO no canal de WhatsApp,
 * que é justamente o que separa os dois planos: cada um entra com o seu passo de
 * conexão, no mesmo lugar da ordem.
 */
export const TRILHAS: Record<PlanoSlug, Passo[]> = {
  starter: PASSOS_STARTER,
  profissional: [
    ...PASSOS_STARTER.slice(0, 5),
    PASSO_CANAL_QR,
    ...PASSOS_PROFISSIONAL,
    PASSO_DISPARO_EMAIL,
    PASSO_RELATORIO_CANAIS,
    ...PASSOS_STARTER.slice(5),
  ],
  enterprise: [
    ...PASSOS_STARTER.slice(0, 5),
    PASSO_CANAL_OFICIAL,
    PASSO_REGRAS_OFICIAL,
    ...PASSOS_PROFISSIONAL,
    PASSO_DISPARO_TUDO,
    PASSO_RELATORIO_CANAIS,
    ...PASSOS_ENTERPRISE,
    ...PASSOS_STARTER.slice(5),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Modelos padrão (semeiam `onboarding_modelos` na primeira leitura)
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = '#13264C';

function listaHtml(passos: Passo[]): string {
  return passos
    .map(
      (p, i) => `
        <tr>
          <td width="34" valign="top" style="padding:8px 0;">
            <div style="width:26px;height:26px;background-color:${NAVY};color:#ffffff;border-radius:13px;text-align:center;font-size:13px;font-weight:bold;line-height:26px;">${i + 1}</div>
          </td>
          <td valign="top" style="padding:8px 0;font-size:14.5px;">
            <strong style="color:${NAVY};">${p.titulo}</strong> &mdash; ${p.texto}
          </td>
        </tr>`
    )
    .join('');
}

/**
 * Primeira frase do e-mail. É a ÚNICA coisa que muda entre quem está no teste e
 * quem já assinou (decisão de 13/09/2026): o conteúdo do plano é o mesmo, porque
 * quem pagou por PIX ou boleto precisa aprender a usar exatamente as mesmas
 * telas — só não pode ouvir "aproveite os 7 dias" quando não está em teste.
 */
export const ABERTURA = {
  trial:
    'A conta da <strong>[Empresa]</strong> está no ar e os seus <strong>7 dias de teste</strong> ' +
    'já começaram — acesso completo, sem cartão e sem compromisso.',
  pagante:
    'A conta da <strong>[Empresa]</strong> está no ar. Assim que o seu pagamento compensar, ' +
    'está tudo liberado — e você já pode ir adiantando a configuração abaixo.',
};

export function corpoPadrao(slug: PlanoSlug): string {
  const plano = PLANOS[slug];
  return `
      <p style="margin:0 0 16px;">Olá, [PrimeiroNome]!</p>

      <p style="margin:0 0 16px;">[Abertura]</p>

      <p style="margin:0 0 16px;">O plano <strong>${plano.nome}</strong> foi feito para ${plano.resumo}.
      Abaixo está a ordem que funciona melhor — não precisa fazer tudo hoje.</p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 22px;">
        ${listaHtml(TRILHAS[slug])}
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
        <tr>
          <td style="background-color:${NAVY};border-radius:8px;">
            <a href="https://duofuturo.tech/gestao/" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Entrar no sistema</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:12px;color:#999999;">Se o botão não abrir, copie este endereço no seu navegador:<br />
        <span style="color:#666666;">https://duofuturo.tech/gestao/</span></p>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#F3EBD9;border:1px solid #E7D9B8;border-radius:10px;margin:0 0 24px;">
        <tr>
          <td style="padding:20px 22px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:${NAVY};">O guia do plano ${plano.nome}</p>
            <p style="margin:0 0 14px;font-size:14px;color:#6d6045;">Vai em anexo, com as telas e as explicações em português claro.
            Ele cobre só o que o seu plano tem — nada de configurar o que você não contratou.</p>
            <p style="margin:0;font-size:14px;">
              <a href="https://duofuturo.tech/onboarding/${plano.pdf}" style="color:${NAVY};font-weight:bold;">Baixar o guia em PDF</a>
              &nbsp;&nbsp;&middot;&nbsp;&nbsp;
              <a href="https://duofuturo.tech/onboarding/guia?plano=${slug}" style="color:${NAVY};">ler direto no navegador</a>
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 6px;font-size:15px;"><strong style="color:${NAVY};">Travou em algum passo?</strong></p>
      <p style="margin:0 0 22px;font-size:14.5px;">Responda este e-mail ou abra um chamado em <strong>Suporte</strong>, dentro do sistema.
      Quem responde é gente, não robô.</p>

      <p style="margin:0 0 4px;">Boas vendas!</p>
      <p style="margin:0 0 24px;color:#666666;">Equipe DuoFuturo</p>`;
}

export function assuntoPadrao(slug: PlanoSlug): string {
  const nome = PLANOS[slug].nome;
  return `[PrimeiroNome], sua conta ${nome} está pronta — comece por aqui`;
}

/**
 * Resposta do número oficial a quem pediu o material pelo WhatsApp. Vai junto
 * com o PDF do plano, dentro da janela de 24h que a mensagem da pessoa abriu.
 */
export function whatsappPadrao(slug: PlanoSlug): string {
  const plano = PLANOS[slug];
  const primeiros = TRILHAS[slug]
    .slice(0, 4)
    .map((p, i) => `${i + 1}. ${p.titulo}`)
    .join('\n');

  return [
    'Oi, [PrimeiroNome]! Aqui é o Duo, da DuoFuturo. 👋',
    '',
    `Segue o material de boas-vindas do plano *${plano.nome}* — o mesmo que chegou no seu e-mail.`,
    '',
    'Por onde começar:',
    primeiros,
    '',
    'Seu acesso: https://duofuturo.tech/gestao/',
    '',
    'Qualquer dúvida, é só responder aqui.',
  ].join('\n');
}
