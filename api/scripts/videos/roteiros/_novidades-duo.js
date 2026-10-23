/**
 * Vídeo de divulgação "O que há de novo no Duo" (05/10/2026) — vai no convite às
 * prospecções e fundadoras, não é tutorial: o `_` no nome deixa ele fora do catálogo.
 * Gerar com saída própria:
 *   COM_MOUSE=1 node gerar.js _novidades-duo /var/www/apps/landing/assets/videos/novidades
 * Conta demo; conversa, grupos e campanha simulados. Nada é enviado.
 */
const { abrirConfigEtapa, rolarAte } = require('./_comum');
const { criarConversa } = require('./_conversa');

const MODAL = '.fixed.inset-0';
const conversa = criarConversa();
const GRUPO = { id: '120363000000000@g.us', nome: 'Workshop Vendas 2027 · Turma 1', participantes: 212, soAdminsEnviam: false, souAdmin: true, descricao: null };
const REGRA = {
  grupo_id: GRUPO.id, grupo_nome: GRUPO.nome, funil_id: 42, funil_nome: 'Comercial', estagio_id: 277, estagio_nome: 'Novos Leads',
  responsavel_id: null, responsavel_nome: null, distribuir_entre: [55, 9101], distribuir_nomes: ['Ana Ribeiro', 'Bruno Costa'], origem: 'Workshop', ativa: true,
};
const CAMPANHA = {
  id: 77, nome: 'Lançamento Outubro', slug: 'lancamento-outubro', limite_por_grupo: 900, chips: [55], criar_grupos: true,
  nome_grupo_modelo: 'Lançamento Outubro {{n}}', descricao_grupo: null, so_admins_enviam: true, criar_lead: true, funil_id: 42,
  funil_nome: 'Comercial', estagio_id: 277, responsavel_id: null, origem: 'Lançamento Outubro', ativa: true,
  total_grupos: 3, total_participantes: 1968, total_cliques: 2431, total_entradas: 2012, total_saidas: 44, created_at: new Date().toISOString(),
};

module.exports = {
  canal: 'todos',
  titulo: 'O que há de novo no Duo',
  rota: '/crm',
  simular: [
    conversa.simulacao,
    [/\/grupos\/canal/, () => ({ provedor: 'baileys', conectado: true, numero: '5511999990000' })],
    [/\/grupos\/lista/, () => [GRUPO]],
    [/\/grupos\/mensagens$/, () => []],
    [/\/grupos\/boas-vindas$/, () => []],
    [/\/grupos\/crm$/, () => [REGRA]],
    [/\/grupos\/campanhas$/, () => [CAMPANHA]],
    [/\/chat-financeiro\/historico/, () => []],
  ],
  passos: [
    {
      fala: 'O Duo cresceu. Em poucas semanas, chegou muita coisa nova, e eu quero te mostrar, em um minuto e meio, o que você está deixando passar.',
      acao: (h) => h.cartaz('O Duo cresceu', 'O que chegou nas últimas semanas'),
      pausa: 300,
    },
    {
      fala: 'O seu funil inteiro num quadro só. Cada lead é um card, você vê na hora quem está quente, e nenhum contato do WhatsApp fica esquecido.',
      acao: async (h) => {
        await h.tirarCartaz(); await h.dorme(500);
        await h.destacar('h3', 'Novos Leads', { folga: 6 }).catch(() => {});
        await h.dorme(1500);
        await h.destacar('span', 'Quente', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Abra o card e converse ali mesmo, com o histórico inteiro: responda citando, reaja, mande áudio, sem sair do sistema.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('div,h4,p,span', 'Eduardo Freitas', { ms: 900 });
        await h.dorme(800);
        await h.clicar('button', 'WhatsApp', { dentro: MODAL, ms: 600 });
        await h.dorme(1500);
      },
    },
    {
      fala: 'Em cada etapa, o agente de inteligência artificial responde o lead na hora, entende áudio, e sabe quando é melhor ficar quieto. E o follow-up automático manda a sequência de mensagens sozinho, no dia certo.',
      acao: async (h) => {
        // O card não fecha no Esc: clica no X do cabeçalho.
        const x = await h.p.evaluate(() => { const b = [...document.querySelectorAll('.fixed.inset-0 button')].find((e) => e.querySelector('svg') && !e.innerText.trim() && e.getBoundingClientRect().y < 110 && e.getBoundingClientRect().x > 1000); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await h.clicarPonto(x, { ms: 700 }); await h.dorme(800);
        await abrirConfigEtapa(h, 'Novos Leads');
        await h.dorme(500);
        await rolarAte(h, 'label,span,p', 'Agente de IA reativo');
        await h.dorme(900);
        await h.destacar('label,span,p', 'Agente de IA reativo', { folga: 6 }).catch(() => {});
        await h.dorme(2600);
        await h.semDestaque();
        await rolarAte(h, 'button', 'Adicionar passo');
        await h.dorme(900);
        await h.destacar('button', '1\nPasso 1', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Nos seus grupos do WhatsApp, quem entra vira lead na hora, já com responsável. E, com as campanhas, um link só enche vários grupos, e abre o próximo quando lota.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button', 'Cancelar', { ms: 700 });
        await h.dorme(500);
        await h.clicar('a', 'Grupos', { ms: 800 });
        await h.dorme(1200);
        await h.clicar('button', 'Criar lead', { ms: 700 });
        await h.dorme(900);
        await h.destacar('li', GRUPO.nome, { folga: 4 }).catch(() => {});
        await h.dorme(2400);
        await h.semDestaque();
        await h.clicar('button', 'Campanhas', { ms: 700 });
        await h.dorme(1200);
        await h.destacar('h3', 'Lançamento Outubro', { folga: 8 }).catch(() => {});
      },
    },
    {
      fala: 'E você não fica sozinho: o Duo responde suas dúvidas no chat, e cada tela tem um vídeo curto mostrando como fazer. Dá até para instalar no celular, como um aplicativo.',
      acao: async (h) => {
        await h.semDestaque();
        await h.clicar('button[aria-label="Abrir o chat com o Duo"]', '', { ms: 800 });
        await h.dorme(1200);
        await h.destacar('[aria-label="Chat com o Duo"]', '', { folga: 4 }).catch(() => {});
      },
    },
    {
      fala: 'Enquanto isso, quem ainda faz tudo na mão continua perdendo lead esquecido no WhatsApp. Quer fazer parte? É só responder SIM na mensagem.',
      acao: async (h) => { await h.semDestaque(); await h.dorme(600); await h.cartaz('Quer fazer parte?', 'Responda SIM na mensagem'); },
      pausa: 1500,
    },
  ],
};
