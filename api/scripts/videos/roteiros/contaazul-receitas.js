/**
 * Conectar o Conta Azul em Receitas e Despesas (106/107, 09/10/2026). O login acontece no site do
 * Conta Azul, que não é gravável: aparece como cartaz neutro, e a volta é simulada pelo endereço
 * `?contaazul=ok` (o mesmo que o callback devolve). Status, receitas e despesas vêm do h.simular();
 * nada é gravado. Nomes e valores fictícios.
 */
const { rolarAte, ENCERRAMENTO } = require('./_comum');

const STATUS = /\/contaazul-financeiro\/status/;
const RECEITAS = /\/receitas\?/;
const DESPESAS = /\/despesas\?/;

const SEM_CONTA = { disponivel: true, contas: [] };
const CONECTADO = {
  disponivel: true,
  contas: [{
    conexao_id: 1, nome: 'Studio Aurora Ltda', documento: '12345678000190', importando: true,
    importar_desde: '2026-01-01', importar_ate: null, receitas: 214, despesas: 97, ja_no_asaas: 12,
    ultima_sync_em: new Date().toISOString(), ultima_alteracao_em: new Date().toISOString(),
    precisa_reconectar: false, erro: null,
  }],
};

const comoLista = (r, novos) => (Array.isArray(r?.data) && r.data.length
  ? { ...r, total: (r.total || 0) + novos.length, data: [...novos.map((n) => ({ ...r.data[0], ...n })), ...r.data] } : r);
const receitas = (r) => comoLista(r, [
  { cli: 'Marina Duarte', desc: 'Mentoria individual', fonte: 'Mentoria', valor: '1200.00', data: '2026-10-05', pago: true },
  { cli: 'Carlos Mendes', desc: 'Plano anual', fonte: 'Plano anual', valor: '397.00', data: '2026-11-10', pago: false },
  { cli: 'Juliana Prado', desc: 'Workshop presencial', fonte: 'Workshop', valor: '590.00', data: '2026-10-03', pago: true },
].map((c, i) => ({ id: `ca-${i}`, descricao: c.desc, valor: c.valor, data: `${c.data}T00:00:00.000Z`, fonte: c.fonte, produto: 'Studio Aurora Ltda',
  tipo_pagamento: 'a_vista', parcelado: false, numero_parcelas: null, status: c.pago ? 'pago' : 'pendente', recebido: c.pago, cliente_nome: c.cli })));
const despesas = (r) => comoLista(r, [
  { desc: 'Aluguel da sala', cat: 'Aluguel', valor: '2500.00', data: '2026-10-05', pago: true },
  { desc: 'Contador', cat: 'Serviços contábeis', valor: '650.00', data: '2026-10-10', pago: false },
].map((d, i) => ({ id: `ca-d${i}`, descricao: d.desc, valor: d.valor, data: `${d.data}T00:00:00.000Z`, categoria: d.cat,
  instituicao: 'Studio Aurora Ltda', origem: 'contaazul', status: d.pago ? 'pago' : 'pendente', pago: d.pago, tipo_pagamento: 'a_vista' })));

// Fecha a janela pelo X (o Esc não fecha o Modal do Duo).
const fechar = async (h) => { await h.semDestaque(); await h.clicar('.fixed.inset-0 button[data-tour=modal-fechar]', '', { ms: 700 }); };
const menu = async (h, nome) => { await h.semDestaque(); await h.clicar('a', nome, { ms: 900, dentro: 'aside' }); await h.dorme(1600); };

module.exports = {
  canal: 'todos',
  titulo: 'Como conectar o Conta Azul às suas receitas e despesas',
  rota: '/receitas',
  simular: [[STATUS, () => SEM_CONTA]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como conectar o Conta Azul ao Duo, para as suas contas a receber e a pagar entrarem sozinhas.',
      acao: (h) => h.cartaz('Como conectar o Conta Azul às suas receitas e despesas', 'Cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'Em Receitas, ou em Despesas, clique no botão Conta Azul.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.clicar('button', 'Conta Azul', { ms: 900 }); await h.dorme(1200); },
    },
    {
      fala: 'Escolha a partir de quando importar. O Duo traz os lançamentos com vencimento desde essa data.',
      acao: (h) => h.destacar('input[type=date]', '', { dentro: '.fixed.inset-0', folga: 6 }),
    },
    {
      fala: 'Clique em Entrar no Conta Azul. Não precisa copiar chave nenhuma.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('button', 'Entrar no Conta Azul', { dentro: '.fixed.inset-0', folga: 6 }); },
    },
    {
      fala: 'Abre a página do Conta Azul: entre com o seu e-mail e a sua senha e autorize o Duo. O seu login fica só no Conta Azul.',
      acao: async (h) => { await h.semDestaque(); await h.cartaz('Na página do Conta Azul', 'Entre com o seu e-mail e senha e autorize o Duo'); },
      pausa: 400,
    },
    {
      fala: 'Você volta para o Duo sozinho, com a conta conectada, e os lançamentos começam a entrar.',
      acao: async (h) => {
        h.simular(STATUS, () => CONECTADO);
        h.simular(RECEITAS, receitas);
        await h.p.evaluate(() => history.replaceState(null, '', '/gestao/receitas?contaazul=ok&conta=Studio%20Aurora%20Ltda'));
        await h.recarregar();
        await h.tirarCartaz();
        // Cursor fora do aviso: parado em cima, o aviso não some e cobre o botão Conta Azul.
        await h.ir(760, 560, 500);
        await h.dorme(1000);
        await h.destacar('li', 'Studio Aurora', { folga: 4 }).catch(() => {});
      },
      pausa: 600,
    },
    {
      fala: 'As contas a receber viram receitas, e as contas a pagar viram despesas, já com o cliente e o produto.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('p', 'Importando', { dentro: '.fixed.inset-0', folga: 6 }).catch(() => {}); },
    },
    {
      fala: 'Usa também o Asaas? Pode conectar os dois. Se a mesma cobrança estiver nos dois, ela entra uma vez só.',
      acao: async (h) => { await h.semDestaque(); await h.destacar('p', 'Pode usar junto com o Asaas', { dentro: '.fixed.inset-0', folga: 6 }).catch(() => {}); },
      pausa: 400,
    },
    {
      fala: 'Veja as receitas na lista, com o nome do cliente.',
      acao: async (h) => {
        await h.semDestaque();
        await fechar(h); await h.dorme(600);
        await rolarAte(h, 'td', 'Marina Duarte'); await h.dorme(800);
        await h.destacar('td', 'Mentoria individual', { folga: 6 }).catch(() => {});
      },
      pausa: 500,
    },
    {
      fala: 'E as contas a pagar aparecem em Despesas.',
      acao: async (h) => {
        h.simular(DESPESAS, despesas);
        await menu(h, 'Despesas');
        await rolarAte(h, 'td', 'Aluguel da sala'); await h.dorme(700);
        await h.destacar('td', 'Aluguel da sala', { folga: 6 }).catch(() => {});
      },
      pausa: 500,
    },
    {
      fala: 'O que for pago no Conta Azul fica pago no Duo sozinho, a cada quinze minutos. Se quiser na hora, abra o Conta Azul de novo e clique em Conferir agora.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Conta Azul', { ms: 900 }); await h.dorme(1200);
        await h.destacar('button', 'Conferir agora', { dentro: '.fixed.inset-0', folga: 6 }).catch(() => {});
      },
      pausa: 600,
    },
    ENCERRAMENTO,
  ],
};
