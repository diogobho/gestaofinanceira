/**
 * Respostas por botão (094, número oficial): o lead clica num botão do modelo ("Sim" / "Ainda não")
 * e o Duo manda a sequência daquele botão e cria a tarefa de FUP. Configurado na etapa.
 * Regras, upload do áudio e o Salvar são respondidos localmente. Nada é gravado.
 */
const { ENCERRAMENTO } = require('./_comum');
const canalOficial = require('./_canal-oficial');

const MODAL = '.fixed.inset-0';
const AUDIO_LOCAL = '/var/www/apps/landing/assets/videos/tutoriais/demo/audio.ogg';
const AUDIO_URL = 'https://duofuturo.tech/assets/videos/tutoriais/demo/audio.ogg';
const REGRA = '[class*="border-violet-200"]';
const rolarAte = (h, sel, texto) => h.p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (e.innerText || '').trim().startsWith(t));
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, sel, texto || '');

module.exports = {
  canal: 'oficial',
  titulo: 'Como responder sozinho quando o lead clica num botão',
  rota: '/crm',
  simular: [...canalOficial, [/\/respostas-botao$/, () => []]],
  responder: [[/\/followups\/upload-media/, { media_url: AUDIO_URL, media_mimetype: 'audio/ogg', media_filename: 'explicacao-workshop.ogg' }]],
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como o Duo responde sozinho quando o lead clica num botão da sua mensagem, como Sim, ou Ainda não.',
      acao: (h) => h.cartaz('Respostas por botão', 'WhatsApp oficial · Enterprise'),
      pausa: 300,
    },
    {
      fala: 'Os botões vêm do modelo aprovado pela Meta, que você manda pelo número oficial. A resposta de cada botão se configura na etapa: clique nos três pontinhos, e em Configurar estágio.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(300);
        const menu = await h.p.evaluate(() => {
          const t = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Novos Leads');
          const bts = [...t.closest('div').parentElement.querySelectorAll('button')];
          const r = bts[bts.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await h.clicarPonto(menu, { ms: 1000 });
        await h.dorme(700);
        await h.clicar('button', 'Configurar estágio', { ms: 700 });
      },
    },
    {
      fala: 'Desça até Respostas por botão, e clique em Adicionar regra de resposta.',
      acao: async (h) => {
        await h.dorme(900);
        await rolarAte(h, 'button', 'Adicionar regra de resposta');
        await h.dorme(1000);
        await h.clicar('button', 'Adicionar regra de resposta', { ms: 800 });
        await h.dorme(600);
        await h.p.evaluate((s) => [...document.querySelectorAll(s)].pop()?.scrollIntoView({ behavior: 'smooth', block: 'center' }), REGRA);
        await h.dorme(700);
      },
    },
    {
      fala: 'Em Botão clicado, escreva o texto do botão, igual ao do modelo. A origem é opcional: em branco, a regra vale para qualquer lead.',
      acao: async (h) => {
        await h.clicar(`${REGRA} input[placeholder="Ex.: Ainda não"]`, '', { ms: 700 });
        await h.digitar('Ainda não', 70);
        await h.dorme(500);
        await h.destacar(`${REGRA} input[placeholder="Qualquer origem"]`, '', { folga: 5 });
      },
    },
    {
      fala: 'Agora, as mensagens que saem depois do clique, nesta ordem. Pode ser um áudio seu explicando, um vídeo, uma imagem, ou texto.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar(`${REGRA} button`, 'Anexar áudio', { ms: 700 });
        const input = await h.p.$(`${REGRA} input[type=file]`);
        await input.uploadFile(AUDIO_LOCAL);
        await h.dorme(1500);
      },
    },
    {
      fala: 'Clique em Adicionar mensagem para a próxima, e escreva. Os colchetes trocam pelo nome do lead.',
      acao: async (h) => {
        await h.clicar(`${REGRA} button`, 'Adicionar mensagem', { ms: 700 });
        await h.dorme(500);
        const sel = await h.p.evaluate((s) => { const t = [...document.querySelectorAll(`${s} textarea`)].pop(); t.setAttribute('data-v-msg2', '1'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); return '[data-v-msg2]'; }, REGRA);
        await h.dorme(600);
        await h.clicar(sel, '', { ms: 600 });
        await h.digitar('[PrimeiroNome], ouve esse áudio rapidinho? Explico em 1 minuto como funciona o workshop.', 30);
      },
    },
    {
      fala: 'Embaixo, o Duo já cria uma tarefa de follow-up para o responsável, daqui a três dias. Dá para mudar os dias, ou desmarcar.',
      acao: async (h) => {
        await h.p.evaluate((s) => [...document.querySelectorAll(`${s} label`)].find((l) => l.innerText.includes('Criar tarefa de FUP'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), REGRA);
        await h.dorme(700);
        await h.destacar(`${REGRA} label`, 'Criar tarefa de FUP', { folga: 5 });
      },
    },
    {
      fala: 'Clique em Salvar. Cada regra vale uma vez por lead, e só o clique no botão dispara: texto digitado não conta.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(400); await h.clicar('button', 'Salvar', { ms: 900 }); await h.dorme(1200); },
    },
    ENCERRAMENTO,
  ],
};
