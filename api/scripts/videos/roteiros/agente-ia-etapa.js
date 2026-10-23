/**
 * Agente de IA respondendo numa etapa (chamados #46 e #77): ligar o agente reativo,
 * a instrução da etapa e a diferença para a cadência; mover quando o lead responde.
 */
const { rolarAte, abrirConfigEtapa, marcarPorTexto, ENCERRAMENTO } = require('./_comum');

module.exports = {
  canal: 'todos',
  titulo: 'Como colocar o agente de IA para responder numa etapa',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como colocar o agente de IA para responder os leads de uma etapa do funil.',
      acao: (h) => h.cartaz('Como colocar o agente de IA para responder numa etapa', 'Cerca de 1 minuto'),
      pausa: 300,
    },
    {
      fala: 'Abra a configuração da etapa: três pontinhos, e Configurar estágio.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(300); await abrirConfigEtapa(h, 'Primeiro Contato'); },
    },
    {
      fala: 'Marque Agente de IA reativo neste estágio. A partir daí, o agente responde as mensagens que o lead mandar enquanto estiver nesta etapa.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Agente de IA reativo'); await h.dorme(800);
        const sel = await marcarPorTexto(h, 'Agente de IA reativo neste estágio', 'data-v-agente');
        const marcado = await h.p.evaluate((s) => document.querySelector(`${s} input`).checked, sel);
        if (!marcado) await h.clicar(`${sel} input`, '', { ms: 800 });
        await h.dorme(500);
        await h.destacar(sel, '', { folga: 6 });
      },
    },
    {
      fala: 'Na instrução, diga o que o agente deve buscar nesta etapa, e o que ele não pode fazer. Por exemplo: não falar de preço, e oferecer uma conversa com o consultor.',
      acao: async (h) => {
        await h.semDestaque();
        await rolarAte(h, 'textarea'); await h.dorme(700);
        await h.p.evaluate(() => { const t = [...document.querySelectorAll('.fixed.inset-0 textarea')].find((e) => e.getBoundingClientRect().width > 0); t.setAttribute('data-v-instr', '1'); });
        await h.clicar('textarea[data-v-instr]', '', { ms: 700 });
        await h.p.keyboard.down('Control'); await h.p.keyboard.press('a'); await h.p.keyboard.up('Control'); await h.p.keyboard.press('Backspace');
        await h.digitar('Descubra o que o lead precisa. Não fale de preço. Se ele tiver interesse, ofereça uma conversa com o consultor.', 28);
      },
    },
    {
      fala: 'O jeito como o agente fala, o tom e a apresentação da empresa ficam na configuração geral do agente. Aqui vale só para esta etapa.',
      acao: async (h) => { await h.dorme(300); },
    },
    {
      fala: 'Isso é diferente do follow-up: o follow-up manda as mensagens agendadas, e o agente reativo responde quando o lead escreve.',
      acao: async (h) => { await h.dorme(300); },
    },
    {
      fala: 'Para o card andar sozinho, use Ao lead responder, mover para, e escolha a próxima etapa.',
      acao: async (h) => {
        await rolarAte(h, 'label', 'Ao lead responder'); await h.dorme(900);
        await h.p.evaluate(() => {
          const l = [...document.querySelectorAll('label')].find((e) => (e.innerText || '').startsWith('Ao lead responder'));
          l.parentElement.nextElementSibling.setAttribute('data-v-resp', '1');
        });
        await h.destacar('select[data-v-resp]', '', { folga: 5 });
        await h.escolher('select[data-v-resp]', 'Avaliação Agendada');
      },
    },
    {
      fala: 'Clique em Salvar. Se quiser desligar o agente para um lead específico, dá para fazer isso na tela do próprio lead.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(300); await h.clicar('button', 'Salvar', { ms: 900 }); },
    },
    ENCERRAMENTO,
  ],
};
