/**
 * Conectar o Asaas em Receitas (105) e ver onde as cobranças aparecem: Receitas, Clientes,
 * Despesas (taxa), Parcelas (a receber do cartão) e o quadro "A receber daqui para frente"
 * do Dashboard. Nada é gravado: o conectar é respondido pelo gerador e as listas recebem,
 * por h.simular(), o que a importação traria. Nomes e valores fictícios.
 */
const STATUS = /\/asaas-receitas\/status/;
const RECEITAS = /\/receitas\?/;
const CLIENTES = /\/clientes(\?|$)/;
const DESPESAS = /\/despesas\?/;
const PARCELAS = /\/parcelas\/receitas/;
const DASHBOARD = /\/dashboard(\?|$)/;

const CONECTADO = {
  conectado: true, conta_nome: 'Studio Aurora Ltda', conta_cnpj: '12345678000190', importar_desde: '2026-01-01',
  ultima_sync_em: new Date().toISOString(), webhook_ativo: true, erro: null, receitas: 48, receitas_pagas: 36, valor_pago: 21480,
};
const COBRANCAS = [
  { cli: 'Marina Duarte', desc: 'Mentoria individual — Marina Duarte', valor: '1200.00', data: '2026-10-05', status: 'pago' },
  { cli: 'Carlos Mendes', desc: 'Plano anual (parcela 2) — Carlos Mendes', valor: '397.00', data: '2026-11-10', status: 'pendente' },
  { cli: 'Juliana Prado', desc: 'Workshop presencial — Juliana Prado', valor: '590.00', data: '2026-10-03', status: 'pago' },
];
const comoLista = (r, novos) => (Array.isArray(r?.data) && r.data.length ? { ...r, total: (r.total || 0) + novos.length, data: [...novos.map((n) => ({ ...r.data[0], ...n })), ...r.data] } : r);
const receitas = (r) => comoLista(r, COBRANCAS.map((c, i) => ({ id: `asaas-${i}`, descricao: c.desc, valor: c.valor, data: `${c.data}T00:00:00.000Z`,
  fonte: 'Asaas', tipo_pagamento: 'a_vista', parcelado: false, numero_parcelas: null, status: c.status, recebido: c.status === 'pago', cliente_nome: c.cli })));
// A lista de Clientes chega como array ou como página ({ data: [...] }), conforme a tela.
const novosClientes = (base) => COBRANCAS.map((c, i) => ({ ...base, id: 9000 + i, codigo: `ASAAS-cus_00${i}`, nome: c.cli, cpf_cnpj: `1234567890${i}`,
  email: `${c.cli.split(' ')[0].toLowerCase()}@exemplo.com.br`, servico: 'Asaas', status_pagamento: 'em_dia' }));
const clientes = (r) => (Array.isArray(r) && r.length ? [...novosClientes(r[0]), ...r]
  : Array.isArray(r?.data) && r.data.length ? { ...r, total: (r.total || 0) + 3, data: [...novosClientes(r.data[0]), ...r.data] } : r);
const despesas = (r) => comoLista(r, [{ id: 'asaas-taxa', descricao: 'Taxa Asaas — Mentoria individual — Marina Duarte', valor: '19.90',
  data: '2026-10-05T00:00:00.000Z', categoria: 'Taxa Asaas', status: 'pago', pago: true, tipo_pagamento: 'a_vista' }]);
const parcelas = (r) => (Array.isArray(r) && r.length ? [...[['2026-11-10', 1], ['2026-12-10', 2], ['2027-01-10', 3]].map(([d, i]) => ({ ...r[0],
  id: `asaas-p${i}`, numero_parcela: 1, total_parcelas: 1, valor: 397, data_vencimento: `${d}T00:00:00.000Z`, data_pagamento: null, status: 'PENDENTE',
  receita_descricao: `Plano anual (parcela ${i + 1}) — Carlos Mendes`, cliente_nome: 'Carlos Mendes' })), ...r] : r);
const dashboard = (r) => ({ ...r, aReceberFuturo: { total: 4764, parcelas: 12, porMes: [
  { mes: '2026-10', valor: 1588, parcelas: 4 }, { mes: '2026-11', valor: 1191, parcelas: 3 }, { mes: '2026-12', valor: 1191, parcelas: 3 }, { mes: '2027-01', valor: 794, parcelas: 2 }] } });

const rolarAte = (h, sel, texto) => h.p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => !t || e.textContent.includes(t));
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, sel, texto || '');
const menu = async (h, nome) => { await h.semDestaque(); await h.clicar('a', nome, { ms: 900, dentro: 'aside' }); await h.dorme(1600); };

module.exports = {
  canal: 'todos',
  titulo: 'Como conectar o Asaas às suas receitas',
  rota: '/receitas',
  responder: [[/\/asaas-receitas\/conectar/, CONECTADO]],
  // Clientes desde o início: a tela de Receitas já carrega a lista e o Duo reaproveita essa cópia.
  simular: [[CLIENTES, clientes]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar o Asaas ao Duo, para as suas cobranças virarem receitas sozinhas.',
      acao: (h) => h.cartaz('Como conectar o Asaas às suas receitas', 'Cerca de 2 minutos'),
      pausa: 300,
    },
    {
      fala: 'Em Receitas, clique no botão Asaas.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.clicar('button', 'Asaas', { ms: 900 }); await h.dorme(900); },
    },
    {
      fala: 'Primeiro, pegue a chave no Asaas: no menu Integrações, entre em Chaves de API, gere uma chave nova e copie.',
      acao: (h) => h.destacar('li', 'No Asaas', { folga: 6 }),
    },
    {
      fala: 'Cole a chave aqui. Ela começa com cifrão a a c t.',
      acao: async (h) => { await h.semDestaque(); await h.clicar('input[type=password]', '', { ms: 700 }); await h.digitar('$aact_prod_000exemploDaChaveDoVideo', 25); },
    },
    {
      fala: 'Escolha a partir de quando importar. O Duo traz as cobranças com vencimento desde essa data.',
      acao: (h) => h.destacar('input[type=date]', '', { dentro: '.fixed.inset-0', folga: 6 }),
    },
    {
      fala: 'Clique em Conectar Asaas. O Duo confere a chave e mostra o nome da conta, para você ter certeza de que é a sua.',
      acao: async (h) => {
        await h.semDestaque();
        h.simular(STATUS, () => CONECTADO);
        await h.clicar('button[type=submit]', 'Conectar Asaas', { ms: 900 });
        await h.dorme(1800);
        await h.destacar('p', 'Conectado a', { folga: 6 }).catch(() => {});
      },
    },
    {
      fala: 'Pronto. A partir de agora, cada cobrança vira receita, e quando o cliente paga, ela já fica como recebida, na hora.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('p', 'Cada cobrança', { folga: 6 }).catch(() => {}); },
      pausa: 600,
    },
    {
      fala: 'Veja as cobranças na lista de Receitas, com a categoria Asaas e o nome do cliente.',
      acao: async (h) => {
        await h.semDestaque();
        h.simular(RECEITAS, receitas);
        await h.p.keyboard.press('Escape'); await h.dorme(400);
        await h.p.evaluate(() => document.querySelectorAll('.fixed.inset-0 button[aria-label], .fixed.inset-0 button').forEach((b) => { if (/fechar|×|✕/i.test(b.getAttribute('aria-label') || b.textContent)) b.click(); }));
        await h.recarregar(); await h.dorme(1500);
        await rolarAte(h, 'td', 'Marina Duarte'); await h.dorme(800);
        await h.destacar('tr', '05/10/2026', { folga: 2 }).catch(() => {});
      },
      pausa: 600,
    },
    {
      fala: 'Usa também o Conta Azul? Pode conectar os dois. Se a mesma cobrança estiver nos dois, com o mesmo cliente, o mesmo valor e o mesmo vencimento, ela entra uma vez só, sem receita em dobro.',
      acao: async (h) => { await h.semDestaque(); await rolarAte(h, 'button', 'Conta Azul'); await h.dorme(500); await h.destacar('button', 'Conta Azul', { folga: 6 }).catch(() => {}); },
      pausa: 500,
    },
    {
      fala: 'Quem pagou entra sozinho em Clientes. Se a pessoa já estava cadastrada, o Duo encontra pelo C P F ou pelo e-mail e não duplica.',
      acao: async (h) => {
        await menu(h, 'Clientes');
        await h.destacar('td', 'Marina Duarte', { folga: 6 }).catch(() => h.destacar('h3', 'Marina Duarte', { folga: 8 }).catch(() => {}));
      },
      pausa: 600,
    },
    {
      fala: 'A taxa que o Asaas cobra entra em Despesas, para o seu lucro ficar real.',
      acao: async (h) => {
        h.simular(DESPESAS, despesas);
        await menu(h, 'Despesas');
        await rolarAte(h, 'td', 'Taxa Asaas'); await h.dorme(700);
        await h.destacar('td', 'Taxa Asaas', { folga: 6 }).catch(() => {});
      },
      pausa: 600,
    },
    {
      fala: 'Em Parcelas, as parcelas do cartão aparecem como a receber até o dinheiro cair na sua conta.',
      acao: async (h) => {
        h.simular(PARCELAS, parcelas);
        await menu(h, 'Parcelas');
        await rolarAte(h, 'td', 'Carlos Mendes'); await h.dorme(700);
        await h.destacar('td', 'Carlos Mendes', { folga: 6 }).catch(() => {});
      },
      pausa: 600,
    },
    {
      fala: 'E no Dashboard, o quadro A receber daqui para frente mostra o total e o valor de cada mês.',
      acao: async (h) => {
        h.simular(DASHBOARD, dashboard);
        await menu(h, 'Dashboard');
        // O Dashboard renovado (08/10) demora mais a carregar: espera o quadro existir antes de rolar.
        await h.p.waitForFunction(() => [...document.querySelectorAll('h2')].some((e) => e.textContent.includes('A receber daqui para frente')), { timeout: 10000 }).catch(() => {});
        await rolarAte(h, 'h2', 'A receber daqui para frente'); await h.dorme(900);
        await h.destacar('h2', 'A receber daqui para frente', { folga: 8 }).catch(() => {});
      },
      pausa: 900,
    },
    {
      fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
      pausa: 1200,
    },
  ],
};
