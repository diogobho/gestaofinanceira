import type { NovoModelo } from '@/api/canalWhatsapp'

/**
 * Modelos de abordagem prontos para o número oficial (docs/MODELOS_ABORDAGEM_META.md).
 *
 * Modelo não atravessa conta: cada cliente cria os dele na própria WABA, e começar de
 * uma folha em branco é onde nasce a recusa — UTILITY usado para vender, corpo que é
 * só variável, abordagem que não diz de onde a pessoa veio. Estes já saem no formato
 * que a Meta aprova; a tela os carrega no formulário e o cliente ajusta antes de enviar.
 *
 * Os exemplos são fictícios de propósito: vão para o analista da Meta, não para lead.
 */
export interface ModeloPronto {
  titulo: string
  quando: string
  modelo: Omit<NovoModelo, 'idioma' | 'botoes'>
}

export const MODELOS_PRONTOS: ModeloPronto[] = [
  {
    titulo: 'Retomar formulário',
    quando: 'Quem preencheu um formulário e ainda não foi atendido.',
    modelo: {
      nome: 'retomada_formulario',
      categoria: 'MARKETING',
      corpo:
        'Oi {{1}}, aqui é {{2}} da {{3}}.\n' +
        'Você preencheu o formulário do {{4}} e ficou de receber um retorno nosso — desculpe a demora.\n' +
        'Ainda faz sentido conversar sobre isso? Se preferir, respondo por aqui mesmo.\n' +
        'Se não quiser mais receber mensagens, é só responder SAIR.',
      exemplos: ['Marina', 'Paula', 'Escola Horizonte', 'Desafio 30 Dias'],
    },
  },
  {
    titulo: 'Convite para conversa',
    quando: 'Primeiro toque, sem promessa e sem preço.',
    modelo: {
      nome: 'convite_conversa',
      categoria: 'MARKETING',
      corpo:
        'Oi {{1}}, aqui é {{2}} da {{3}}.\n' +
        'Vi que você entrou no {{4}}. Separei 15 minutos esta semana para entender seu momento e te dizer, com honestidade, se a gente consegue ajudar.\n' +
        'Quer que eu te mande dois horários?\n' +
        'Para não receber mais mensagens, responda SAIR.',
      exemplos: ['Marina', 'Paula', 'Escola Horizonte', 'grupo do Desafio'],
    },
  },
  {
    titulo: 'Reativar conversa parada',
    quando: 'Quem já falou com você e sumiu — a de maior taxa de resposta.',
    modelo: {
      nome: 'retomada_conversa_parada',
      categoria: 'MARKETING',
      corpo:
        'Oi {{1}}, tudo bem? Aqui é {{2}}.\n' +
        'Nossa conversa sobre {{3}} ficou parada e eu não quis deixar passar.\n' +
        'Você quer retomar agora ou prefere que eu procure mais para frente?\n' +
        'Se preferir não receber mais mensagens, responda SAIR.',
      exemplos: ['Marina', 'Paula', 'a mentoria'],
    },
  },
  {
    titulo: 'Entregar material',
    quando: 'Quando existe algo concreto para mandar. Aprova rápido e não parece venda.',
    modelo: {
      nome: 'material_prometido',
      categoria: 'MARKETING',
      corpo:
        'Oi {{1}}, aqui é {{2}} da {{3}}.\n' +
        'Como combinado, aqui está o {{4}}.\n' +
        'Qualquer dúvida, é só responder nesta conversa.',
      exemplos: ['Marina', 'Paula', 'Escola Horizonte', 'guia de primeiros passos'],
    },
  },
  {
    titulo: 'Lembrete de reunião',
    quando: 'Utilidade de verdade: existe um compromisso marcado.',
    modelo: {
      nome: 'lembrete_reuniao',
      categoria: 'UTILITY',
      corpo:
        'Oi {{1}}, passando para lembrar da nossa conversa de {{2}}, às {{3}}.\n' +
        'Se precisar remarcar, responda por aqui que eu ajusto.',
      exemplos: ['Marina', 'amanhã', '14h'],
    },
  },
  {
    titulo: 'Retomar atendimento',
    quando: 'Responder um chamado depois de 24h sem parecer propaganda.',
    modelo: {
      nome: 'retorno_atendimento',
      categoria: 'UTILITY',
      corpo:
        'Oi {{1}}, aqui é o suporte da {{2}}.\n' +
        'Voltando ao seu chamado sobre {{3}}: {{4}}\n' +
        'Se ainda estiver aberto, é só responder por aqui.',
      exemplos: ['Marina', 'Escola Horizonte', 'o acesso à plataforma', 'o problema já foi corrigido'],
    },
  },
]
