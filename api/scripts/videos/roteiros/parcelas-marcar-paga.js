/**
 * Tela de Parcelas: abas, resumo, cores das linhas, filtros, marcar uma parcela como paga
 * e a cobrança das atrasadas. Continua o `lancar-receita`: a consultoria da Helena em 3x.
 * A demo só tem parcelas antigas, então a lista é simulada desde o carregamento (a partir
 * de junho, mais as 3 da consultoria); o "Salvar" não grava — h.simular() devolve a 1/3 paga.
 */
const { ENCERRAMENTO } = require('./_comum');

const PARCELAS = /\/parcelas\/receitas(\?|$)/;
const HELENA = 141;
const consultoria = (n, venc) => ({
  id: `video-p${n}`, receita_id: 'video-1', numero_parcela: n, total_parcelas: 3, valor: '1000.00',
  data_vencimento: `${venc}T00:00:00.000Z`, data_pagamento: null, status: 'PENDENTE',
  receita_descricao: 'Consultoria — Helena Marques', receita_valor_total: '3000.00', receita_fonte: 'Outros',
  cliente_id: HELENA, cliente_nome: 'Helena Marques', origem: null, ultimo_email_enviado: null,
});
const NOVAS = [consultoria(1, '2026-10-15'), consultoria(2, '2026-11-15'), consultoria(3, '2026-12-15')];

// Respeita os filtros da tela: o real já vem filtrado pela API; as simuladas, filtradas aqui.
const lista = (json, url) => {
  if (!Array.isArray(json)) return json;
  const q = new URL(url).searchParams;
  const novas = NOVAS.filter((p) => (!q.get('status') || q.get('status') === p.status)
    && (!q.get('cliente_id') || Number(q.get('cliente_id')) === HELENA));
  return [...json.filter((p) => p.data_vencimento >= '2026-06-01'), ...novas];
};
const paga = (json) => (Array.isArray(json)
  ? json.map((p) => (p.id === 'video-p1' ? { ...p, status: 'PAGO', data_pagamento: '2026-10-13T00:00:00.000Z' } : p))
  : json);

// Marca a linha da tabela que contém os textos (para destacar ou achar o botão dentro dela).
const marcarLinha = (h, textos, attr) => h.p.evaluate((ts, a) => {
  document.querySelectorAll(`[${a}]`).forEach((e) => e.removeAttribute(a));
  const tr = [...document.querySelectorAll('tbody tr')].find((r) => ts.every((t) => r.innerText.includes(t)));
  tr?.setAttribute(a, '1');
  tr?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' }); // inline: o lápis rola a tabela de lado
}, textos, attr);
const MODAL = '.fixed.inset-0';

module.exports = {
  canal: 'todos',
  titulo: 'Como marcar uma parcela como paga',
  rota: '/parcelas',
  simular: [[PARCELAS, lista]],
  passos: [
    {
      fala: 'Neste vídeo, você vai conhecer a tela de Parcelas e ver como marcar uma parcela como paga.',
      acao: (h) => h.cartaz('Como marcar uma parcela como paga', 'Tela de Parcelas · cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Aqui ficam as parcelas das suas receitas e das suas despesas, cada uma na sua aba, com um resumo logo abaixo: quantas são, o valor total, quantas já foram pagas e quantas estão pendentes.',
      acao: async (h) => {
        await h.tirarCartaz();
        await h.destacar('[data-tour=parcelas-abas]', '', { folga: 4 });
        await h.dorme(2600);
        await h.p.evaluate(() => document.querySelector('[data-tour=parcelas-abas]').nextElementSibling.setAttribute('data-v-resumo', '1'));
        await h.destacar('[data-v-resumo]', '', { folga: 6 });
      },
    },
    {
      fala: 'A cor da linha ajuda a bater o olho: vermelha é parcela atrasada, e amarela vence nos próximos sete dias.',
      acao: async (h) => {
        await h.semDestaque();
        await marcarLinha(h, ['Beatriz Fontes', 'ATRASADO'], 'data-v-linha');
        await h.dorme(900);
        await h.destacar('[data-v-linha]', '', { folga: 2 });
        await h.dorme(2600);
        await marcarLinha(h, ['1/3', 'Consultoria'], 'data-v-linha');
        await h.dorme(700);
        await h.destacar('[data-v-linha]', '', { folga: 2 });
      },
    },
    {
      fala: 'Para achar uma parcela rápido, use os filtros. Vou escolher a cliente Helena.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.querySelector('[data-tour=parcelas-filtros]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(900);
        await h.destacar('[data-tour=parcelas-filtros]', '', { folga: 4 });
        await h.dorme(1200);
        // O 2º select do cartão de filtros é o de Cliente (o 1º é Status).
        await h.p.evaluate(() => document.querySelectorAll('[data-tour=parcelas-filtros] select')[1].setAttribute('data-v-cliente', '1'));
        await h.escolher('select[data-v-cliente]', 'Helena Marques');
      },
    },
    {
      fala: 'A Helena pagou hoje a primeira parcela da consultoria. Na linha dela, clique no lápis, em Ações.',
      acao: async (h) => {
        await h.semDestaque();
        await h.dorme(800);
        await marcarLinha(h, ['1/3', 'Consultoria'], 'data-v-linha');
        await h.dorme(900);
        await h.destacar('[data-v-linha]', '', { folga: 2 });
        await h.dorme(1200);
        await h.clicar('[data-v-linha] button[title="Editar parcela"]', '', { ms: 900 });
        await h.semDestaque();
      },
    },
    {
      fala: 'Nesta janela, dá até para corrigir o valor e o vencimento, se o combinado mudou.',
      acao: async (h) => {
        await h.dorme(600);
        await h.p.evaluate((m) => document.querySelector(`${m} input[name=valor]`).closest('.grid').setAttribute('data-v-valores', '1'), MODAL);
        await h.destacar('[data-v-valores]', '', { folga: 6, dentro: MODAL });
      },
    },
    {
      fala: 'Em Status, escolha Pago e preencha a data do pagamento. Ela é obrigatória quando a parcela está paga.',
      acao: async (h) => {
        await h.semDestaque();
        await h.escolher('select[name=status]', 'PAGO', { dentro: MODAL });
        await h.dorme(900);
        await h.destacar('input[name=data_pagamento]', '', { folga: 6, dentro: MODAL });
        await h.clicar('input[name=data_pagamento]', '', { ms: 700, dentro: MODAL });
        for (let i = 0; i < 3; i++) await h.p.keyboard.press('ArrowLeft');
        await h.digitar('13102026', 110);
      },
    },
    {
      fala: 'Clique em Salvar Alteração. A parcela fica verde, como paga, com a data do pagamento, e já entra nos números do Dashboard financeiro.',
      acao: async (h) => {
        await h.semDestaque();
        h.simular(PARCELAS, paga);
        await h.clicar('button[type=submit]', 'Salvar', { ms: 900, dentro: MODAL });
        await h.dorme(1400);
        await marcarLinha(h, ['1/3', 'Consultoria'], 'data-v-linha');
        await h.dorme(600);
        await h.destacar('[data-v-linha]', '', { folga: 2 });
      },
    },
    {
      fala: 'E as atrasadas? Marque a caixinha da parcela e mande a cobrança por e-mail ou por WhatsApp, direto daqui.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.querySelector('[data-tour=parcelas-filtros]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(500);
        await h.clicar('button', 'Limpar Filtros', { ms: 600 });
        await h.dorme(800);
        await marcarLinha(h, ['Beatriz Fontes', 'ATRASADO'], 'data-v-linha');
        await h.dorme(600);
        await h.clicar('[data-v-linha] input[type=checkbox]', '', { ms: 600 });
        await h.dorme(300);
        await h.p.evaluate(() => document.querySelector('[data-tour=parcelas-cobranca]').scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(600);
        await h.destacar('[data-tour=parcelas-cobranca]', '', { folga: 6 });
      },
      pausa: 1800,
    },
    ENCERRAMENTO,
  ],
};
