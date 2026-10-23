/**
 * Disparo em massa no número oficial (Enterprise) — chamados #28, #60 e #70: por que um lead
 * "fica parado" depois do disparo. A lista de quem recebe é fixa na criação, e quem falha
 * (número inexistente, sem WhatsApp) não é movido. Canal, leads e resultado são simulados.
 */
const { ENCERRAMENTO } = require('./_comum');
const canalOficial = require('./_canal-oficial');

const MODAL = '.fixed.inset-0';
const NOMES = ['Mariana Castro', 'Patrícia Gomes', 'Aline Barros', 'João Pedro Alves', 'Bruno Carvalho', 'Felipe Moraes', 'Camila Duarte', 'Thiago Antunes'];
const LEADS = NOMES.map((nome, i) => ({ id: 14625 - i, nome, telefone: `55119${String(90000011 + i).padStart(8, '0')}`, empresa: null, total_disparos: 0 }));
const ERROS = [
  { lead_id: LEADS[3].id, nome: LEADS[3].nome, telefone: LEADS[3].telefone, erro: 'número não existe no WhatsApp' },
  { lead_id: LEADS[6].id, nome: LEADS[6].nome, telefone: '551190000', erro: 'telefone incompleto (falta o DDD ou o 9)' },
];
let leituras = 0;
const status = () => {
  leituras += 1;
  const feito = Math.min(LEADS.length, leituras * 3);
  const falhas = feito >= LEADS.length ? ERROS.length : 0;
  return { id: 77, total: LEADS.length, enviados: feito - falhas, falhas, status: feito >= LEADS.length ? 'concluido' : 'processando', erros: falhas ? ERROS : [] };
};

module.exports = {
  canal: 'oficial',
  titulo: 'Como fazer um disparo em massa no número oficial',
  rota: '/crm',
  simular: [
    ...canalOficial,
    [/\/crm\/disparos\/leads/, () => ({ leads: LEADS, total: LEADS.length, paginas: 1 })],
    [/\/crm\/disparos\/77/, () => status()],
  ],
  responder: [
    [/\/crm\/disparos\/preview/, { total: LEADS.length, total_ja_agendados: 0, total_grupos_ignorados: 0,
      destinatarios: LEADS.map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone, estagio_nome: 'Novos Leads', ja_agendado: false })) }],
    [/\/crm\/disparos$/, { disparo_id: 77 }],
  ],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como mandar uma mensagem para vários leads de uma vez pelo número oficial, e por que algum lead pode ficar parado depois.',
      acao: (h) => h.cartaz('Disparo em massa no número oficial', 'Cerca de 1 minuto e meio'),
      pausa: 300,
    },
    {
      fala: 'No CRM, use os filtros para escolher quem recebe. Por exemplo, os leads sem tarefa. O disparo segue os filtros ligados.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        await h.clicar('button', 'Filtros', { ms: 800 });
        await h.dorme(700);
        await h.clicar('button', 'Sem Tarefa', { ms: 700 });
        await h.dorme(900);
        await h.clicar('button', 'Filtros', { ms: 600 });
        await h.dorme(500);
        await h.clicar('button[title="Disparo em massa via WhatsApp"]', '', { ms: 800 });
      },
    },
    {
      fala: 'Confira quantos leads vão receber, e clique em Continuar.',
      acao: async (h) => {
        await h.dorme(900);
        await h.destacar(`${MODAL} .bg-green-50`, '', { folga: 4 }).catch(() => {});
        await h.dorme(1500);
        await h.semDestaque();
        await h.clicar(`${MODAL} button`, 'Continuar', { ms: 700 });
      },
    },
    {
      fala: 'No número oficial, quem não falou com você nas últimas vinte e quatro horas só recebe modelo aprovado pela Meta. Escolha o modelo. O Primeiro Nome já entra no lugar da variável.',
      acao: async (h) => {
        await h.dorme(700);
        await h.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Modelo aprovado')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await h.dorme(900);
        await h.escolher(`${MODAL} select`, 'retomada_conversa', { dentro: '.border-emerald-200' }).catch(async () => h.escolher('.border-emerald-200 select', 'retomada_conversa'));
        await h.dorme(900);
        await h.destacar('.border-emerald-200', '', { folga: 4 });
      },
    },
    {
      fala: 'Em Após o envio, escolha a etapa para onde o lead vai. Atenção: só é movido quem recebeu. Se o número não existe, ou está incompleto, o lead fica onde estava, e é por isso que ele parece parado.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.querySelector('[data-tour="disp-automacao"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(900);
        await h.escolher('[data-tour="disp-automacao"] select', 'Primeiro Contato');
        await h.dorme(500);
        await h.destacar('[data-tour="disp-automacao"]', '', { folga: 4 });
      },
    },
    {
      fala: 'Em Revisar contatos, você vê a lista exata. Ela fica fixa quando o disparo é criado: quem entrar no funil depois, não recebe. Para esses, faça um disparo novo.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.querySelector('[data-tour="disp-preview"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(800);
        await h.clicar('[data-tour="disp-preview"] button', 'Revisar contatos', { ms: 700 });
        await h.dorme(900);
        await h.destacar('[data-tour="disp-preview"]', '', { folga: 4 });
      },
    },
    {
      fala: 'O intervalo entre um envio e outro protege o número. Se quiser, agende para depois. Então clique em Disparar.',
      acao: async (h) => {
        await h.semDestaque();
        await h.p.evaluate(() => document.querySelector('[data-tour="disp-intervalo"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await h.dorme(800);
        await h.destacar('[data-tour="disp-intervalo"]', '', { folga: 4 });
        await h.dorme(1800);
        await h.semDestaque();
        await h.clicar(`${MODAL} button`, 'Disparar para', { ms: 800 });
      },
    },
    {
      fala: 'No fim, o Duo mostra quantos foram enviados, e quem falhou, com o motivo. Corrija esses telefones no card do lead, e mande de novo só para eles.',
      acao: async (h) => {
        await h.dorme(3500);
        await h.destacar(`${MODAL} .max-h-40`, '', { folga: 5 }).catch(() => {});
      },
      pausa: 800,
    },
    ENCERRAMENTO,
  ],
};
