/**
 * O que mudou no sistema, para o cliente ler na aba "Atualizações" do Suporte.
 *
 * Lista fixa no código, de propósito: quem escreve é a equipe, junto com o deploy
 * da própria novidade — não precisa de tabela nem de tela de cadastro. A mais
 * recente vem PRIMEIRO. Escreva para o cliente (o que ele ganha e onde clica),
 * nunca o nome técnico; correção interna e coisa de uma conta só não entram.
 */

import type { RefVideo } from '@/tutoriais/catalogo'

export interface Atualizacao {
  /** AAAA-MM-DD — data em que entrou no ar */
  data: string
  titulo: string
  descricao: string
  /** Onde encontrar, no formato do menu ("Grupos → Criar lead") */
  onde?: string
  /** Plano mínimo, quando a novidade não é de todos */
  plano?: 'Profissional' | 'Enterprise'
  /** Vídeo-tutorial da novidade (id do catálogo). Sem o vídeo publicado, o link não aparece. */
  video?: RefVideo
}

export const ATUALIZACOES: Atualizacao[] = [
  {
    data: '2026-10-26',
    titulo: 'Próximos aniversariantes',
    descricao: 'A página de Clientes mostra quem faz aniversário nos próximos 7, 30 ou 90 dias, com a idade que a pessoa vai fazer e botões para mandar os parabéns pelo WhatsApp ou por e-mail.',
    onde: 'Clientes',
  },
  {
    data: '2026-10-26',
    titulo: 'Excluir direto na edição',
    descricao: 'Ao editar uma receita ou despesa, agora tem o botão Excluir. Na edição de uma parcela também: as outras parcelas continuam e o valor total do lançamento se ajusta sozinho.',
    onde: 'Receitas, Despesas e Parcelas → Editar',
  },
  {
    data: '2026-10-26',
    titulo: 'Asaas: todas as taxas e as antecipações',
    descricao: 'Quem conectou o Asaas agora vê como despesa todas as taxas do extrato (notificação por WhatsApp, mensageria, nota fiscal, antecipação), e a parcela antecipada aparece como recebida no dia em que o dinheiro caiu.',
    onde: 'Receitas → Asaas',
  },
  {
    data: '2026-10-23',
    titulo: 'Comandos do Duo e o Duo no WhatsApp',
    descricao: 'Nova tela com ideias prontas do que pedir ao Duo, separadas por área, com o botão "Usar no Duo". E o Duo agora lê a conversa dos leads, manda mensagem, agenda follow-up, coloca tags, arquiva e prepara disparos com uma mensagem diferente para cada lead, sempre mostrando antes e esperando o seu sim. Tem também o Manual do Duo em PDF.',
    onde: 'Comandos do Duo (menu ou a lâmpada no chat do Duo)',
    video: 'duo-comandos',
  },
  {
    data: '2026-10-23',
    titulo: 'Assinatura de e-mail e agenda em Configurações de E-mail',
    descricao: 'A sua assinatura de e-mail e a conexão com o Google Agenda ou o Microsoft 365 saíram de Meu perfil e agora ficam juntas em Configurações de E-mail. Nada muda no que já estava salvo ou conectado.',
    onde: 'Config. E-mail',
  },
  {
    data: '2026-10-23',
    titulo: 'Duo 2.0: créditos, indicação e o Duo dentro do Claude',
    descricao: 'Recarregue o crédito do Duo por PIX, boleto ou cartão. Indique o Duo pelo seu link e ganhe R$ 20 por pessoa que assinar, para usar como crédito do Duo ou abater na sua mensalidade. E conecte o Duo ao seu Claude para consultar e lançar de lá.',
    onde: 'Créditos do Duo (moeda no chat do Duo) · Indique o Duo · Agente IA → Configurar Agente',
    video: 'duo-conectar-claude',
  },
  {
    data: '2026-10-09',
    titulo: 'Integração com o Conta Azul',
    descricao: 'Clique em Conta Azul, escolha a partir de que data quer trazer e entre com o login da sua conta, sem copiar chave nenhuma. Contas a receber viram receitas e contas a pagar viram despesas, já com o cliente e o produto. O que for pago no Conta Azul fica pago no Duo sozinho, a cada 15 minutos, e dá para conectar mais de uma conta na mesma empresa.',
    onde: 'Receitas → Conta Azul, ou Despesas → Conta Azul',
    video: 'contaazul-receitas',
  },
  {
    data: '2026-10-09',
    titulo: 'Asaas e Conta Azul juntos',
    descricao: 'Quem usa os dois pode conectar os dois. Se a mesma cobrança estiver no Asaas e no Conta Azul, com o mesmo cliente, o mesmo valor e o mesmo vencimento, ela entra uma vez só, sem receita em dobro.',
    onde: 'Receitas',
    video: 'contaazul-receitas',
  },
  {
    data: '2026-10-09',
    titulo: 'Chamados do Suporte para a equipe toda',
    descricao: 'Os chamados agora são da empresa: todo mundo da equipe acompanha e responde os chamados abertos pelos colegas. Para ver só os seus, use o filtro Abertos por mim.',
    onde: 'Suporte → Chamados',
  },
  {
    data: '2026-10-09',
    titulo: 'Criar lead: todas as regras da equipe',
    descricao: 'Quem administra a conta vê as regras de Criar lead de todos os números da equipe e pode ligar, desligar ou editar cada uma. A tela avisa quando duas regras ligadas estão no mesmo grupo.',
    onde: 'Grupos → Criar lead',
  },
  {
    data: '2026-10-09',
    titulo: 'Boas-vindas não para quando um número cai',
    descricao: 'Com a boas-vindas dividida entre números da equipe, se um dos WhatsApps cair, os outros números do grupo assumem e as mensagens continuam saindo, sem ninguém receber duas vezes.',
    onde: 'Grupos → Boas-vindas',
  },
  {
    data: '2026-10-08',
    titulo: 'CRM Dashboard renovado',
    descricao: 'O CRM Dashboard ganhou o mesmo jeito do Dashboard financeiro. Período, funil e proprietário ficam presos no topo enquanto você rola, com os atalhos Hoje, 7 dias, 30 dias, Este mês e Mês passado, e continuam escolhidos ao recarregar a página ou mandar o link. Um resumo em frases conta como foi o período, e os cartões de leads novos, vendas, conversão, perdas, valor em pipeline e tempo até a venda mostram quanto cada número subiu ou caiu em relação ao período anterior. Tarefas atrasadas, leads sem contato e follow-ups ficam juntos em Pede atenção.',
    onde: 'CRM Dashboard',
  },
  {
    data: '2026-10-08',
    titulo: 'Fluxo de caixa previsto e resumo do período',
    descricao: 'O Dashboard agora mostra o que vai entrar e sair nos próximos 30, 60 ou 90 dias e quanto sobra, dia a dia. Se em algum dia faltar dinheiro, o pior momento aparece marcado. No topo, um resumo conta em frases quanto entrou, quanto saiu e o que está em atraso. Escolha também ver por Pagamento, o que de fato entrou e saiu do caixa, em vez do vencimento. Cada gráfico tem os números em tabela, e os cartões ganharam uma linha de tendência.',
    onde: 'Dashboard',
  },
  {
    data: '2026-10-08',
    titulo: 'Dashboard financeiro com filtros e comparação',
    descricao: 'O Dashboard ficou mais direto. O período fica preso no topo enquanto você rola a página, com os atalhos Este mês, Mês passado, Últimos 3 meses e Este ano, e continua escolhido ao recarregar a página ou mandar o link. Em Filtros, veja só uma cliente, um produto, uma categoria de despesa, o que veio do Asaas ou o que está em atraso. Cada número mostra quanto subiu ou caiu em relação ao período anterior. Clique num mês do gráfico para ver só ele, ou numa parte da pizza para filtrar pela situação. O quadro Em atraso agora olha só o que os clientes devem, e Clientes ativos conta quem teve receita no período.',
    onde: 'Dashboard → Filtros',
  },
  {
    data: '2026-10-07',
    titulo: 'Asaas sem receita em dobro',
    descricao: 'Quem já lançava à mão as cobranças do Asaas ficava com a receita em dobro ao conectar. Agora, quando chega uma cobrança da mesma cliente, com o mesmo valor e o mesmo vencimento de uma parcela que você já lançou, o Duo junta as duas: fica a do Asaas, que vira recebida sozinha quando a cliente paga. As outras parcelas do seu lançamento continuam, cobrindo os meses que o Asaas ainda não gerou.',
    onde: 'Receitas → Asaas',
  },
  {
    data: '2026-10-07',
    titulo: 'Boas-vindas dividida entre os números da equipe',
    descricao: 'A boas-vindas no privado agora pode sair por vários WhatsApps da equipe, um de cada vez. Ligue a divisão e marque quem envia: aparecem os números conectados por QR. Cada número tem o próprio limite de 40 por dia, quem estiver desconectado fica de fora, e o card passa para quem enviou, para a resposta chegar no WhatsApp dessa pessoa.',
    onde: 'Grupos → Boas-vindas → No privado → Dividir o envio entre números da equipe',
  },
  {
    data: '2026-10-07',
    titulo: 'Excluir leads em massa',
    descricao: 'Limpe o CRM de uma vez: apague todos os leads de um estágio ou de um funil inteiro. Esvaziar o funil mantém o funil e as colunas. Para confirmar, digite EXCLUIR. Não dá para desfazer, mas as conversas do WhatsApp ficam guardadas. Só quem administra a conta vê essa opção.',
    onde: 'CRM → 3 pontinhos da coluna, ou lista de funis → Esvaziar funil',
  },
  {
    data: '2026-10-06',
    titulo: 'Integração com o Asaas',
    descricao: 'Cole a chave de API da sua conta do Asaas e cada cobrança vira receita sozinha. Quando o cliente paga, a receita já fica como recebida, na hora. Parcelas do cartão aparecem como a receber até o dinheiro cair, o cliente da cobrança entra em Clientes sem duplicar quem você já tinha, e a taxa do Asaas entra em Despesas.',
    onde: 'Receitas → Asaas',
    video: 'asaas-receitas',
  },
  {
    data: '2026-10-06',
    titulo: 'A receber daqui para frente',
    descricao: 'O Dashboard ganhou um quadro com tudo o que você tem a receber de hoje em diante, com o total e o valor de cada mês. Ele não muda com o período escolhido no filtro.',
    onde: 'Dashboard',
  },
  {
    data: '2026-10-06',
    titulo: 'Enquete nos Grupos',
    descricao: 'Crie uma nova mensagem de grupo e escolha Enquete: escreva a pergunta e de 2 a 12 respostas. Ela pode ser agendada como qualquer mensagem.',
    onde: 'Grupos',
  },
  {
    data: '2026-10-06',
    titulo: 'Boas-vindas no privado com nome e no histórico do card',
    descricao: 'A boas-vindas que sai no privado de quem entra no grupo agora chama a pessoa pelo nome do card e aparece na conversa do card, para a equipe ver quem já foi abordado. A página de Grupos também avisa quando um grupo cria lead sem ter boas-vindas ligada.',
    onde: 'Grupos',
  },
  {
    data: '2026-10-06',
    titulo: 'Planilhas no Suporte',
    descricao: 'Os chamados do Suporte agora aceitam anexar planilhas Excel e CSV, além de imagem e PDF.',
    onde: 'Suporte',
  },
  {
    data: '2026-10-06',
    titulo: 'Em breve: reuniões do CRM na sua agenda',
    descricao: 'A integração com o Google Agenda está em fase de teste, e a da Microsoft (Outlook e Teams) vem logo depois. Cada reunião marcada no card — por você, pela equipe ou pelo agente de IA — vai aparecer na sua agenda com a sala do Meet ou do Teams pronta, e remarcar ou cancelar no Duo atualiza lá. Já disponível: a reunião agora tem duração.',
    onde: 'Em breve em Meu perfil → Agenda',
    video: 'conectar-agenda',
  },
  {
    data: '2026-10-06',
    titulo: 'Grupos pelo QR Code também com o número oficial',
    descricao: 'Com o atendimento no número oficial, conecte na própria página de Grupos um WhatsApp por QR Code só para os grupos: mensagens, boas-vindas, criar lead e campanhas. E no Criar lead, os leads podem ser divididos entre quem você marcar — uma, duas ou todas as pessoas da equipe.',
    onde: 'Grupos',
    plano: 'Enterprise',
    video: 'conectar-chip-grupos',
  },
  {
    data: '2026-10-04',
    titulo: 'Vídeos-tutoriais na própria tela',
    descricao: 'Vídeos de um a dois minutos, com narração e legenda, que abrem num canto da tela enquanto você faz a tarefa. Pare o mouse em botões como Importar ou E-mail, clique em "Ver em vídeo" nas configurações, ou pergunte ao Duo "como faço…?". Todos ficam também em Suporte → Tutoriais.',
    onde: 'Em cada tela, e em Suporte → Tutoriais',
    video: 'ajuda-em-video',
  },
  {
    data: '2026-10-04',
    titulo: 'Follow-up do card com modelo de reserva',
    descricao: 'No número oficial, o follow-up agendado no card ganha um modelo aprovado de reserva: se o lead não escreveu nas últimas 24 horas, é ele que sai no lugar da mensagem, em vez de o envio falhar.',
    onde: 'CRM → card do lead → Follow-up',
    plano: 'Enterprise',
    video: 'agendar-followup-oficial',
  },
  {
    data: '2026-10-01',
    titulo: 'Quem entra no grupo vira lead sozinho',
    descricao: 'Escolha o grupo, o funil e a etapa: cada pessoa nova no grupo ganha um card no CRM. O responsável pode ser fixo ou em rodízio, dividindo os leads por igual entre a equipe.',
    onde: 'Grupos → Criar lead',
    plano: 'Profissional',
    video: 'grupos-criar-lead',
  },
  {
    data: '2026-10-01',
    titulo: 'Respostas por botão',
    descricao: 'Mande uma mensagem com botões ("Sim" / "Não") pelo número oficial e defina o que acontece em cada clique: uma sequência de áudio, vídeo, imagem ou texto, e uma tarefa de follow-up para os dias que você escolher.',
    onde: 'CRM → configurações da etapa',
    plano: 'Enterprise',
    video: 'respostas-botao',
  },
  {
    data: '2026-10-01',
    titulo: 'O motivo real de um envio que não saiu',
    descricao: 'Quando um follow-up é barrado, o card agora mostra o motivo verdadeiro, para você saber se adianta reagendar ou se é preciso mudar algo.',
    onde: 'CRM → card do lead',
    video: 'followup-motivo-falha',
  },
  {
    data: '2026-09-29',
    titulo: 'Tags no lead e nome do card pelo WhatsApp',
    descricao: 'Marque cada lead com tags para filtrar o quadro. E o card de quem chega pelo WhatsApp já nasce com o nome que a pessoa usa lá.',
    onde: 'CRM',
    plano: 'Profissional',
    video: 'organizar-quadro',
  },
  {
    data: '2026-09-29',
    titulo: 'Instale o Duo no celular',
    descricao: 'O sistema agora se chama Duo e pode ser instalado como aplicativo: no celular, abra pelo navegador e escolha "Adicionar à tela inicial".',
    video: 'instalar-app',
  },
  {
    data: '2026-09-29',
    titulo: 'Campanhas de grupo',
    descricao: 'Um link único que distribui as pessoas entre vários grupos, abre um grupo novo quando o atual lota e transforma quem entra em lead.',
    onde: 'Grupos → Campanhas',
    plano: 'Enterprise',
    video: 'campanhas-grupo',
  },
  {
    data: '2026-09-28',
    titulo: 'Página de Grupos do WhatsApp',
    descricao: 'Agende mensagens para os seus grupos, com texto, imagem e menções, e configure uma boas-vindas automática para quem entra.',
    onde: 'Grupos',
    plano: 'Profissional',
    video: 'grupos-mensagem-boas-vindas',
  },
  {
    data: '2026-09-28',
    titulo: 'Esqueci minha senha',
    descricao: 'Na tela de login, peça um link por e-mail e crie uma senha nova sem depender do suporte.',
  },
  {
    data: '2026-09-25',
    titulo: 'Reagir e responder citando no chat',
    descricao: 'No chat do card dá para reagir a uma mensagem com emoji e responder citando, igual ao WhatsApp.',
    onde: 'CRM → card do lead',
    plano: 'Profissional',
    video: 'conversa-card',
  },
  {
    data: '2026-09-21',
    titulo: 'Quadro do CRM mais fácil de usar',
    descricao: 'Ordene os cards por última mensagem, mais quentes, maior valor ou nome. Cabe mais card na tela, e ao recarregar a página (F5) você volta exatamente para onde estava.',
    onde: 'CRM',
    plano: 'Profissional',
    video: 'organizar-quadro',
  },
  {
    data: '2026-09-21',
    titulo: 'O agente de IA entende áudio',
    descricao: 'O áudio que o lead manda chega transcrito para o agente responder. E, quando não há o que dizer, o agente pode ficar em silêncio em vez de mandar qualquer coisa.',
    onde: 'Agente IA',
    plano: 'Profissional',
    video: 'agente-ia-etapa',
  },
  {
    data: '2026-09-21',
    titulo: 'Modo escuro',
    descricao: 'O sistema inteiro no tema escuro, para quem passa o dia na frente da tela.',
    onde: 'Menu lateral → Modo Escuro',
  },
  {
    data: '2026-09-21',
    titulo: 'Suporte por chamado',
    descricao: 'Abra um chamado com print anexado e acompanhe a resposta da nossa equipe por aqui mesmo.',
    onde: 'Suporte',
  },
]
