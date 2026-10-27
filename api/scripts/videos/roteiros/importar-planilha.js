/**
 * Importar leads de uma planilha (CSV/Excel). A planilha é fictícia (`demo/leads-exemplo.csv`);
 * leitura e importação são respondidas localmente — nenhum lead entra na demo.
 */
const fs = require('fs');
const { ENCERRAMENTO } = require('./_comum');

const CSV = '/var/www/apps/landing/assets/videos/tutoriais/demo/leads-exemplo.csv';
const [cab, ...linhas] = fs.readFileSync(CSV, 'utf8').trim().split('\n').map((l) => l.split(','));
const PREVIEW = { colunas: cab, totalLinhas: 124, linhas: linhas.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]]))) };
const MODAL = '.fixed.inset-0';

// Marca o <select> de cada campo do mapeamento pelo rótulo ao lado.
const marcarCampos = (h) => h.p.evaluate(() => {
  document.querySelectorAll('.fixed.inset-0 label.w-32').forEach((l) => {
    const s = l.parentElement.querySelector('select');
    if (s) s.setAttribute('data-campo', l.innerText.replace('*', '').trim());
  });
});

module.exports = {
  canal: 'todos',
  titulo: 'Como importar leads de uma planilha',
  rota: '/crm',
  responder: [
    [/\/crm\/importacao\/preview/, PREVIEW],
    [/\/crm\/importacao\/importar/, { total: 124, importados: 119, duplicados: 4, erros: [{ linha: 57, erro: 'Nome vazio' }] }],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como trazer os seus contatos de uma planilha para o CRM, de uma vez só.',
      acao: (h) => h.cartaz('Como importar leads de uma planilha', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No CRM, clique em Importar. Aqui está o formato: só o nome é obrigatório, e o telefone vai com 55 e o DDD. Se quiser, baixe o modelo pronto.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('button[title="Importar leads de CSV/Excel"]', '', { ms: 900 });
        await h.dorme(1200);
        await h.destacar(`${MODAL} .bg-red-50`, '', { folga: 4 });
        await h.dorme(2200);
        await h.semDestaque();
        await h.destacar(`${MODAL} button`, 'Baixar Modelo CSV', { folga: 4 });
      },
    },
    {
      fala: 'Clique em Selecionar arquivo, e escolha a sua planilha. Vale CSV ou Excel, com a primeira linha sendo o cabeçalho.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${MODAL} button`, 'Selecionar Arquivo', { ms: 800 }).catch(() => {});
        const input = await h.p.$(`${MODAL} input[type=file]`);
        await input.uploadFile(CSV);
        await h.dorme(1200);
      },
    },
    {
      fala: 'Confira o funil de destino. Depois, ligue cada campo do Duo à coluna da sua planilha. Nome e origem já vieram certos. O telefone está na coluna WhatsApp, e o e-mail, na coluna E-mail.',
      acao: async (h) => {
        await h.destacar(`${MODAL} select`, '', { folga: 4 });
        await h.dorme(1800);
        await h.semDestaque();
        await marcarCampos(h);
        await h.p.evaluate(() => document.querySelector('[data-campo="Telefone"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(900);
        await h.escolher('[data-campo="Telefone"]', 'WhatsApp');
        await h.dorme(600);
        await h.escolher('[data-campo="Email"]', 'E-mail');
      },
    },
    {
      fala: 'Embaixo, as primeiras linhas, para você conferir antes. A origem entra do jeito que está na planilha.',
      acao: async (h) => {
        await h.p.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 h3')].find((e) => e.innerText.startsWith('Preview'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(900);
        await h.destacar(`${MODAL} table`, '', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Clique em Importar Leads. No fim, o Duo mostra quantos entraram, quantos já estavam no funil, e quais linhas tiveram erro, para você corrigir na planilha.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${MODAL} button`, 'Importar Leads', { ms: 800 });
        await h.dorme(1500);
        await h.destacar(`${MODAL} .grid`, '', { folga: 5 }).catch(() => {});
      },
      pausa: 600,
    },
    ENCERRAMENTO,
  ],
};
