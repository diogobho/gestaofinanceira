import type { Tour } from './types'

/**
 * Tour de boas-vindas — visão geral do sistema (Fase 1).
 * Cada passo carrega `permissao`/`papeis` para que o TourContext remova
 * automaticamente o que o usuário não pode ver (mesma lógica da Sidebar).
 *
 * Tours específicos por tela serão adicionados a este array nas próximas fases.
 */
export const welcomeTour: Tour = {
  id: 'welcome',
  nome: 'Tour de boas-vindas',
  autoIniciar: true,
  passos: [
    {
      titulo: '👋 Bem-vindo ao DuoFuturo CRM!',
      descricao:
        'Vamos fazer um tour rápido pelas principais áreas do sistema. ' +
        'Você pode pular a qualquer momento e rever este tutorial depois.',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="sidebar-perfil"]',
      titulo: 'Seu perfil',
      descricao:
        'Aqui aparecem seu nome e nível de acesso. Clique para editar foto, dados e senha.',
      lado: 'right',
      alinhamento: 'start',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-dashboard"]',
      titulo: 'Dashboard',
      descricao:
        'Visão geral do negócio: receitas, despesas, parcelas e gráficos de evolução do período.',
      lado: 'right',
      permissao: 'dashboard',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-crm"]',
      titulo: 'CRM / Funil de vendas',
      descricao:
        'Gerencie seus leads num quadro Kanban: cadastre, importe, mova por estágios e dispare ' +
        'mensagens em massa por WhatsApp ou e-mail. Na visão <b>Fluxo</b> você monta as cadências ' +
        'de follow-up automático de cada estágio. O <b>CRM CX</b> cuida do pós-venda.',
      lado: 'right',
      permissao: 'crm',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-clientes"]',
      titulo: 'Clientes',
      descricao: 'Cadastro completo dos seus clientes, com envio de e-mail individual ou em massa.',
      lado: 'right',
      permissao: 'clientes',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-receitas"]',
      titulo: 'Financeiro',
      descricao:
        'Em <b>Receitas</b>, <b>Despesas</b> e <b>Parcelas</b> você lança e acompanha as movimentações. ' +
        'As Despesas podem ser importadas automaticamente via Open Finance.',
      lado: 'right',
      permissao: 'receitas',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-whatsapp"]',
      titulo: 'WhatsApp & Automações',
      descricao:
        'Conecte seu WhatsApp e configure <b>Automações</b> para enviar mensagens automáticas ' +
        'aos leads e clientes.',
      lado: 'right',
      permissao: 'whatsapp',
      requerSidebar: true,
    },
    {
      element: '[data-tour="nav-agente"]',
      titulo: 'Agente IA',
      descricao:
        'Sua assistente de inteligência artificial para atender e qualificar leads automaticamente.',
      lado: 'right',
      permissao: 'agente',
      requerSidebar: true,
    },
    {
      element: '[data-tour="widget-ia"]',
      titulo: 'Sexta-feira — sua consultora IA',
      descricao:
        'Este botão flutuante abre a <b>Sexta-feira</b>, que responde dúvidas sobre seus números ' +
        'e ajuda a tomar decisões. Ela está disponível em qualquer tela.',
      lado: 'left',
      alinhamento: 'end',
    },
    {
      element: '[data-tour="sidebar-tutorial"]',
      titulo: 'Reveja quando quiser',
      descricao:
        'Sempre que precisar, clique aqui para repetir este tutorial. Pronto, você já pode começar! 🚀',
      lado: 'right',
      requerSidebar: true,
    },
  ],
}

/** Tour da tela de CRM / Funil de vendas — com passos interativos (modais). */
export const crmTour: Tour = {
  id: 'crm',
  nome: 'Tutorial: CRM / Funil',
  iniciarNaRota: '/crm',
  passos: [
    {
      titulo: '📊 Seu funil de vendas',
      descricao:
        'Cada coluna é um <b>estágio</b> e cada cartão é um <b>lead</b>. Vou te mostrar tudo que ' +
        'dá para fazer por aqui — incluindo abrir as ferramentas de verdade, sem enviar nada.',
      rota: '/crm',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="crm-busca"]',
      titulo: 'Buscar leads',
      descricao: 'Encontre rapidamente um lead pelo nome, telefone ou e-mail.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="crm-filtros"]',
      titulo: 'Filtrar',
      descricao:
        'Filtre por responsável, estágio, temperatura, origem e tarefas. Os filtros também definem ' +
        'quem entra nos <b>disparos em massa</b>.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="crm-visoes"]',
      titulo: 'Três formas de ver o funil',
      descricao:
        '<b>Kanban</b> (colunas para arrastar), <b>Lista</b> (tabela) e <b>Fluxo</b> — onde você ' +
        'monta a operação de atendimento: cadência de follow-ups de cada estágio (+1d, +3d…), ' +
        'mensagens fixas ou do Agente IA e as automações de movimento.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="crm-novo-lead"]',
      titulo: 'Criar um lead',
      descricao:
        'Cadastre um lead manualmente. O mesmo lead pode existir em funis diferentes, mas não ' +
        'duplicado no mesmo funil.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="crm-kanban"]',
      titulo: 'Mover entre estágios',
      descricao:
        'Arraste os cartões entre as colunas para avançar o lead. Clique num cartão para ver ' +
        'detalhes, conversa do WhatsApp, anotações e tarefas. No topo de cada coluna: ' +
        '🤖 = Agente IA reativo ativo · 🔔 = cadência de follow-up ativa.',
      rota: '/crm',
      lado: 'top',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="crm-config"]',
      titulo: 'Configurar estágios',
      descricao:
        'Crie, renomeie e reordene os estágios. Nos 3 pontinhos de cada coluna você configura ' +
        'cadência, Agente IA, automações e lembretes de reunião.',
      rota: '/crm',
      lado: 'left',
    },
    {
      element: '[data-tour="crm-importar"]',
      titulo: 'Importar em lote',
      descricao: 'Suba uma planilha (CSV/Excel) para cadastrar vários leads de uma vez.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="crm-email"]',
      titulo: 'Disparo por e-mail',
      descricao: 'Envie e-mails em massa para os leads filtrados (requer Config. de E-mail ativa).',
      rota: '/crm',
      lado: 'bottom',
    },

    // ── Contatos WhatsApp — interativo ──
    {
      element: '[data-tour="crm-contatos"]',
      titulo: '👉 Clique em "Contatos"',
      descricao:
        'Aqui vivem as suas conversas do WhatsApp que ainda não viraram lead. ' +
        '<b>Clique no botão</b> para abrir e eu te mostro por dentro.',
      rota: '/crm',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="cw-abas"]',
      titulo: 'Contatos e Grupos',
      descricao:
        'Na aba <b>Contatos</b> ficam as conversas individuais; em <b>Grupos</b> você importa ' +
        'participantes de um grupo do WhatsApp direto para o funil.',
      rota: '/crm',
      lado: 'bottom',
      semVoltar: true,
    },
    {
      element: '[data-tour="cw-sync"]',
      titulo: 'Sincronizar',
      descricao:
        'Traz as conversas mais recentes do seu WhatsApp para esta lista. Use a busca ao lado ' +
        'para encontrar alguém específico.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cw-lista"]',
      titulo: 'Adicionar ao Funil',
      descricao:
        'Cada contato tem o botão <b>"Adicionar ao Funil"</b>: escolha estágio e responsável e a ' +
        'conversa vira um lead — sem digitar nada. Vamos fechar e conhecer o disparo em massa.',
      rota: '/crm',
      lado: 'top',
      alinhamento: 'center',
      cliqueAoSair: '[data-tour="cw-fechar"]',
    },

    // ── Disparo em massa — interativo (sem enviar nada) ──
    {
      element: '[data-tour="crm-disparar"]',
      titulo: '👉 Clique em "Disparar"',
      descricao:
        'O disparo em massa envia uma mensagem de WhatsApp para vários leads de uma vez. ' +
        'O número no botão mostra quantos entram com os filtros atuais. <b>Clique para abrir</b> — ' +
        'não se preocupe, não vamos enviar nada.',
      rota: '/crm',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="disp-modo"]',
      titulo: 'Quem vai receber',
      descricao:
        '<b>Todos do funil</b> usa os filtros (estágio, responsável, temperatura…). ' +
        '<b>Selecionar leads</b> deixa você marcar um por um — quem já estiver em outro disparo ' +
        'programado aparece com o selo <b>"programado"</b>, para não repetir.',
      rota: '/crm',
      lado: 'bottom',
      semVoltar: true,
    },
    {
      element: '[data-tour="disp-continuar"]',
      titulo: '👉 Clique em "Continuar"',
      descricao: 'Definidos os destinatários, vamos para a etapa da mensagem.',
      rota: '/crm',
      lado: 'top',
      alinhamento: 'end',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="disp-automacao"]',
      titulo: 'Mover após o envio',
      descricao:
        'Opcional: quem receber a mensagem é movido automaticamente para o estágio que você ' +
        'escolher (ex.: "Aguardando resposta").',
      rota: '/crm',
      lado: 'bottom',
      semVoltar: true,
    },
    {
      element: '[data-tour="disp-agendar"]',
      titulo: 'Agendar para depois',
      descricao:
        'Marque para programar o disparo (ex.: amanhã às 9h). Os disparos programados ficam na ' +
        'aba <b>Agendamentos</b>, onde dá para editar ou cancelar.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="disp-intervalo"]',
      titulo: 'Intervalo anti-bloqueio',
      descricao:
        'O sistema espera um tempo aleatório entre um envio e o próximo. Intervalos maiores ' +
        'protegem seu número do WhatsApp.',
      rota: '/crm',
      lado: 'top',
    },
    {
      element: '[data-tour="disp-preview"]',
      titulo: 'Revisar contatos',
      descricao:
        'Antes de enviar, revise exatamente quem vai receber — contatos já em outro disparo ' +
        'programado vêm destacados.',
      rota: '/crm',
      lado: 'top',
    },
    {
      element: '[data-tour="disp-variaveis"]',
      titulo: 'Personalize com variáveis',
      descricao:
        'Clique numa variável para inseri-la: <b>[PrimeiroNome]</b>, [Nome], [Empresa]… ' +
        'Mensagens personalizadas convertem mais e reduzem risco de bloqueio.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="disp-mensagem"]',
      titulo: 'Escreva a mensagem',
      descricao:
        'Digite o texto (com negrito/itálico do WhatsApp, se quiser). O preview abaixo mostra ' +
        'como o primeiro lead vai receber.',
      rota: '/crm',
      lado: 'top',
    },
    {
      element: '[data-tour="disp-enviar"]',
      titulo: 'O botão final — por hoje é só! 🎉',
      descricao:
        'Quando estiver tudo pronto de verdade, é este botão que dispara (ou agenda). ' +
        '<b>Agora NÃO vamos enviar</b> — ao concluir, eu fecho a janela para você. ' +
        'Fim do tour do CRM!',
      rota: '/crm',
      lado: 'top',
      alinhamento: 'end',
      cliqueAoSair: '[data-tour="disp-fechar"]',
    },
  ],
}

/** Tour do Dashboard financeiro. */
export const dashboardTour: Tour = {
  id: 'dashboard',
  nome: 'Tutorial: Dashboard',
  iniciarNaRota: '/dashboard',
  passos: [
    {
      titulo: '📊 Dashboard Financeiro',
      descricao: 'A saúde do negócio num relance: faturamento, despesas, lucro e evolução.',
      rota: '/dashboard',
      lado: 'over',
      alinhamento: 'center',
      permissao: 'dashboard',
    },
    {
      element: '[data-tour="dash-kpis"]',
      titulo: 'Números principais',
      descricao:
        'Faturamento, despesas e lucro do período — separando o que já foi <b>realizado</b> ' +
        'do que está <b>previsto</b> (a receber / a pagar).',
      rota: '/dashboard',
      lado: 'bottom',
      alinhamento: 'center',
      permissao: 'dashboard',
    },
    {
      element: '[data-tour="dash-periodo"]',
      titulo: 'Filtrar período',
      descricao:
        'Use os atalhos (Hoje, 7 dias, 30 dias, Este mês) ou escolha datas. Tudo abaixo do filtro ' +
        'recalcula pela <b>data de vencimento das parcelas</b>.',
      rota: '/dashboard',
      lado: 'bottom',
      permissao: 'dashboard',
    },
    {
      element: '[data-tour="dash-graficos"]',
      titulo: 'Gráficos de evolução',
      descricao: 'Receitas × despesas mês a mês e a distribuição por categoria.',
      rota: '/dashboard',
      lado: 'top',
      alinhamento: 'center',
      permissao: 'dashboard',
    },
  ],
}

/** Tour da tela de Clientes. */
export const clientesTour: Tour = {
  id: 'clientes',
  nome: 'Tutorial: Clientes',
  iniciarNaRota: '/clientes',
  passos: [
    {
      titulo: '👥 Gestão de Clientes',
      descricao: 'Aqui ficam todos os seus clientes cadastrados. Veja o que dá para fazer.',
      rota: '/clientes',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="clientes-novo"]',
      titulo: 'Cadastrar cliente',
      descricao: 'Adicione um novo cliente com nome, contato, documento e data de aniversário.',
      rota: '/clientes',
      lado: 'left',
    },
    {
      element: '[data-tour="clientes-lista"]',
      titulo: 'Sua base de clientes',
      descricao:
        'Na coluna <b>Ações</b> de cada cliente você pode enviar e-mail, editar os dados ou excluir.',
      rota: '/clientes',
      lado: 'top',
      alinhamento: 'center',
    },
  ],
}

/** Tour da tela de Receitas. */
export const receitasTour: Tour = {
  id: 'receitas',
  nome: 'Tutorial: Receitas',
  iniciarNaRota: '/receitas',
  passos: [
    {
      titulo: '💰 Gestão de Receitas',
      descricao: 'Lance e acompanhe tudo que entra no seu negócio.',
      rota: '/receitas',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="receitas-nova"]',
      titulo: 'Nova receita',
      descricao:
        'Registre uma receita à vista ou parcelada. Ao parcelar, o sistema cria as parcelas ' +
        'automaticamente.',
      rota: '/receitas',
      lado: 'left',
    },
    {
      element: '[data-tour="receitas-filtros"]',
      titulo: 'Filtrar receitas',
      descricao:
        'Filtre por período, cliente, produto/serviço, tipo de pagamento e faixa de valor. ' +
        'Cada lançamento na lista abaixo pode ser editado ou removido.',
      rota: '/receitas',
      lado: 'top',
    },
  ],
}

/** Tour da tela de Despesas. */
export const despesasTour: Tour = {
  id: 'despesas',
  nome: 'Tutorial: Despesas',
  iniciarNaRota: '/despesas',
  passos: [
    {
      titulo: '📉 Gestão de Despesas',
      descricao: 'Controle tudo que sai do caixa do negócio.',
      rota: '/despesas',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="despesas-nova"]',
      titulo: 'Nova despesa',
      descricao: 'Lance uma despesa à vista ou parcelada, com categoria e tipo de pagamento.',
      rota: '/despesas',
      lado: 'left',
    },
    {
      element: '[data-tour="despesas-banco"]',
      titulo: 'Conectar banco (Open Finance)',
      descricao:
        'Conecte sua conta para importar despesas automaticamente. Em "Bancos conectados" você ' +
        'gerencia as conexões.',
      rota: '/despesas',
      lado: 'bottom',
    },
    {
      element: '[data-tour="despesas-filtros"]',
      titulo: 'Filtrar despesas',
      descricao: 'Filtre por período, categoria e tipo de pagamento.',
      rota: '/despesas',
      lado: 'top',
    },
  ],
}

/** Tour da tela de Parcelas. */
export const parcelasTour: Tour = {
  id: 'parcelas',
  nome: 'Tutorial: Parcelas',
  iniciarNaRota: '/parcelas',
  passos: [
    {
      titulo: '🗓️ Gestão de Parcelas',
      descricao: 'Acompanhe as parcelas de receitas e despesas e faça cobranças.',
      rota: '/parcelas',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="parcelas-abas"]',
      titulo: 'Receitas × Despesas',
      descricao: 'Alterne entre as parcelas a receber (receitas) e a pagar (despesas).',
      rota: '/parcelas',
      lado: 'bottom',
      alinhamento: 'start',
    },
    {
      element: '[data-tour="parcelas-filtros"]',
      titulo: 'Filtrar',
      descricao: 'Filtre por status (pago, pendente, atrasado), cliente e período de vencimento.',
      rota: '/parcelas',
      lado: 'bottom',
    },
    {
      element: '[data-tour="parcelas-cobranca"]',
      titulo: 'Cobrança em massa',
      descricao:
        'Selecione parcelas e envie a cobrança por <b>e-mail</b> ou <b>WhatsApp</b>. Use o ' +
        '"Preview do E-mail" para revisar antes de enviar.',
      rota: '/parcelas',
      lado: 'bottom',
    },
  ],
}

/** Tour da tela de Sessões. */
export const sessoesTour: Tour = {
  id: 'sessoes',
  nome: 'Tutorial: Sessões',
  iniciarNaRota: '/sessoes',
  passos: [
    {
      titulo: '🗓️ Gestão de Sessões',
      descricao: 'Agende e acompanhe suas sessões de mentoria e coaching.',
      rota: '/sessoes',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="sessoes-view"]',
      titulo: 'Calendário ou Lista',
      descricao: 'Alterne entre a visão de calendário (mês/semana) e a lista de sessões.',
      rota: '/sessoes',
      lado: 'bottom',
    },
    {
      element: '[data-tour="sessoes-nova"]',
      titulo: 'Nova sessão',
      descricao: 'Agende uma sessão online ou presencial, com cliente, data e horário.',
      rota: '/sessoes',
      lado: 'left',
    },
  ],
}

/** Tour do CRM CX (pós-venda). */
export const crmCxTour: Tour = {
  id: 'crm-cx',
  nome: 'Tutorial: CRM CX',
  iniciarNaRota: '/crm-cx',
  passos: [
    {
      titulo: '🤝 CRM CX — pós-venda',
      descricao:
        'O funil de <b>Customer Experience</b> cuida do cliente depois da venda: onboarding, ' +
        'acompanhamento e retenção.',
      rota: '/crm-cx',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="cx-filtros"]',
      titulo: 'Filtrar',
      descricao: 'Filtre os clientes do pós-venda por responsável, estágio e mais.',
      rota: '/crm-cx',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cx-contatos"]',
      titulo: 'Contatos do WhatsApp',
      descricao:
        'Traga um contato do WhatsApp para o funil de pós-venda. Funciona igual ao CRM — o ' +
        'tutorial do CRM / Funil mostra a ferramenta por dentro.',
      rota: '/crm-cx',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cx-disparar"]',
      titulo: 'Disparo por WhatsApp',
      descricao:
        'Envie mensagens em massa para os clientes filtrados — com agendamento, variáveis e ' +
        'intervalo anti-bloqueio (veja o passo a passo no tutorial do CRM / Funil).',
      rota: '/crm-cx',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cx-email"]',
      titulo: 'Disparo por e-mail',
      descricao: 'Envie e-mails em massa para os clientes do pós-venda.',
      rota: '/crm-cx',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cx-novo"]',
      titulo: 'Adicionar ao pós-venda',
      descricao: 'Cadastre manualmente um cliente neste funil.',
      rota: '/crm-cx',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cx-kanban"]',
      titulo: 'Mover entre estágios',
      descricao: 'Arraste os cartões conforme o cliente avança no pós-venda.',
      rota: '/crm-cx',
      lado: 'top',
      alinhamento: 'center',
    },
  ],
}

/** Tour do Dashboard do CRM. */
export const crmDashboardTour: Tour = {
  id: 'crm-dashboard',
  nome: 'Tutorial: Dashboard CRM',
  iniciarNaRota: '/crm/dashboard',
  passos: [
    {
      titulo: '📈 Dashboard do CRM',
      descricao: 'Visão analítica do seu funil: conversão, pipeline e atividades.',
      rota: '/crm/dashboard',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="cdash-funil"]',
      titulo: 'Escolher o funil',
      descricao:
        'Selecione um funil específico ou veja todos juntos. Dica: para o gráfico de funil fazer ' +
        'sentido, prefira analisar <b>um funil por vez</b>.',
      rota: '/crm/dashboard',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cdash-periodo"]',
      titulo: 'Período de análise',
      descricao: 'Defina o intervalo de datas dos eventos (cadastro, ganho ou movimentação).',
      rota: '/crm/dashboard',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cdash-kpis"]',
      titulo: 'Indicadores',
      descricao: 'Leads ativos, valor em pipeline, taxa de conversão e tempo médio de fechamento.',
      rota: '/crm/dashboard',
      lado: 'bottom',
    },
    {
      element: '[data-tour="cdash-followups"]',
      titulo: 'Follow-ups',
      descricao: 'Acompanhe os follow-ups pendentes, atrasados e enviados.',
      rota: '/crm/dashboard',
      lado: 'top',
    },
    {
      element: '[data-tour="cdash-funil-grafico"]',
      titulo: 'Funil de vendas',
      descricao: 'A conversão estágio a estágio. A base (100%) é o maior estágio do funil.',
      rota: '/crm/dashboard',
      lado: 'top',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="cdash-kanban"]',
      titulo: 'Ir para o Kanban',
      descricao: 'Volte para o quadro de leads quando quiser operar o funil.',
      rota: '/crm/dashboard',
      lado: 'left',
    },
  ],
}

/** Tour da tela de WhatsApp. */
export const whatsappTour: Tour = {
  id: 'whatsapp',
  nome: 'Tutorial: WhatsApp',
  iniciarNaRota: '/whatsapp',
  passos: [
    {
      titulo: '💬 WhatsApp da Empresa',
      descricao: 'Conecte e acompanhe o WhatsApp de cada usuário da empresa.',
      rota: '/whatsapp',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="wa-card"]',
      titulo: 'Conexão de cada usuário',
      descricao:
        'Cada cartão mostra o status (online/offline). Para conectar, leia o <b>QR Code</b> com o ' +
        'WhatsApp do celular. Use <b>Forçar Reconexão</b> se cair.',
      rota: '/whatsapp',
      lado: 'bottom',
      alinhamento: 'center',
    },
  ],
}

/** Tour do Agente IA (Sexta-feira). */
export const agenteTour: Tour = {
  id: 'agente',
  nome: 'Tutorial: Agente IA',
  iniciarNaRota: '/agente-sexta-feira',
  passos: [
    {
      titulo: '🤖 Sexta-feira — sua consultora IA',
      descricao: 'Tire dúvidas sobre o sistema, seus números e abordagens de venda.',
      rota: '/agente-sexta-feira',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="agente-abas"]',
      titulo: 'As abas',
      descricao:
        '<b>Sexta-feira</b> (chat) · <b>Configurar Agente</b> (provedor de IA, personalidade, ' +
        'instruções e delay) · <b>Como Funciona</b> (arquitetura, follow-ups e guards).',
      rota: '/agente-sexta-feira',
      lado: 'bottom',
      alinhamento: 'start',
    },
    {
      element: '[data-tour="agente-conteudo"]',
      titulo: 'Converse',
      descricao:
        'Faça perguntas como "resumo do mês" ou "parcelas a vencer". Use as sugestões rápidas ' +
        'para começar.',
      rota: '/agente-sexta-feira',
      lado: 'top',
      alinhamento: 'center',
    },
  ],
}

/** Tour da Configuração de E-mail. */
export const configEmailTour: Tour = {
  id: 'config-email',
  nome: 'Tutorial: Config. de E-mail',
  iniciarNaRota: '/configuracoes/email',
  passos: [
    {
      titulo: '✉️ Configuração de E-mail',
      descricao: 'Conecte seu provedor (Brevo) para enviar cobranças e disparos por e-mail.',
      rota: '/configuracoes/email',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="email-credenciais"]',
      titulo: 'Credenciais SMTP',
      descricao:
        'Informe host, porta, usuário e senha do SMTP e o e-mail/nome remetente (deve estar ' +
        'verificado no Brevo). Marque "Configuração ativa" e salve.',
      rota: '/configuracoes/email',
      lado: 'top',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="email-teste"]',
      titulo: 'Enviar e-mail de teste',
      descricao: 'Depois de salvar, envie um teste para confirmar que está tudo funcionando.',
      rota: '/configuracoes/email',
      lado: 'top',
    },
  ],
}

/** Tour da Administração (usuários). */
export const adminTour: Tour = {
  id: 'admin',
  nome: 'Tutorial: Usuários',
  iniciarNaRota: '/admin',
  passos: [
    {
      titulo: '🛡️ Administração',
      descricao: 'Gerencie os usuários da sua empresa e o que cada um pode acessar.',
      rota: '/admin',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="admin-novo"]',
      titulo: 'Novo usuário',
      descricao: 'Cadastre um novo membro da equipe com e-mail, senha e nível de acesso.',
      rota: '/admin',
      lado: 'left',
    },
    {
      element: '[data-tour="admin-lista"]',
      titulo: 'Usuários e permissões',
      descricao:
        'Na coluna <b>Ações</b> você ajusta permissões, ativa/desativa, edita ou remove cada ' +
        'usuário.',
      rota: '/admin',
      lado: 'top',
      alinhamento: 'center',
    },
  ],
}

/** Tour do Perfil. */
export const perfilTour: Tour = {
  id: 'perfil',
  nome: 'Tutorial: Meu Perfil',
  iniciarNaRota: '/perfil',
  passos: [
    {
      titulo: '👤 Meu Perfil',
      descricao: 'Seus dados pessoais e de acesso.',
      rota: '/perfil',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="perfil-info"]',
      titulo: 'Resumo',
      descricao: 'Nome, e-mail, empresa e seu nível de acesso.',
      rota: '/perfil',
      lado: 'bottom',
    },
    {
      element: '[data-tour="perfil-editar"]',
      titulo: 'Editar informações',
      descricao: 'Atualize sua foto e seus dados e clique em "Salvar Alterações".',
      rota: '/perfil',
      lado: 'top',
      alinhamento: 'center',
    },
  ],
}

/** Tour da Minha Conta (assinatura). */
export const minhaContaTour: Tour = {
  id: 'minha-conta',
  nome: 'Tutorial: Minha Conta',
  iniciarNaRota: '/minha-conta',
  passos: [
    {
      titulo: '💳 Minha Conta',
      descricao: 'Acompanhe e gerencie sua assinatura.',
      rota: '/minha-conta',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="conta-status"]',
      titulo: 'Status da assinatura',
      descricao: 'Plano atual, valor, usuários incluídos e situação da assinatura.',
      rota: '/minha-conta',
      lado: 'bottom',
    },
    {
      element: '[data-tour="conta-plano"]',
      titulo: 'Trocar plano',
      descricao: 'Faça upgrade/downgrade ou gerencie o cancelamento por aqui.',
      rota: '/minha-conta',
      lado: 'top',
    },
    {
      element: '[data-tour="conta-recursos"]',
      titulo: 'Recursos incluídos',
      descricao: 'O que o seu plano libera no sistema.',
      rota: '/minha-conta',
      lado: 'top',
    },
  ],
}

/** Registro de todos os tours disponíveis no app. */
export const tours: Tour[] = [
  welcomeTour,
  dashboardTour,
  crmTour,
  crmCxTour,
  crmDashboardTour,
  clientesTour,
  receitasTour,
  despesasTour,
  parcelasTour,
  sessoesTour,
  whatsappTour,
  agenteTour,
  configEmailTour,
  adminTour,
  perfilTour,
  minhaContaTour,
]

export const tourPorId = (id: string): Tour | undefined => tours.find(t => t.id === id)
