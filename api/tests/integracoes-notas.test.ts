import test from 'node:test';
import assert from 'node:assert/strict';
import { lerNotas } from '../src/modules/crm/integracoes/notas';
import { integracaoDaOrigem } from '../src/modules/crm/integracoes/catalogo';

/**
 * Os textos abaixo são notas REAIS de produção (empresa 5), copiadas verbatim.
 * O parser é genérico de propósito, então o que o protege de regressão é
 * exatamente isto: o formato que cada webhook escreve hoje.
 */

test('formulário Caixa Rápido: título e as três respostas de qualificação', () => {
  const [bloco] = lerNotas(
    'Formulário Caixa Rápido\n' +
      'Negócio: Sou terapeuta integrativa e farmacêutica\n' +
      'E-mail: aleverder@yahoo.com.br\n' +
      'Faturamento hoje: R$ 5k - R$ 10k\n' +
      'Objetivo em 6 a 12 meses: Chegar a 10 k\n' +
      'Maior desafio: Vender sessões e cursos'
  );

  assert.equal(bloco.integracao, 'caixa_rapido');
  assert.equal(bloco.carimbo, null);
  assert.equal(bloco.titulo, 'Formulário Caixa Rápido');
  const mapa = Object.fromEntries(bloco.campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.faturamento_hoje, 'R$ 5k - R$ 10k');
  assert.equal(mapa.objetivo_em_6_a_12_meses, 'Chegar a 10 k');
  assert.equal(mapa.maior_desafio, 'Vender sessões e cursos');
  assert.equal(mapa.negocio, 'Sou terapeuta integrativa e farmacêutica');
});

test('SendFlow: a campanha vem do título, o grupo e o evento dos rótulos', () => {
  const [bloco] = lerNotas(
    'Campanha Grupos LEADS (SendFlow)\n' +
      'Grupo: Desafio 52 Semanas - Vida Próspera\n' +
      'Evento: group.updated.members.added'
  );

  assert.equal(bloco.integracao, 'sendflow');
  const mapa = Object.fromEntries(bloco.campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.campanha, 'Grupos LEADS');
  assert.equal(mapa.grupo, 'Desafio 52 Semanas - Vida Próspera');
  assert.equal(mapa.evento, 'group.updated.members.added');
});

test('card com dois toques: origem SendFlow e formulário anexado depois', () => {
  const blocos = lerNotas(
    'Campanha Grupos LEADS (SendFlow)\n' +
      'Grupo: Desafio 52 Semanas - Vida Próspera\n' +
      'Evento: group.updated.members.added\n' +
      '\n' +
      '[06/09/2026, 09:06:56] Formulário Caixa Rápido\n' +
      'Negócio: Funcionário público\n' +
      'Faturamento hoje: R$ 5k - R$ 10k\n' +
      '\n' +
      '[06/09/2026, 09:09:49] Campanha Grupos LEADS (SendFlow)\n' +
      'Grupo: #03 Já é permitido prosperar! ✨\n' +
      'Evento: group.updated.members.added'
  );

  assert.equal(blocos.length, 3);
  assert.deepEqual(
    blocos.map((b) => b.integracao),
    ['sendflow', 'caixa_rapido', 'sendflow']
  );
  assert.equal(blocos[0].carimbo, null);
  assert.equal(blocos[1].carimbo, '06/09/2026, 09:06:56');
  // O mesmo toque duas vezes com grupos diferentes: os dois valores têm de sobreviver.
  const grupos = blocos
    .flatMap((b) => b.campos)
    .filter((c) => c.chave === 'grupo')
    .map((c) => c.valor);
  assert.deepEqual(grupos, ['Desafio 52 Semanas - Vida Próspera', '#03 Já é permitido prosperar! ✨']);
});

test('Hotmart: reconhecida pelo corpo, já que a primeira linha é um campo', () => {
  const [bloco] = lerNotas(
    'Produto: Escola de Empreendedorismo (#5510712)\n' +
      'Valor: BRL 208.97\n' +
      'Pagamento: CREDIT_CARD em 1x\n' +
      'Transação: HP4010891263\n' +
      'Local: São José do Rio Preto/SP'
  );

  assert.equal(bloco.integracao, 'hotmart');
  const mapa = Object.fromEntries(bloco.campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.produto, 'Escola de Empreendedorismo (#5510712)');
  assert.equal(mapa.valor, 'BRL 208.97');
  assert.equal(mapa.local, 'São José do Rio Preto/SP');
});

test('diagnóstico legado: vários campos numa linha só, separados por barra', () => {
  const [bloco] = lerNotas(
    'Faturamento atual: 1200000 | Meta de faturamento: 2500000 | Investe em marketing: Sim | Valor em marketing: 10000 | Investe em vendas: Não'
  );

  assert.equal(bloco.integracao, 'diagnostico');
  const mapa = Object.fromEntries(bloco.campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.faturamento_atual, '1200000');
  assert.equal(mapa.meta_de_faturamento, '2500000');
  assert.equal(mapa.investe_em_marketing, 'Sim');
  assert.equal(mapa.investe_em_vendas, 'Não');
});

test('indicação: o depoimento com parágrafo não vira bloco anônimo', () => {
  const blocos = lerNotas(
    'Destino: Escola de Empreendedorismo\n' +
      'Indicado por: Elenice Silva Santos (Escola de Empreendedorismo)\n' +
      'Por que essa pessoa faz sentido:\n' +
      'Rita sonha empreender.\n' +
      '\n' +
      'Mas as feridas emocionais a impedem.'
  );

  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].integracao, 'embaixadores');
  const mapa = Object.fromEntries(blocos[0].campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.destino, 'Escola de Empreendedorismo');
  assert.equal(mapa.indicado_por, 'Elenice Silva Santos (Escola de Empreendedorismo)');
  assert.match(mapa.por_que_essa_pessoa_faz_sentido, /feridas emocionais/);
});

test('texto livre com barra não é quebrado em campos', () => {
  const [bloco] = lerNotas(
    'Formulário Caixa Rápido\nMaior desafio: vender mais | crescer | sei lá'
  );
  const mapa = Object.fromEntries(bloco.campos.map((c) => [c.chave, c.valor]));
  assert.equal(mapa.maior_desafio, 'vender mais | crescer | sei lá');
});

test('notas vazias não produzem bloco', () => {
  assert.deepEqual(lerNotas(null), []);
  assert.deepEqual(lerNotas('   \n  '), []);
});

test('origem whatsapp: importação de grupo é separada do lead automático', () => {
  assert.equal(integracaoDaOrigem('whatsapp', 'Participante 5511999999999'), 'whatsapp_grupo');
  assert.equal(integracaoDaOrigem('whatsapp', 'Maria Souza'), 'whatsapp_auto');
  assert.equal(integracaoDaOrigem('Caixa Rápido', 'Maria'), 'caixa_rapido');
  assert.equal(integracaoDaOrigem('importacao', 'Maria'), null);
});
