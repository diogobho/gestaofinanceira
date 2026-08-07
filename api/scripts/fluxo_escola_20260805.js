/**
 * Reescrita das cadências do funil 24 (Escola Empreendedorismo) — pedido da Jéssica.
 *
 * Rodar:  node scripts/fluxo_escola_20260805.js            (preview, não grava)
 *         node scripts/fluxo_escola_20260805.js --aplicar
 *
 * Rollback: backups/rollback_fluxo_escola_20260805.sql
 */
const { Client } = require('pg');

const DIAS_UTEIS = [1, 2, 3, 4, 5];
const HORA = '09:00';

/** Passo de texto fixo (não passa pela IA — o texto sai exatamente assim). */
const manual = (atrasoDias, mensagem, extra = {}) => ({
  base: 'entrada', modo: 'dias', tipo: 'manual',
  atraso_dias: atrasoDias, atraso_unidade: 'dia',
  hora_envio: HORA, dias_semana: DIAS_UTEIS,
  mensagem, ...extra,
});

/** Passo conduzido pelo agente. `instrucao_ia` é o FOCO DESTA ETAPA. */
const ia = (atrasoDias, instrucao, extra = {}) => ({
  base: 'entrada', modo: 'dias', tipo: 'agente_ia',
  atraso_dias: atrasoDias, atraso_unidade: 'dia',
  hora_envio: HORA, dias_semana: DIAS_UTEIS,
  instrucao_ia: instrucao, ...extra,
});

/** Passo imediato na entrada do estágio (atraso 0 em minutos). */
const iaImediato = (instrucao) => ia(0, instrucao, { atraso_unidade: 'minuto' });

// Regra negativa repetida nos passos de decisão: sem escassez inventada.
const SEM_ESCASSEZ =
  'NUNCA use escassez, prazo ou vaga ("garanta sua vaga", "as condições valem até hoje", ' +
  '"últimas vagas"): a Escola é recorrente e não tem turma fechando. A urgência vem do ' +
  'custo de continuar parado e do objetivo que o lead te contou, nunca da oferta.';

const TOM = 'Tom humano e caloroso, nunca formal. Use [PrimeiroNome]. ' +
  'Não invente preços, links ou datas. Máx. 4 linhas.';

const ENCERRAMENTO =
  'Oi [PrimeiroNome], tudo bom?\n\n' +
  'Entendi que agora talvez não seja o melhor momento para conversarmos. Vou seguir mandando ' +
  'conteúdos e novidades úteis de vez em quando. Quando fizer sentido conversar é só me chamar 😃';

const CONFIGS = {
  // ── 208 · Entrada de Leads ────────────────────────────────────────────────
  // Era inativo com mensagem vazia: ninguém mandava a primeira mensagem, mas o
  // D+1 da Tentativa de Contato já dizia "viu minha msg de ontem".
  208: {
    ativo: true,
    passos: [
      manual(0,
        'Olá, [PrimeiroNome]! Como está? 😊 Aqui é a [PrimeiroNomeResponsavel], da Escola de Empreendedorismo.\n\n' +
        'Seja muito bem-vindo ao grupo Já é Permitido Prosperar e parabéns pela decisão de construir a sua Liberdade Financeira.\n\n' +
        'Me fala um pouco mais sobre você?',
        { atraso_unidade: 'minuto' }),
    ],
  },

  // ── 209 · Tentativa de Contato ────────────────────────────────────────────
  // Texto fixo nos três toques: o lead ainda não respondeu nada, então não há
  // contexto para a IA usar — e prova social aqui seria genérica.
  209: {
    ativo: true,
    passos: [
      manual(1, 'Oi [PrimeiroNome], como está? Passando para saber se viu a minha msg de ontem ☺️'),
      manual(4,
        'Olá [PrimeiroNome], tudo bem por aí? Preparamos um conteúdo bacana que pode fazer sentido ' +
        'para quem está buscando por Liberdade Financeira, quer que eu te mande?'),
      manual(12, ENCERRAMENTO),
    ],
  },

  // ── 210 · Qualificação ────────────────────────────────────────────────────
  // Retomadas em +2, +3 e +6. Os dois últimos encadeiam no passo anterior
  // ('anterior'), que é o mais perto de "dias desde a última mensagem enviada"
  // que o motor sabe fazer.
  210: {
    ativo: true,
    passos: [
      ia(2,
        'RETOMADA DA QUALIFICAÇÃO. O lead parou de responder no meio do levantamento. ' +
        'Releia o histórico, identifique em que etapa do SPIN a conversa parou e retome DALI — ' +
        'não recomece nem repita pergunta já respondida. ' +
        'Abra com algo como "Oi [PrimeiroNome], como está? Passando para saber se viu a minha msg" ' +
        'e, em seguida, refaça com OUTRAS PALAVRAS a pergunta da etapa em que parou. ' +
        'Uma pergunta só, aberta. Não crie gancho de curiosidade ("tenho uma novidade", ' +
        '"preciso te contar uma coisa") — retome o assunto real. ' + TOM),
      ia(3,
        'O lead segue em silêncio desde a retomada. Envie uma mensagem curta de valor: um insight ou ' +
        'dica prática ligada ao que ELE trouxe na conversa, e pergunte com leveza se ainda faz sentido ' +
        'falar sobre isso. Não repita perguntas já respondidas. ' + TOM,
        { base: 'anterior' }),
      manual(6, ENCERRAMENTO, { base: 'anterior' }),
    ],
  },

  // ── 232 · Objeção ─────────────────────────────────────────────────────────
  232: {
    ativo: true,
    passos: [
      iaImediato(
        'O lead levantou uma objeção. OBJEÇÃO SE VENCE COM PERGUNTA, NÃO COM ARGUMENTO.\n\n' +
        'Primeiro ISOLE a objeção para descobrir se ela é a verdadeira: ' +
        '"se [objeção] não fosse problema, você entraria na escola?" ' +
        'Se a resposta for SIM, é a objeção real — aprofunde nela. ' +
        'Se for NÃO, existe outra trava: pergunte e investigue até achar a verdadeira. ' +
        'Só argumente depois de ter isolado, e use o que ele contou no levantamento de necessidade.\n\n' +
        'Nesta primeira mensagem, isole. Não despeje argumento. Uma pergunta só. ' + TOM),
      ia(1,
        'Retomada: o lead não respondeu à sua mensagem sobre a objeção. Abra com ' +
        '"Oi [PrimeiroNome], como está? Passando para saber se viu a minha msg" e retome, com OUTRAS ' +
        'PALAVRAS, o encaminhamento que você deu para a objeção dele. Uma pergunta só. ' + TOM),
      ia(3,
        'O lead segue inseguro. Reconheça a insegurança pelo nome ("sei que você está inseguro em relação ' +
        'à escola") e traga UM caso real ou um ganho concreto que conecte especificamente com a objeção ' +
        'dele — nome real, número antes, número depois, tempo. Feche perguntando: "o que podemos fazer ' +
        'para que você tome essa decisão com mais segurança?" ' + TOM),
      ia(5,
        'Pergunte como está o momento dele em relação ao ponto que foi conversado — cite o ponto real que ' +
        'ele trouxe — e se mudou alguma coisa desde a última conversa. Sem cobrança. ' + TOM),
      ia(7,
        'Reconecte à dor e ao objetivo originais que ele te contou ("na nossa conversa você me disse que ' +
        'queria [objetivo] e que o maior desafio era [dor]") e pergunte se isso ainda é prioridade, para ' +
        'você ajustar os retornos. Use anotações e histórico. ' + TOM),
      manual(10,
        'Oi [PrimeiroNome], tudo bem? Não quero ocupar o seu espaço sem que faça sentido.\n\n' +
        'Se o momento mudar, é só me chamar, a porta fica aberta. Foi um prazer conversar com você!'),
    ],
  },

  // ── 233 · Fechamento ──────────────────────────────────────────────────────
  // Sem escassez. O ritmo real é o combinado com o lead, que fica em anotações.
  233: {
    ativo: true,
    passos: [
      iaImediato(
        'A reunião foi boa e o lead demonstrou interesse em fechar. Recapitule o que foi alinhado ' +
        '(a dor que será resolvida, o resultado esperado e o próximo passo) usando o histórico, e ' +
        'encaminhe para o pagamento. ' + SEM_ESCASSEZ + '\n\n' +
        'ANTES DE ESCREVER, LEIA AS ANOTAÇÕES DO CARD: elas mandam mais que esta cadência. ' +
        'Se houver data de pagamento combinada, respeite-a e não cobre antes. Se as anotações ' +
        'indicarem outro acordo com o lead, siga o acordo. ' +
        'Não invente links, valores ou formas de pagamento — se precisar do link, diga que envia na sequência. ' + TOM),
      ia(1,
        'Pergunte se ele conseguiu ver o que foi enviado e ajude a amarrar a decisão, gerando desejo pelo ' +
        'RESULTADO que ele disse querer. A urgência vem do objetivo dele e do custo de seguir parado. ' +
        SEM_ESCASSEZ + ' Respeite o que estiver combinado em anotações. ' + TOM),
      ia(3,
        'O lead ainda não concluiu. Pergunte com leveza se algo ficou em aberto ou se há alguma insegurança ' +
        'para dar esse passo, e reconecte ao objetivo dele. ' + SEM_ESCASSEZ + ' ' + TOM),
      ia(5,
        'Reconecte à dor e ao objetivo que ele te contou e pergunte se isso ainda está no radar. ' +
        'Coloque-se à disposição sem cobrar. Use anotações. ' + SEM_ESCASSEZ + ' ' + TOM),
      ia(7,
        'Última mensagem do fechamento. Encerre com respeito: entendeu que talvez não seja o momento, ' +
        'a porta fica aberta e você seguirá enviando conteúdos úteis. Tom acolhedor, sem culpa. ' + TOM),
    ],
  },

  // ── 236 · Nutrição ────────────────────────────────────────────────────────
  // "A cada 30 dias" precisa virar passos explícitos: o motor de cadência não
  // tem repetição. Seis toques = 6 meses; depois disso o lead fica parado aqui
  // até responder (o estágio devolve para Qualificação na resposta).
  236: {
    ativo: true,
    passos: [30, 60, 90, 120, 150, 180].map((dias, ciclo) =>
      ia(dias,
        `Ciclo de nutrição ${ciclo + 1} (a cada 30 dias). Avise que saiu conteúdo novo no canal do YouTube ` +
        'da Escola e convide o lead a assistir — de forma leve, sem venda e sem cobrança. Em seguida, ' +
        'convide-o para retirar um presente/material gratuito. Ligue o convite ao interesse que ele ' +
        'demonstrou (use anotações e histórico); se não houver nada registrado, fale de forma genérica. ' +
        'NÃO invente título de vídeo, link nem data — se não souber, diga apenas que saiu conteúdo novo. ' +
        'Não repita o ângulo dos ciclos anteriores: releia o histórico antes de escrever. ' + TOM)),
  },
};

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (ex.: export $(grep ^DATABASE_URL ../.env))');
  await c.connect();

  for (const [id, cfg] of Object.entries(CONFIGS)) {
    const { rows } = await c.query('SELECT nome FROM estagios_funil WHERE id = $1 AND funil_id = 24', [id]);
    if (!rows[0]) { console.log(`SKIP ${id} — não é estágio do funil 24`); continue; }

    console.log(`\n── ${id} · ${rows[0].nome} — ${cfg.passos.length} passo(s)`);
    cfg.passos.forEach((p, i) => {
      const quando = p.atraso_unidade === 'minuto' ? 'imediato' : `D+${p.atraso_dias} (${p.base})`;
      const texto = p.tipo === 'manual' ? p.mensagem : p.instrucao_ia;
      console.log(`   ${i}. ${quando} · ${p.tipo}\n      ${texto.replace(/\n+/g, ' ⏎ ').slice(0, 150)}...`);
    });

    if (aplicar) {
      await c.query('UPDATE estagios_funil SET followup_config = $1::jsonb WHERE id = $2', [JSON.stringify(cfg), id]);
    }
  }

  console.log(aplicar ? '\n✓ Aplicado.' : '\nPREVIEW — nada gravado. Use --aplicar.');
  await c.end();
})();
