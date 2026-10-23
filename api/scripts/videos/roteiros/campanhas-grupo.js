/**
 * Grupos → Campanhas (089, Enterprise, chips por QR): um link que distribui as pessoas entre
 * vários grupos, abre grupo novo quando lota e transforma quem entra em lead.
 * A demo não tem chip: chips, campanha criada, grupos e painel são simulados. Nada é criado.
 */
const { ENCERRAMENTO } = require('./_comum');

const MODAL = '.fixed.inset-0.z-50';
const ID = 77;
const agora = new Date();
const dia = (d) => new Date(agora.getTime() - d * 864e5).toISOString().slice(0, 10);
const EQUIPE = [
  { id: 55, nome: 'Ana Ribeiro', email: 'ana@demo.duofuturo.tech' },
  { id: 9101, nome: 'Bruno Costa', email: 'bruno@demo.duofuturo.tech' },
];
const CHIPS = [{ id: 55, nome: 'Ana Ribeiro', porta: 3099 }, { id: 9101, nome: 'Bruno Costa', porta: 3098 }];
const BASE = {
  id: ID, nome: 'Lançamento Outubro', slug: 'lancamento-outubro', limite_por_grupo: 900, chips: [55, 9101], criar_grupos: true,
  nome_grupo_modelo: 'Lançamento Outubro {{n}}', descricao_grupo: null, so_admins_enviam: true, criar_lead: true,
  funil_id: 42, funil_nome: 'Comercial', estagio_id: 277, responsavel_id: null, origem: 'Lançamento Outubro', ativa: true,
  total_grupos: 3, total_participantes: 1968, total_cliques: 2431, total_entradas: 2012, total_saidas: 44, created_at: agora.toISOString(),
};
const GRUPOS = [[1, 897, true, 55], [2, 884, true, 9101], [3, 187, false, 55]].map(([n, participantes, cheio, chip]) => ({
  id: n, grupo_id: `1203630001000${n}@g.us`, nome: `Lançamento Outubro ${n}`, convite: `Demo${n}Convite`, participantes,
  participantes_em: agora.toISOString(), ordem: n, cheio, ativo: true, criado_pela_campanha: true, usuario_id: chip,
  chip_nome: chip === 55 ? 'Ana Ribeiro' : 'Bruno Costa',
}));
const POR_DIA = [[6, 210, 180, 3], [5, 340, 296, 6], [4, 512, 430, 9], [3, 488, 401, 11], [2, 455, 371, 8], [1, 262, 214, 4], [0, 164, 120, 3]]
  .map(([d, cliques, entradas, saidas]) => ({ dia: dia(d), cliques, entradas, saidas }));
const PAINEL = {
  periodo: { inicio: dia(29), fim: dia(0) },
  totais: { cliques: 2431, entradas: 2012, saidas: 44, leads: 1968 },
  porDia: [...POR_DIA].reverse(),
  porUtm: [{ origem: 'instagram', cliques: 1320 }, { origem: 'email', cliques: 688 }, { origem: '(sem origem)', cliques: 423 }],
  porGrupo: GRUPOS.map((g) => ({ grupo_id: g.grupo_id, nome: g.nome, entradas: g.participantes + 10, saidas: 10 })),
  leads: 1968,
};

module.exports = {
  canal: 'todos', // Grupos usam o chip por QR, mas valem também para quem tem o oficial (Enterprise)
  titulo: 'Como criar uma campanha de grupos com um link só',
  rota: '/crm',
  simular: [
    [/\/grupos\/canal/, () => ({ provedor: 'baileys', conectado: true, numero: '5511999990000' })],
    [/\/grupos\/lista/, () => []],
    [/\/grupos\/mensagens$/, () => []],
    [/\/grupos\/boas-vindas$/, () => []],
    [/\/grupos\/crm$/, () => []],
    [/\/grupos\/chips/, () => CHIPS],
    [/\/grupos\/campanhas$/, () => []],
    [/\/crm\/usuarios$/, () => EQUIPE],
  ],
  responder: [[/\/grupos\/campanhas$/, { id: ID }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como criar uma campanha de grupos: um link só para divulgar, que distribui as pessoas entre vários grupos e abre um grupo novo quando o atual enche.',
      acao: (h) => h.cartaz('Campanhas de grupo', 'Cerca de 1 minuto e meio · plano Enterprise'),
      pausa: 300,
    },
    {
      fala: 'No menu, clique em Grupos, abra a aba Campanhas, e clique em Nova campanha.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('a', 'Grupos', { ms: 900 });
        await h.dorme(1300);
        await h.clicar('button', 'Campanhas', { ms: 800 });
        await h.dorme(900);
        await h.clicar('button', 'Nova campanha', { ms: 800 });
        await h.dorme(1000);
      },
    },
    {
      fala: 'Dê um nome. O endereço do link já é sugerido a partir dele, e é esse link que você vai divulgar.',
      acao: async (h) => {
        await h.clicar(`${MODAL} input[placeholder^="Ex.: Lançamento"]`, '', { ms: 600 });
        await h.digitar('Lançamento Outubro', 60);
        await h.dorme(500);
        await h.destacar(`${MODAL} p.break-all`, '', { folga: 4 });
      },
    },
    {
      fala: 'Marque os WhatsApps da campanha. São eles que criam os grupos novos e entram como administradores. Com mais de um, o volume se divide, e o risco de bloqueio também.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${MODAL} button[aria-pressed]`, 'Bruno Costa', { ms: 700 });
        await h.dorme(400);
        await h.destacar(`${MODAL} fieldset`, 'WhatsApps', { folga: 4 });
      },
    },
    {
      fala: 'Defina quantas pessoas cabem em cada grupo, e o nome dos grupos. O n entre chaves vira o número: Lançamento Outubro 1, 2, 3, e assim por diante.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${MODAL} input[type=number]`, '', { ms: 600 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('a'); await h.p.keyboard.up('Control');
        await h.digitar('900', 90);
        await h.dorme(400);
        await h.clicar(`${MODAL} input[placeholder$="{{n}}"]`, '', { ms: 600 });
        await h.digitar('Lançamento Outubro {{n}}', 50);
      },
    },
    {
      fala: 'Com Abrir grupo novo sozinho, o Duo cria o próximo grupo quando os outros estão quase cheios. E, marcando Quem entrar vira lead, cada pessoa ganha um card no funil que você escolher.',
      acao: async (h) => {
        await h.p.evaluate((m) => document.querySelector(`${m} #desc-grupo`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), MODAL);
        await h.dorme(800);
        await h.destacar(`${MODAL} label`, 'Abrir grupo novo', { folga: 4 });
        await h.dorme(2000);
        await h.semDestaque();
        await h.clicar(`${MODAL} label`, 'Quem entrar vira lead', { ms: 700 });
        await h.dorme(800);
        await h.p.evaluate((m) => {
          for (const l of document.querySelectorAll(`${m} label`)) { const c = l.parentElement?.querySelector('select'); if (c) c.setAttribute('data-campo', l.innerText.trim()); }
        }, MODAL);
        await h.escolher(`${MODAL} [data-campo="Funil"]`, 'Comercial');
      },
    },
    {
      fala: 'Clique em Criar campanha. Na página dela ficam o link para copiar, os grupos, com a ocupação de cada um, e os números: cliques, entradas, saídas e leads.',
      acao: async (h) => {
        h.simular(/\/grupos\/campanhas$/, () => [BASE]);
        h.simular(new RegExp(`/grupos/campanhas/${ID}$`), () => ({ ...BASE, grupos: GRUPOS }));
        h.simular(new RegExp(`/grupos/campanhas/${ID}/painel`), () => PAINEL);
        await h.clicar(`${MODAL} button`, 'Criar campanha', { ms: 700 });
        await h.dorme(1800);
        await h.destacar('button', 'Copiar', { folga: 5 }).catch(() => {});
        await h.dorme(1800);
        await h.semDestaque();
        await h.p.evaluate(() => [...document.querySelectorAll('h3')].find((e) => e.innerText.startsWith('Grupos da campanha'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(1000);
        await h.destacar('[role=progressbar]', '', { folga: 6 }).catch(() => {});
      },
    },
    {
      fala: 'Mais abaixo, o Movimento mostra, dia a dia, quem clicou, entrou e saiu, e de onde veio o clique. Divulgue o link, e o resto acontece sozinho.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => [...document.querySelectorAll('h3')].find((e) => e.innerText.includes('Movimento'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(1200);
        await h.destacar('h3', 'Movimento', { folga: 6 }).catch(() => {});
      },
    },
    ENCERRAMENTO,
  ],
};
