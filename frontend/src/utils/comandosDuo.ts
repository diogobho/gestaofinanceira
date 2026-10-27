/**
 * Comandos sugeridos para o Duo (pedido do dono, 23/10/2026), separados por frente
 * do sistema. Valem igual no chat do Duo e no Claude com o conector: as ferramentas
 * são as mesmas (`api/src/modules/chat-financeiro/acoes.ts`). O que está entre
 * colchetes é para a pessoa trocar antes de mandar.
 *
 * Fonte única: tela /comandos-duo, chat do Duo e o manual em PDF
 * (`api/scripts/manual-duo/`) leem esta lista. Comando novo só entra aqui se a
 * ferramenta existir — sugestão sem ferramenta faz o Duo inventar resposta.
 */

export interface ComandoDuo {
  titulo: string
  texto: string
  /** Ação que grava ou envia: o Duo mostra o resumo e espera o "sim". */
  pedeConfirmacao?: boolean
  /** Só em plano/canal específico. */
  observacao?: string
}

export interface FrenteDuo {
  id: string
  titulo: string
  descricao: string
  comandos: ComandoDuo[]
}

export const FRENTES_DUO: FrenteDuo[] = [
  {
    id: 'crm',
    titulo: 'CRM e funil',
    descricao: 'Achar leads, ver como está o funil e organizar o quadro.',
    comandos: [
      { titulo: 'Resumo do funil', texto: 'Como está o funil [nome do funil]? Quantos leads em cada etapa, quantos sem tarefa e quantos com tarefa atrasada?' },
      { titulo: 'Achar um lead', texto: 'Busque o lead [nome ou telefone] e me mostre os detalhes, as tarefas abertas e as últimas anotações.' },
      { titulo: 'Leads de uma etapa', texto: 'Liste os leads da etapa [nome da etapa] do funil [nome do funil].' },
      { titulo: 'Meus leads quentes', texto: 'Quais leads quentes estão comigo como responsável?' },
      { titulo: 'Criar lead', texto: 'Crie um lead chamado [nome], telefone [telefone], no funil [nome do funil], origem [origem], com uma ligação amanhã às 10h.', pedeConfirmacao: true },
      { titulo: 'Mudar de etapa', texto: 'Mova o lead [nome] para a etapa [nome da etapa].', pedeConfirmacao: true },
      { titulo: 'Trocar responsável', texto: 'Passe o lead [nome] para [pessoa da equipe] como responsável.', pedeConfirmacao: true },
      { titulo: 'Passar para outro funil', texto: 'Passe o lead [nome] para o funil [nome do funil].', pedeConfirmacao: true },
      { titulo: 'Colocar tag em vários', texto: 'Coloque a tag [nome da tag] em todos os leads da etapa [nome da etapa] do funil [nome do funil].', pedeConfirmacao: true },
      { titulo: 'Arquivar ou reativar', texto: 'Arquive o lead [nome], ele não tem mais interesse.', pedeConfirmacao: true },
      { titulo: 'Anotar no card', texto: 'Anote no lead [nome] que [o que aconteceu].', pedeConfirmacao: true },
    ],
  },
  {
    id: 'whatsapp',
    titulo: 'WhatsApp e disparos',
    descricao: 'Ler conversas, responder e mandar mensagens personalizadas em massa.',
    comandos: [
      {
        titulo: 'Disparo personalizado por etapa',
        texto: 'Leia a conversa de cada lead da etapa [nome da etapa] do funil [nome do funil] e prepare uma mensagem de WhatsApp para cada um, retomando o que ele falou e convidando para [objetivo]. Me mostre as mensagens antes de disparar.',
        pedeConfirmacao: true,
        observacao: 'Disparo em massa: plano Enterprise, pelo número oficial (ou chip liberado).',
      },
      {
        titulo: 'Disparo e mudar de etapa',
        texto: 'Prepare uma mensagem personalizada para cada lead da etapa [etapa] do funil [funil], pelo histórico da conversa, dispare amanhã às 9h e, depois de enviar, mova cada um para [etapa seguinte].',
        pedeConfirmacao: true,
        observacao: 'Disparo em massa: plano Enterprise, pelo número oficial (ou chip liberado).',
      },
      { titulo: 'Resumo de uma conversa', texto: 'Leia a conversa com o lead [nome] e me diga em que pé está, o que ele quer e qual o próximo passo.' },
      { titulo: 'Quem está esperando resposta', texto: 'Leia as conversas da etapa [nome da etapa] e me diga quais leads fizeram uma pergunta e ainda não responderam.' },
      { titulo: 'Responder um lead', texto: 'Leia a conversa com [nome] e escreva uma resposta para a última mensagem dele. Me mostre antes de enviar.', pedeConfirmacao: true },
      { titulo: 'Mandar uma mensagem', texto: 'Mande para o lead [nome] no WhatsApp: "[mensagem]"', pedeConfirmacao: true },
      { titulo: 'Andamento dos disparos', texto: 'Como estão meus disparos? Mostre os últimos, os agendados e os erros.' },
    ],
  },
  {
    id: 'tarefas',
    titulo: 'Tarefas e follow-up',
    descricao: 'Agenda do dia, retornos e follow-ups programados.',
    comandos: [
      { titulo: 'Minha agenda de hoje', texto: 'Quais são minhas tarefas de hoje e as atrasadas?' },
      { titulo: 'Tarefas da equipe', texto: 'Mostre as tarefas atrasadas de toda a equipe.' },
      { titulo: 'Agendar ligação ou reunião', texto: 'Agende uma reunião com o lead [nome] na [dia] às [hora].', pedeConfirmacao: true },
      { titulo: 'Concluir tarefa', texto: 'Marque como concluída a tarefa de [ligação/reunião] com [nome].', pedeConfirmacao: true },
      { titulo: 'Reagendar', texto: 'Passe a tarefa com [nome] para [dia] às [hora].', pedeConfirmacao: true },
      { titulo: 'Follow-up com texto pronto', texto: 'Agende um follow-up para [nome] na [dia] às [hora] com a mensagem: "[mensagem]"', pedeConfirmacao: true },
      { titulo: 'Follow-up escrito pela IA', texto: 'Agende um follow-up para [nome] daqui a 3 dias às 10h, e a IA escreve na hora retomando a última conversa.', pedeConfirmacao: true },
      { titulo: 'Cancelar follow-up', texto: 'Cancele o follow-up que está marcado para o lead [nome].', pedeConfirmacao: true },
    ],
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    descricao: 'Receitas, despesas, parcelas e a saúde do caixa.',
    comandos: [
      { titulo: 'Como está o mês', texto: 'Como está o financeiro deste mês? Quanto entrou, quanto saiu e o saldo.' },
      { titulo: 'Para onde foi o dinheiro', texto: 'Quais categorias de despesa mais pesaram em [mês]?' },
      { titulo: 'Evolução', texto: 'Compare receitas e despesas dos últimos 6 meses.' },
      { titulo: 'Contas a vencer', texto: 'Quais parcelas vencem nos próximos 15 dias?' },
      { titulo: 'Lançar despesa', texto: 'Lance uma despesa de R$ [valor] com [descrição], categoria [categoria], paga hoje.', pedeConfirmacao: true },
      { titulo: 'Lançar receita', texto: 'Lance uma receita de R$ [valor] de [cliente/descrição], em [número] parcelas, a primeira hoje.', pedeConfirmacao: true },
      { titulo: 'Dar baixa', texto: 'Marque como paga a parcela de [descrição] deste mês.', pedeConfirmacao: true },
      { titulo: 'Corrigir lançamento', texto: 'Corrija o valor da despesa [descrição] para R$ [valor].', pedeConfirmacao: true },
    ],
  },
  {
    id: 'clientes',
    titulo: 'Clientes e conta',
    descricao: 'Base de clientes e créditos do Duo.',
    comandos: [
      { titulo: 'Achar cliente', texto: 'Busque o cliente [nome] e me mostre mensalidade, vencimento e situação do pagamento.' },
      { titulo: 'Pagamentos pendentes', texto: 'Liste os clientes com pagamento pendente.' },
      { titulo: 'Saldo do Duo', texto: 'Quanto tenho de crédito no Duo?' },
    ],
  },
  {
    id: 'ajuda',
    titulo: 'Textos e ajuda',
    descricao: 'Scripts de venda e dúvidas sobre o sistema.',
    comandos: [
      { titulo: 'Script de abordagem', texto: 'Monte um script de primeira abordagem no WhatsApp para [tipo de cliente] que chegou pelo [origem].' },
      { titulo: 'Quebrar objeção', texto: 'O lead disse "[objeção]". Me dê 3 jeitos de responder.' },
      { titulo: 'Como usar uma tela', texto: 'Como eu [conecto o WhatsApp / importo uma planilha / crio uma cadência]?' },
    ],
  },
]
