/**
 * Lançar uma receita parcelada: descrição, cliente, vencimento, valor, parcelado em 3x.
 * O "Criar" não grava nada: h.simular() faz o GET das receitas devolver a nova no topo.
 */
const RECEITAS = /\/receitas\?/;
const novaReceita = (r) => {
  if (!Array.isArray(r?.data) || !r.data.length) return r;
  const base = r.data[0];
  return { ...r, total: (r.total || 0) + 1, data: [{ ...base, id: 'video-1', descricao: 'Consultoria — Helena Marques', valor: '3000.00',
    data: '2026-10-15T00:00:00.000Z', parcelado: true, numero_parcelas: 3, tipo_pagamento: 'parcelado', status: 'pendente', recebido: false,
    cliente_nome: 'Helena Marques', fonte: 'Outros' }, ...r.data] };
};
const rolarAte = (h, sel) => h.p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), sel);

module.exports = {
  canal: 'todos', // 'todos' | 'qr' (Profissional, e Enterprise no QR) | 'oficial'
  titulo: 'Como lançar uma receita parcelada',
  rota: '/receitas',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como lançar uma receita no financeiro do Duo, à vista ou parcelada.',
      acao: (h) => h.cartaz('Como lançar uma receita parcelada', 'Menos de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Em Receitas, clique em Nova Receita.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.clicar('button', 'Nova Receita', { ms: 900 }); },
    },
    {
      fala: 'Escreva uma descrição que ajude a achar depois, como o serviço e o nome do cliente.',
      acao: async (h) => { await h.dorme(500); await h.clicar('input[name=descricao]', '', { ms: 700 }); await h.digitar('Consultoria — Helena Marques', 55); },
    },
    {
      fala: 'Escolha o cliente. Assim, a receita fica ligada a ele, e dá para mandar a cobrança por e-mail.',
      acao: async (h) => { await h.destacar('select[name=cliente_id]', '', { folga: 6 }); await h.escolher('select[name=cliente_id]', 'Helena Marques'); },
    },
    {
      fala: 'Agora, a data de vencimento e o valor total do serviço.',
      acao: async (h) => {
        await h.semDestaque();
        await rolarAte(h, 'input[name=valor]'); await h.dorme(600);
        await h.clicar('input[name=data]', '', { ms: 700 });
        for (let i = 0; i < 3; i++) await h.p.keyboard.press('ArrowLeft');
        await h.digitar('15102026', 90);
        await h.clicar('input[name=valor]', '', { ms: 700 });
        await h.digitar('3000', 100);
      },
    },
    {
      fala: 'Em Tipo de pagamento, escolha Parcelado e diga em quantas vezes. Vou colocar três.',
      acao: async (h) => {
        await rolarAte(h, 'select[name=tipo_pagamento]'); await h.dorme(600);
        await h.escolher('select[name=tipo_pagamento]', 'Parcelado');
        await h.dorme(500);
        await rolarAte(h, 'input[name=numero_parcelas]'); await h.dorme(500);
        await h.clicar('input[name=numero_parcelas]', '', { ms: 700 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('a'); await h.p.keyboard.up('Control');
        await h.digitar('3', 120);
      },
    },
    {
      fala: 'O Duo divide o valor e cria cada parcela com o vencimento de um mês depois do outro.',
      acao: (h) => h.destacar('input[name=numero_parcelas]', '', { folga: 6 }),
    },
    {
      fala: 'Clique em Criar. A receita entra na lista, e as parcelas aparecem na tela de Parcelas. É lá que você marca cada uma como paga, quando o dinheiro entrar.',
      acao: async (h) => {
        await h.semDestaque();
        h.simular(RECEITAS, novaReceita);
        await h.clicar('button[type=submit]', 'Criar', { ms: 900 });
        await h.dorme(1500);
        await rolarAte(h, 'table');
        await h.dorme(900);
        await h.destacar('tr', '15/10/2026', { folga: 2 }).catch(() => {});
        await h.dorme(2200);
        await h.semDestaque();
        await h.destacar('a', 'Parcelas', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
      pausa: 1200,
    },
  ],
};
