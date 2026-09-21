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
        'Seu agente de inteligência artificial para atender e qualificar leads automaticamente.',
      lado: 'right',
      permissao: 'agente',
      requerSidebar: true,
    },
    {
      // A âncora `nav-suporte` já existia na Sidebar e nenhum passo a usava: o módulo
      // de chamados (migration 068) ficava invisível para quem faz o tour de entrada,
      // justamente quem mais precisa saber onde pedir ajuda. Sem `permissao` de
      // propósito — pedir ajuda não depende de módulo liberado.
      element: '[data-tour="nav-suporte"]',
      titulo: 'Suporte',
      descricao:
        'Travou em alguma coisa? Abra um chamado aqui e nossa equipe responde. ' +
        'Fica disponível para qualquer usuário, sem depender de permissão.',
      lado: 'right',
      requerSidebar: true,
    },
    {
      element: '[data-tour="widget-ia"]',
      titulo: 'Duo — seu assistente de IA',
      descricao:
        'Este botão flutuante abre o <b>Duo</b>, que responde dúvidas sobre seus números ' +
        'e ajuda a tomar decisões. Ele está disponível em qualquer tela.',
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
      descricao: 'Receitas × despesas mês a mês e a situação das parcelas.',
      rota: '/dashboard',
      lado: 'top',
      alinhamento: 'center',
      permissao: 'dashboard',
    },
    {
      element: '[data-tour="dash-detalhamento"]',
      titulo: 'Quem pagou e com o que foi gasto',
      descricao:
        'Cada recebimento e cada gasto do período, agrupado por <b>cliente</b>, <b>produto</b>, ' +
        '<b>categoria</b> ou <b>descrição</b>. Clique num nome para ver os lançamentos dele.',
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
      descricao:
        'Aqui ficam todos os seus clientes cadastrados — a base para receitas, sessões e ' +
        'cobranças. Vamos abrir o cadastro de verdade, sem salvar nada.',
      rota: '/clientes',
      lado: 'over',
      alinhamento: 'center',
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
    {
      element: '[data-tour="clientes-novo"]',
      titulo: '👉 Clique em "Novo Cliente"',
      descricao: 'Vamos abrir o formulário de cadastro para você conhecer os campos.',
      rota: '/clientes',
      lado: 'left',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="modal-conteudo"]',
      titulo: 'Cadastro do cliente',
      descricao:
        'Nome, e-mail, telefone, documento e <b>aniversário</b> (usado em automações de ' +
        'felicitação). Ao concluir, eu fecho sem salvar — este foi só o passeio. ✅',
      rota: '/clientes',
      lado: 'left',
      semVoltar: true,
      cliqueAoSair: '[data-tour="modal-fechar"]',
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
      element: '[data-tour="receitas-filtros"]',
      titulo: 'Filtrar receitas',
      descricao:
        'Filtre por período, cliente, produto/serviço, tipo de pagamento e faixa de valor. ' +
        'Cada lançamento na lista abaixo pode ser editado ou removido.',
      rota: '/receitas',
      lado: 'top',
    },
    {
      element: '[data-tour="receitas-nova"]',
      titulo: '👉 Clique em "Nova Receita"',
      descricao: 'Vamos abrir o lançamento para você conhecer os campos — sem salvar nada.',
      rota: '/receitas',
      lado: 'left',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="modal-conteudo"]',
      titulo: 'Lançando uma receita',
      descricao:
        'Cliente, categoria, valor e a forma: <b>à vista</b> ou <b>parcelado</b> — ao parcelar, o ' +
        'sistema cria as parcelas automaticamente (com os centavos certinhos) e elas aparecem na ' +
        'tela de Parcelas. Ao concluir, eu fecho sem salvar. ✅',
      rota: '/receitas',
      lado: 'left',
      semVoltar: true,
      cliqueAoSair: '[data-tour="modal-fechar"]',
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
      element: '[data-tour="despesas-banco"]',
      titulo: 'Conectar banco (Open Finance)',
      descricao:
        'Conecte sua conta para importar despesas automaticamente do extrato. Em "Bancos ' +
        'conectados" você gerencia as conexões e força uma sincronização.',
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
    {
      element: '[data-tour="despesas-nova"]',
      titulo: '👉 Clique em "Nova Despesa"',
      descricao: 'Vamos abrir o lançamento para você conhecer os campos — sem salvar nada.',
      rota: '/despesas',
      lado: 'left',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="modal-conteudo"]',
      titulo: 'Lançando uma despesa',
      descricao:
        'Descrição, categoria, valor e pagamento <b>à vista</b> ou <b>parcelado</b> (as parcelas ' +
        'vão para a tela de Parcelas). Ao concluir, eu fecho sem salvar. ✅',
      rota: '/despesas',
      lado: 'left',
      semVoltar: true,
      cliqueAoSair: '[data-tour="modal-fechar"]',
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
        'Marque as parcelas na lista e envie a cobrança por <b>e-mail</b> ou <b>WhatsApp</b> de ' +
        'uma vez. Use o "Preview do E-mail" para revisar antes de enviar.',
      rota: '/parcelas',
      lado: 'bottom',
    },
    {
      titulo: 'Editar e dar baixa ✅',
      descricao:
        'Na lista, o lápis de cada parcela abre a edição: mude o vencimento, o valor ou marque ' +
        'como <b>PAGO</b> informando a data de pagamento. Parcelas vencidas viram ATRASADO ' +
        'automaticamente todo dia.',
      rota: '/parcelas',
      lado: 'over',
      alinhamento: 'center',
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
      titulo: '👉 Clique em "Nova Sessão"',
      descricao: 'Vamos abrir o agendamento para você conhecer os campos — sem salvar nada.',
      rota: '/sessoes',
      lado: 'left',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="modal-conteudo"]',
      titulo: 'Agendando uma sessão',
      descricao:
        'Cliente, data, horário e formato (<b>online</b> com link ou <b>presencial</b> com ' +
        'endereço). A sessão aparece no calendário e na lista. Ao concluir, eu fecho sem salvar. ✅',
      rota: '/sessoes',
      lado: 'left',
      semVoltar: true,
      cliqueAoSair: '[data-tour="modal-fechar"]',
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
      element: '[data-tour="cx-importar"]',
      titulo: 'Importar em lote',
      descricao: 'Suba uma planilha (CSV/Excel) para cadastrar vários clientes de uma vez.',
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
      descricao:
        'Arraste os cartões conforme o cliente avança no pós-venda. No topo de cada coluna: ' +
        '🤖 = Agente IA reativo · 🔔 = cadência de follow-up ativa.',
      rota: '/crm-cx',
      lado: 'top',
      alinhamento: 'center',
    },

    // ── Contatos WhatsApp — interativo (mesmo modal do CRM) ──
    {
      element: '[data-tour="cx-contatos"]',
      titulo: '👉 Clique em "Contatos"',
      descricao:
        'Traga uma conversa do WhatsApp para o pós-venda. <b>Clique para abrir</b> e eu mostro ' +
        'por dentro.',
      rota: '/crm-cx',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="cw-lista"]',
      titulo: 'Adicionar ao Funil',
      descricao:
        'Use <b>Sincronizar</b> para trazer conversas novas e o botão <b>"Adicionar ao Funil"</b> ' +
        'para transformar o contato em cliente do pós-venda. A aba <b>Grupos</b> importa ' +
        'participantes de grupos. Vamos fechar e ver o disparo.',
      rota: '/crm-cx',
      lado: 'top',
      alinhamento: 'center',
      semVoltar: true,
      cliqueAoSair: '[data-tour="cw-fechar"]',
    },

    // ── Disparo em massa — interativo (sem enviar nada) ──
    {
      element: '[data-tour="cx-disparar"]',
      titulo: '👉 Clique em "Disparar"',
      descricao:
        'Mensagem em massa para os clientes filtrados. <b>Clique para abrir</b> — não vamos ' +
        'enviar nada.',
      rota: '/crm-cx',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="disp-modo"]',
      titulo: 'Quem vai receber',
      descricao:
        '<b>Todos do funil</b> (usa os filtros) ou <b>Selecionar leads</b> um a um — quem já está ' +
        'em outro disparo programado aparece com o selo "programado".',
      rota: '/crm-cx',
      lado: 'bottom',
      semVoltar: true,
    },
    {
      element: '[data-tour="disp-continuar"]',
      titulo: '👉 Clique em "Continuar"',
      descricao: 'Vamos para a etapa da mensagem.',
      rota: '/crm-cx',
      lado: 'top',
      alinhamento: 'end',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="disp-mensagem"]',
      titulo: 'A mensagem',
      descricao:
        'Escreva usando as variáveis ([PrimeiroNome]…), defina agendamento, estágio pós-envio ' +
        'e intervalo anti-bloqueio — tudo igual ao CRM de vendas.',
      rota: '/crm-cx',
      lado: 'top',
      semVoltar: true,
    },
    {
      element: '[data-tour="disp-enviar"]',
      titulo: 'O botão final — sem enviar! 🎉',
      descricao:
        'É este botão que dispara (ou agenda) de verdade. <b>Agora não vamos enviar</b> — ao ' +
        'concluir, eu fecho a janela. Fim do tour do CX!',
      rota: '/crm-cx',
      lado: 'top',
      alinhamento: 'end',
      cliqueAoSair: '[data-tour="disp-fechar"]',
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

/** Tour do Agente IA (o Duo). */
export const agenteTour: Tour = {
  id: 'agente',
  nome: 'Tutorial: Agente IA',
  iniciarNaRota: '/agente-duo',
  passos: [
    {
      titulo: 'Duo — seu assistente de IA',
      descricao: 'Tire dúvidas sobre o sistema, seus números e abordagens de venda.',
      rota: '/agente-duo',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="agente-abas"]',
      titulo: 'As abas',
      descricao:
        '<b>Duo</b> (chat) · <b>Configurar Agente</b> (provedor de IA, personalidade, ' +
        'instruções e delay) · <b>Como Funciona</b> (arquitetura, follow-ups e guards).',
      rota: '/agente-duo',
      lado: 'bottom',
      alinhamento: 'start',
    },
    {
      element: '[data-tour="agente-conteudo"]',
      titulo: 'Converse',
      descricao:
        'Faça perguntas como "resumo do mês" ou "parcelas a vencer". Use as sugestões rápidas ' +
        'para começar. Ele também sabe explicar o sistema e sugerir abordagens de venda.',
      rota: '/agente-duo',
      lado: 'top',
      alinhamento: 'center',
    },

    // ── Configurar Agente — interativo (só admin/master) ──
    {
      element: '[data-tour="agente-tab-configurar"]',
      titulo: '👉 Clique em "Configurar Agente"',
      descricao: 'Vamos conhecer as configurações do agente de IA que atende no WhatsApp.',
      rota: '/agente-duo',
      lado: 'bottom',
      papeis: ['super_admin', 'admin_empresa'],
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="agcfg-ativo"]',
      titulo: 'Liga/desliga geral',
      descricao:
        'Este interruptor liga ou desliga o agente para a empresa inteira. Depois, o controle ' +
        'fino é por estágio (🤖 na coluna do funil) ou por lead.',
      rota: '/agente-duo',
      lado: 'bottom',
      papeis: ['super_admin', 'admin_empresa'],
      semVoltar: true,
    },
    {
      element: '[data-tour="agcfg-provider"]',
      titulo: 'Provedor e chaves de IA',
      descricao:
        'Escolha entre <b>Claude</b> e <b>Gemini</b> e informe a API key. A chave Gemini também ' +
        'habilita a transcrição automática de áudios recebidos.',
      rota: '/agente-duo',
      lado: 'bottom',
      papeis: ['super_admin', 'admin_empresa'],
    },
    {
      element: '[data-tour="agcfg-instrucoes"]',
      titulo: 'Instruções adicionais',
      descricao:
        'O coração do agente: personalidade, tom de voz, produtos, preços e regras de conversa. ' +
        'Quanto mais específicas, mais o agente soa como a sua equipe.',
      rota: '/agente-duo',
      lado: 'top',
      papeis: ['super_admin', 'admin_empresa'],
    },
    {
      element: '[data-tour="agente-tab-como-funciona"]',
      titulo: '👉 Clique em "Como Funciona"',
      descricao: 'Para fechar, a documentação viva de como os agentes trabalham.',
      rota: '/agente-duo',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="agente-conteudo"]',
      titulo: 'Documentação dos agentes 🤖',
      descricao:
        'Arquitetura do agente reativo e dos follow-ups, o passo a passo de como montar o fluxo ' +
        'de atendimento na visão Fluxo do CRM e as regras de proteção (anti-ban, conversa viva, ' +
        'janela 08h–20h). Fim do tour!',
      rota: '/agente-duo',
      lado: 'top',
      alinhamento: 'center',
      semVoltar: true,
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

/**
 * Tour da aba Agendamentos (dentro de /crm).
 *
 * Não é uma rota própria: a tela vive numa ABA do CRM. Por isso o primeiro passo é
 * interativo (`avancarAoClicar`) e aponta para o botão da aba — sem clicar nele, o
 * conteúdo não existe no DOM e todos os passos seguintes ficariam sem âncora.
 */
export const agendamentosTour: Tour = {
  id: 'agendamentos',
  nome: 'Tutorial: Agendamentos',
  passos: [
    {
      element: '[data-tour="crm-aba-agendamentos"]',
      titulo: '📅 Agendamentos',
      descricao:
        'Aqui fica tudo que o sistema <b>vai enviar sozinho</b> — follow-ups do agente de IA, ' +
        'follow-ups manuais e disparos programados. Clique na aba para abrir.',
      rota: '/crm',
      lado: 'bottom',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="ag-resumo"]',
      titulo: 'O panorama em quatro números',
      descricao:
        '<b>Agendados</b> é o que ainda vai sair no horário. <b>Atrasados</b> é o que já passou ' +
        'da hora e o sistema segue tentando. <b>Falhos</b> exige a sua atenção. ' +
        'Atrasado não é falha — é só o horário que escorregou.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="ag-filtros"]',
      titulo: 'Filtrar por situação',
      descricao:
        'Cada aba responde uma pergunta: o que vai sair, o que atrasou, o que falhou, o que já ' +
        'foi enviado e o que foi cancelado. Comece por <b>Falhos</b> quando algo parecer errado.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="ag-filtros-sec"]',
      titulo: 'Estreitar a busca',
      descricao:
        'Filtre por responsável (o número de WhatsApp que envia), por estágio do funil ou por ' +
        'tipo — só Agente IA ou só manual.',
      rota: '/crm',
      lado: 'bottom',
    },
    {
      element: '[data-tour="ag-lista"]',
      titulo: 'Cada linha é um envio programado',
      descricao:
        'A faixa colorida à esquerda mostra a situação de relance. A linha traz o lead, o tipo ' +
        'da ação, quando sai e em qual estágio; abaixo, por qual número a mensagem vai. ' +
        '<b>Clique num item</b> para ver o histórico completo, o motivo de uma falha e as ' +
        'próximas ações daquele lead.',
      rota: '/crm',
      lado: 'top',
    },
    {
      element: '[data-tour="followup-intervalo"]',
      titulo: 'Ritmo e horário de envio',
      descricao:
        'O <b>intervalo</b> espaça uma mensagem da outra para proteger seu número. O ' +
        '<b>horário de envio</b> vale para toda a empresa: fora dele nada sai, e o que vencer ' +
        'é reagendado para a próxima abertura — sem se perder.',
      rota: '/crm',
      lado: 'bottom',
    },
  ],
}

/** Tour do Suporte (chamados). */
export const suporteTour: Tour = {
  id: 'suporte',
  nome: 'Tutorial: Suporte',
  iniciarNaRota: '/suporte',
  passos: [
    {
      titulo: '🛟 Suporte',
      descricao:
        'Precisa de ajuda? Abra um chamado aqui e nossa equipe responde. Não depende de ' +
        'permissão nenhuma — está disponível para qualquer usuário.',
      rota: '/suporte',
      lado: 'over',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="suporte-novo"]',
      titulo: 'Abrir um chamado',
      descricao:
        'Descreva o que aconteceu e anexe print ou arquivo se ajudar. Quanto mais concreto ' +
        '(o que você fez, o que esperava, o que apareceu), mais rápido a resposta.',
      rota: '/suporte',
      lado: 'left',
    },
    {
      element: '[data-tour="suporte-lista"]',
      titulo: 'Seus chamados',
      descricao:
        'Todos os seus chamados ficam aqui, do mais recente ao mais antigo. Clique num deles ' +
        'para abrir a conversa e acompanhar as respostas.',
      rota: '/suporte',
      lado: 'right',
    },
    {
      element: '[data-tour="suporte-filtro"]',
      titulo: 'Filtrar por situação',
      descricao:
        '<b>Na fila</b> é o que está com a nossa equipe. <b>Com o cliente</b> é o que está ' +
        'esperando você responder. Vale conferir esse de vez em quando.',
      rota: '/suporte',
      lado: 'bottom',
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
      element: '[data-tour="admin-lista"]',
      titulo: 'Usuários e permissões',
      descricao:
        'Na coluna <b>Ações</b> você ajusta permissões (o que cada um vê no menu), ativa/desativa, ' +
        'edita ou remove cada usuário.',
      rota: '/admin',
      lado: 'top',
      alinhamento: 'center',
    },
    {
      element: '[data-tour="admin-novo"]',
      titulo: '👉 Clique em "Novo Usuário"',
      descricao: 'Vamos abrir o cadastro para você conhecer os campos — sem salvar nada.',
      rota: '/admin',
      lado: 'left',
      avancarAoClicar: true,
    },
    {
      element: '[data-tour="modal-conteudo"]',
      titulo: 'Cadastro de usuário',
      descricao:
        'Nome, e-mail, senha e o nível de acesso (master ou usuário comum). Depois de criar, ' +
        'ajuste as permissões na lista. Ao concluir, eu fecho sem salvar. ✅',
      rota: '/admin',
      lado: 'left',
      semVoltar: true,
      cliqueAoSair: '[data-tour="modal-fechar"]',
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
  agendamentosTour,
  whatsappTour,
  agenteTour,
  suporteTour,
  configEmailTour,
  adminTour,
  perfilTour,
  minhaContaTour,
]

export const tourPorId = (id: string): Tour | undefined => tours.find(t => t.id === id)
