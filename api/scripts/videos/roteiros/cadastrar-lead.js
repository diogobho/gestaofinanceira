/**
 * Cadastrar um lead à mão pelo "Novo Lead": nome, telefone, valor, temperatura,
 * responsável e a tarefa inicial (obrigatória). O "Criar Lead" não grava nada: h.simular()
 * faz o GET do funil devolver o lead novo na primeira etapa.
 */
const LEADS = /\/crm\/funis\/42\/leads/;
const novoLead = (leads) => {
  const base = leads.find((l) => l.estagio_id === 277) || leads[0];
  return [{ ...base, id: 999001, nome: 'Rafael Souza', telefone: '5511990000031', valor_potencial: '1500.00', temperatura: 'quente',
    origem: 'Cadastro manual', ordem_estagio: 0, proxima_tarefa: null, total_tarefas_pendentes: '1', status_tarefa: 'verde', tags: [] }, ...leads];
};
const amanha = () => { const d = new Date(Date.now() + 86400000); return [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n) => String(n).padStart(2, '0')).join(''); };
// Rola o formulário (o modal tem rolagem própria) até o campo, devagar.
const rolarAte = (h, sel) => h.p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), sel);

module.exports = {
  canal: 'todos', // 'todos' | 'qr' (Profissional, e Enterprise no QR) | 'oficial'
  titulo: 'Como cadastrar um lead no CRM',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como cadastrar um lead no CRM, à mão.',
      acao: (h) => h.cartaz('Como cadastrar um lead no CRM', 'Menos de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'No CRM, clique em Novo Lead.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await h.clicar('button', 'Novo Lead', { ms: 900 }); },
    },
    {
      fala: 'Preencha o nome e o telefone, com DDD. É por esse número que o Duo conversa com o lead no WhatsApp.',
      acao: async (h) => {
        await h.dorme(500);
        await h.clicar('input[name=nome]', '', { ms: 700 });
        await h.digitar('Rafael Souza', 60);
        await h.clicar('input[name=telefone]', '', { ms: 700 });
        await h.digitar('11990000031', 70);
      },
    },
    {
      fala: 'Se já souber, coloque o valor do negócio e a temperatura: frio, morno ou quente.',
      acao: async (h) => {
        await rolarAte(h, 'input[name=valor_potencial]'); await h.dorme(600);
        await h.clicar('input[name=valor_potencial]', '', { ms: 700 });
        await h.digitar('1500', 90);
        await h.escolher('select[name=temperatura]', 'Quente');
      },
    },
    {
      fala: 'Em Proprietário do Lead, escolha quem da equipe vai cuidar dele.',
      acao: async (h) => {
        await rolarAte(h, 'select[name=responsavel_id]'); await h.dorme(600);
        await h.destacar('select[name=responsavel_id]', '', { folga: 6 });
        await h.escolher('select[name=responsavel_id]', 'Ana Ribeiro');
      },
    },
    {
      fala: 'Por último, a tarefa inicial. Ela é obrigatória, para nenhum lead ficar sem próximo passo. Vou marcar uma ligação para amanhã.',
      acao: async (h) => {
        await h.semDestaque();
        await rolarAte(h, 'textarea[name=descricao]'); await h.dorme(700);
        // Há dois campos "titulo" (negócio e tarefa): o da tarefa é o último.
        await h.p.evaluate(() => { const t = [...document.querySelectorAll('input[name=titulo]')].pop(); t.setAttribute('data-v-tarefa', '1'); });
        await h.clicar('input[data-v-tarefa]', '', { ms: 600 });
        await h.digitar('Ligar para apresentar a proposta', 40);
        await h.escolher('select[name=tipo]', 'Ligação');
        await h.clicar('input[name=data_vencimento]', '', { ms: 700 });
        for (let i = 0; i < 3; i++) await h.p.keyboard.press('ArrowLeft');
        await h.digitar(amanha(), 90);
      },
    },
    {
      fala: 'Clique em Criar Lead. Pronto! O Rafael já aparece na primeira etapa do funil.',
      acao: async (h) => {
        h.simular(LEADS, novoLead);
        await h.clicar('button', 'Criar Lead', { ms: 900 });
        await h.dorme(1200);
        await h.destacar('div,h4,p,span', 'Rafael Souza', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Dica: no fim de cada coluna tem o botão Adicionar lead, que já cria o lead direto naquela etapa.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(300); await h.destacar('button', 'Adicionar lead', { folga: 4 }); const c = await h.centro('button', 'Adicionar lead'); await h.ir(c.x, c.y, 900); },
    },
    {
      fala: 'Ficou alguma dúvida? Fale com a gente em Suporte, dentro do Duo.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(900); await h.cartaz('Ficou alguma dúvida?', 'Fale com a gente em Suporte, dentro do Duo'); },
      pausa: 1200,
    },
  ],
};
