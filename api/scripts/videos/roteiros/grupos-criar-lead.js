/**
 * Grupos → Criar lead (093, só QR): quem entra no grupo vira card no funil e etapa escolhidos.
 * A demo não tem chip: canal, grupos, equipe e a regra salva são simulados. Nada é gravado.
 */
const { ENCERRAMENTO } = require('./_comum');

const MODAL = '.fixed.inset-0.z-50';
const GRUPOS = [
  ['Workshop Vendas 2027 · Turma 1', 212], ['Workshop Vendas 2027 · Turma 2', 187], ['Clientes Clínica Vida Leve', 64], ['Equipe comercial', 8],
].map(([nome, participantes], i) => ({ id: `1203630000000${i}@g.us`, nome, participantes, soAdminsEnviam: false, souAdmin: true, descricao: null }));
const EQUIPE = [
  { id: 55, nome: 'Ana Ribeiro', email: 'ana@demo.duofuturo.tech' },
  { id: 9101, nome: 'Bruno Costa', email: 'bruno@demo.duofuturo.tech' },
  { id: 9102, nome: 'Carla Mendes', email: 'carla@demo.duofuturo.tech' },
];
const REGRA = {
  grupo_id: GRUPOS[0].id, grupo_nome: GRUPOS[0].nome, funil_id: 42, funil_nome: 'Comercial', estagio_id: 277, estagio_nome: 'Novos Leads',
  responsavel_id: null, responsavel_nome: null, distribuir_entre: [9101, 9102], distribuir_nomes: ['Bruno Costa', 'Carla Mendes'],
  origem: 'Workshop', ativa: true,
};

// Os <Select> do modal não ligam label ao campo: marca cada um pelo texto do label.
const marcarSelects = (h) => h.p.evaluate((m) => {
  for (const l of document.querySelectorAll(`${m} label`)) {
    const campo = l.parentElement?.querySelector('select, input');
    if (campo) campo.setAttribute('data-campo', l.innerText.trim());
  }
}, MODAL);

module.exports = {
  canal: 'todos', // Grupos usam o chip por QR, mas valem também para quem tem o oficial (Enterprise)
  titulo: 'Como transformar quem entra no grupo em lead',
  rota: '/crm',
  simular: [
    [/\/grupos\/canal/, () => ({ provedor: 'baileys', conectado: true, numero: '5511999990000' })],
    [/\/grupos\/lista/, () => GRUPOS],
    [/\/grupos\/mensagens$/, () => []],
    [/\/grupos\/boas-vindas$/, () => []],
    [/\/grupos\/crm$/, () => []],
    [/\/crm\/usuarios$/, () => EQUIPE],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como fazer quem entra num grupo do WhatsApp virar lead no CRM, sozinho, na hora em que entra.',
      acao: (h) => h.cartaz('Quem entra no grupo vira lead', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No menu, clique em Grupos, e abra a aba Criar lead. Depois, clique em Nova regra.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'Grupos', { ms: 900 });
        await h.dorme(1300);
        await h.clicar('button', 'Criar lead', { ms: 800 });
        await h.dorme(900);
        await h.clicar('button', 'Nova regra', { ms: 800 });
        await h.dorme(1000);
        await marcarSelects(h);
      },
    },
    {
      fala: 'Escolha o grupo. Se você tem muitos, digite parte do nome em Buscar grupo.',
      acao: async (h) => {
        await h.clicar(`${MODAL} [data-campo="Buscar grupo"]`, '', { ms: 600 });
        await h.digitar('turma 1', 70);
        await h.dorme(500);
        await h.escolher(`${MODAL} [data-campo="Grupo"]`, GRUPOS[0].nome);
      },
    },
    {
      fala: 'Agora o funil e a etapa onde o card vai nascer. Se deixar a etapa em branco, ele entra na primeira etapa do funil.',
      acao: async (h) => {
        await h.escolher(`${MODAL} [data-campo="Funil"]`, 'Comercial');
        await h.dorme(900);
        await marcarSelects(h);
        await h.escolher(`${MODAL} [data-campo="Etapa"]`, 'Novos Leads');
      },
    },
    {
      fala: 'Em Responsável, os leads podem ficar com você, com uma pessoa da equipe, ou em rodízio. No rodízio, marque quem participa, e os leads se dividem por igual.',
      acao: async (h) => {
        await h.escolher(`${MODAL} [data-campo="Responsável"]`, 'Rodízio');
        await h.dorme(800);
        await h.clicar(`${MODAL} fieldset label`, 'Bruno Costa', { ms: 600 });
        await h.dorme(250);
        await h.clicar(`${MODAL} fieldset label`, 'Carla Mendes', { ms: 600 });
        await h.dorme(400);
        await h.destacar(`${MODAL} fieldset`, '', { folga: 4 });
      },
    },
    {
      fala: 'Em Origem no card, escreva de onde a pessoa veio. Assim você filtra esses leads depois no quadro.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${MODAL} [data-campo="Origem no card"]`, '', { ms: 600 });
        await h.digitar('Workshop', 70);
      },
    },
    {
      fala: 'Quem já está no funil não ganha card repetido, só uma anotação. Clique em Salvar, e a regra aparece na lista, ligada. Para pausar, é só desligar a chave.',
      acao: async (h) => {
        h.simular(/\/grupos\/crm$/, () => [REGRA]);
        await h.clicar(`${MODAL} button`, 'Salvar', { ms: 700 });
        await h.dorme(1500);
        await h.destacar('li', GRUPOS[0].nome, { folga: 4 }).catch(() => {});
      },
    },
    ENCERRAMENTO,
  ],
};
