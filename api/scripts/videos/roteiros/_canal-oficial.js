/**
 * Faz a conta demo parecer conectada ao número oficial (Cloud API), com dois modelos
 * aprovados fictícios. Só a tela muda: nada é enviado (o gerador responde todo não-GET).
 * Uso no roteiro: `simular: canalOficial`.
 */
const MODELO = (nome, corpo) => ({
  id: `demo-${nome}`, nome, idioma: 'pt_BR', categoria: 'MARKETING', status: 'APPROVED', formato: 'POSITIONAL',
  cabecalho: null, corpo, rodape: null, botoes: [], variaveis: ['{{1}}'], variavelCabecalho: null,
  suportado: true, motivoNaoSuportado: null, motivoRecusa: null,
});

module.exports = [
  [/\/whatsapp\/canal(\?|$)/, (c) => ({ ...c, provedor: 'cloud_api', numero: '+55 11 3000-0031', nomeExibicao: 'Clínica Demo', conectado: true, qualidade: 'GREEN', erro: null })],
  [/\/whatsapp\/canal\/modelos/, (r) => ({ ...r, modelos: [
    MODELO('retomada_conversa', 'Oi {{1}}! Passando para saber se ficou alguma dúvida. Posso te ajudar?'),
    MODELO('lembrete_proposta', 'Oi {{1}}, tudo bem? Conseguiu ver a proposta que te mandei?'),
  ] })],
];
