/**
 * Cenários ponta a ponta do motor de follow-up.
 *
 * Cada teste é um caso que já quebrou em produção ou que a revisão de 25/08/2026
 * exigiu garantir. `npm test` — runner nativo do Node, sem dependência nova.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { executarCiclo, MAX_TENTATIVAS } from '../src/jobs/followup/motor';
import { RepoFalso, followupFalso, portasDeTeste, erroWhatsApp, erroIA, AGORA_TESTE } from './dubles';

const SEG_A_SEX = [1, 2, 3, 4, 5];
// Mesma âncora dos dublês (terça, 25/08/2026 13:00 SP). Vem de `dubles.ts` de
// propósito: duas constantes independentes podiam divergir e o cenário passaria a
// depender de qual arquivo alguém editou por último.
const TERCA_13H = AGORA_TESTE;
const JANELA_COMERCIAL = { inicio: '08:00', fim: '20:00', dias: SEG_A_SEX };

/**
 * Guard de determinismo. A suíte já dependeu da HORA REAL da execução: o dublê
 * agendava com `new Date()` enquanto o motor rodava num relógio fixo nas 13:00 SP,
 * então de manhã 41/41 passava e à noite 18 falhavam. Se alguém reintroduzir
 * relógio de parede no dublê, este teste quebra ANTES de o cenário mentir.
 */
describe('Determinismo do harness', () => {
  test('o follow-up padrão vence em relação ao relógio INJETADO, não ao real', () => {
    const f = followupFalso();
    assert.ok(f.agendado_para.getTime() < AGORA_TESTE,
      'agendado_para tem de estar no passado da âncora, senão a fila vem vazia');
    assert.ok(Math.abs(f.agendado_para.getTime() - Date.now()) > 60_000,
      'agendado_para não pode ser derivado de Date.now(): isso reintroduz a dependência da hora de execução');
  });

  test('o relógio do repositório é o mesmo do motor', () => {
    const repo = new RepoFalso([followupFalso()]);
    portasDeTeste({ repo });
    assert.equal(repo.agora(), AGORA_TESTE);
  });
});

describe('Cenário 1 — cadência curta: dois passos no mesmo dia', () => {
  test('passo 0 e passo 1 saem no mesmo ciclo, com o intervalo entre eles', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, passo_ordem: 0, agendado_para: new Date(TERCA_13H - 60_000) }),
      followupFalso({ id: 2, passo_ordem: 1, agendado_para: new Date(TERCA_13H - 1_000) }),
    ]);
    repo.intervalos = { 5: { min: 45, max: 90 } };
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 2, 'os dois passos devem sair no mesmo dia');
    assert.deepEqual(p.despachos, [1, 2], 'na ordem da cadência');
    assert.deepEqual(repo.registros.map((f) => f.status), ['enviado', 'enviado']);
    assert.deepEqual(p.esperas, [45_000], 'o segundo espera o intervalo anti-ban configurado');
  });

  test('o passo 1 não passa na frente do passo 0 ainda pendente', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, passo_ordem: 0, agendado_para: new Date(TERCA_13H + 600_000) }),
      followupFalso({ id: 2, passo_ordem: 1, agendado_para: new Date(TERCA_13H - 1_000) }),
    ]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 0);
    assert.equal(repo.registros[1].status, 'pendente', 'o passo 1 espera a vez dele');
  });
});

describe('Cenário 3 — conversa manual do operador não bloqueia o follow-up', () => {
  test('mensagem manual não entra no espaçamento: a fila anda', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    repo.intervalos = { 5: { min: 60, max: 60 } };
    // `ultimoEnvioAutomaticoPorChip` só conta automação: o operador pode ter acabado
    // de mandar três mensagens no chat do card e nada disso aparece aqui.
    repo.ultimoEnvio = {};
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 1, 'o follow-up sai mesmo com o operador conversando');
    assert.deepEqual(p.esperas, [], 'sem espera: não há envio AUTOMÁTICO recente neste chip');
  });

  test('envio automático recente do MESMO chip continua espaçando', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, remetente_id: 10 })]);
    repo.intervalos = { 5: { min: 60, max: 60 } };
    repo.ultimoEnvio = { 10: TERCA_13H - 20_000 };
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    await executarCiclo(p);

    assert.deepEqual(p.esperas, [40_000], 'espera os 40s que faltam para completar 60s');
  });

  test('chips diferentes não esperam um pelo outro', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, lead_id: 100, remetente_id: 10 }),
      followupFalso({ id: 2, lead_id: 200, remetente_id: 20 }),
    ]);
    repo.intervalos = { 5: { min: 20, max: 20 } };
    repo.ultimoEnvio = { 10: TERCA_13H - 5_000 };   // só o chip 10 enviou há pouco
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 2);
    assert.deepEqual(p.esperas, [15_000],
      'só o chip 10 espera os 15s que faltam; o chip 20 não herda a dívida dele');
  });

  test('intervalo que não cabe no ciclo adia o chip, sem segurar os outros', async () => {
    // Intervalo de 60s contra um orçamento de ciclo de 55s: o chip 10 não tem como
    // enviar neste ciclo e volta no próximo — o chip 20 segue normalmente.
    const repo = new RepoFalso([
      followupFalso({ id: 1, lead_id: 100, remetente_id: 10 }),
      followupFalso({ id: 2, lead_id: 200, remetente_id: 20 }),
    ]);
    repo.intervalos = { 5: { min: 60, max: 60 } };
    repo.ultimoEnvio = { 10: TERCA_13H - 1_000 };
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 1, 'o chip 20 envia');
    assert.equal(r.restantes, 1, 'o chip 10 fica para o próximo ciclo');
    assert.equal(repo.registros[0].status, 'pendente', 'e continua na fila, sem falhar');
  });
});

describe('Cenário 5 — orçamento de execução estourado', () => {
  test('o ciclo se solta, o registro fica reclamado e nada é duplicado', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: () => new Promise(() => {}),   // LLM pendurado / mídia gigante / lock no banco
      orcamentoFollowupMs: 120,
    });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 0);
    assert.equal(repo.registros[0].status, 'processando',
      "fica em 'processando': o reaper decide pela evidência no histórico, sem reenviar");
    assert.equal(repo.registros[0].tentativas, 1, 'a tentativa é contabilizada');
    assert.ok(p.logs.some((l) => /ORÇAMENTO ESTOURADO/.test(l)), 'o log nomeia o problema');
  });

  test('o estouro de um follow-up não impede o próximo do mesmo chip', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, lead_id: 101 }),
      followupFalso({ id: 2, lead_id: 102 }),
    ]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async (f: any) => (f.id === 1 ? new Promise<never>(() => {}) : 'enviado'),
      orcamentoFollowupMs: 120,
    });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 1, 'o segundo segue normalmente');
    assert.equal(repo.registros[1].status, 'enviado');
  });

  test('o reaper roda no começo de todo ciclo', async () => {
    const repo = new RepoFalso([]);
    const p = portasDeTeste({ repo, agora: TERCA_13H });
    await executarCiclo(p);
    assert.equal(repo.orfaosResolvidos, 1);
  });
});

describe('Cenário 6 — falhas do canal de WhatsApp', () => {
  test('403 do WhatsApp não é lido como credencial de IA e não pausa a empresa', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(403, 'Forbidden'); },
      chip: { estado: 'bloqueado', exigeIntervencao: true, motivo: 'chip BANIDO pela Meta', porta: 3011 },
    });

    const r = await executarCiclo(p);

    assert.deepEqual(r.empresasPausadas, [], 'a empresa NÃO é pausada por problema de chip');
    assert.equal(repo.registros[0].erro_categoria, 'canal_bloqueado');
    assert.match(repo.registros[0].erro!, /Canal de WhatsApp indisponível/);
  });

  test('chip banido responde 503 — vira falha explícita, sem retry infinito', async () => {
    // A instância devolve 503 "WhatsApp não conectado" tanto reiniciando quanto banida;
    // quem desempata é o diagnóstico do chip.
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(503, 'WhatsApp não conectado'); },
      chip: { estado: 'bloqueado', exigeIntervencao: true, motivo: 'chip BANIDO pela Meta (403 forbidden)', porta: 3011 },
    });

    const r = await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'falhou', 'para de tentar em vez de repetir a cada 15min');
    assert.equal(r.falhados, 1);
    assert.match(repo.registros[0].erro!, /Reconecte o número/);
  });

  test('chip apenas reconectando é adiado, não queimado', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(503, 'WhatsApp não conectado'); },
      chip: { estado: 'reconectando', exigeIntervencao: false, motivo: 'instância reiniciando', porta: 3011 },
    });

    await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'pendente', 'volta para a fila');
    assert.equal(repo.registros[0].tentativas, 1);
    assert.ok(repo.registros[0].agendado_para.getTime() > TERCA_13H, 'reagendado para frente');
  });

  test('disjuntor: um chip bloqueado não gasta a fila inteira daquele responsável', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, lead_id: 101, remetente_id: 10 }),
      followupFalso({ id: 2, lead_id: 102, remetente_id: 10 }),
      followupFalso({ id: 3, lead_id: 103, remetente_id: 10 }),
    ]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(503, 'WhatsApp não conectado'); },
      chip: { estado: 'bloqueado', exigeIntervencao: true, motivo: 'chip BANIDO', porta: 3011 },
    });

    const r = await executarCiclo(p);

    assert.equal(p.despachos.length, 1, 'só o primeiro é tentado');
    assert.equal(repo.registros[1].status, 'pendente', 'os demais nem são tocados');
    assert.equal(repo.registros[1].tentativas, 0, 'e não gastam tentativa');
    assert.deepEqual(r.chipsBloqueados, [10]);
  });

  test('número sem conta no WhatsApp falha de imediato, sem retry', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(422, 'Número sem conta no WhatsApp'); },
    });

    await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'falhou');
    assert.equal(repo.registros[0].erro_categoria, 'destino_invalido');
  });

  test('erro transitório tem teto: na última tentativa vira falha', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, tentativas: MAX_TENTATIVAS - 1 })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(429, 'too many requests'); },
    });

    await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'falhou', 'não repete para sempre');
    assert.match(repo.registros[0].erro!, new RegExp(`Encerrado após ${MAX_TENTATIVAS} tentativas`));
  });
});

describe('Empresa sem configuração de agente de IA', () => {
  test('vira falha explícita e reagendável, não adiamento perpétuo', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, tipo: 'agente_ia' })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => 'config_ausente',
    });

    const r = await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'falhou',
      'sai da fila: adiar de hora em hora gerava um registro por minuto, para sempre');
    assert.equal(repo.registros[0].erro_categoria, 'config_ausente');
    assert.match(repo.registros[0].erro!, /Configure o agente/);
    assert.equal(repo.registros[0].tentativas, 0,
      'não é tentativa de envio: ausência de configuração não queima o teto de retry');
    assert.equal(r.falhados, 1);
    assert.deepEqual(r.empresasPausadas, [], 'não é pausa: não há o que religar');
  });

  test('agente DESLIGADO continua sendo pausa, não falha', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, tipo: 'agente_ia' })]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => 'pausado',
    });

    await executarCiclo(p);

    assert.equal(repo.registros[0].status, 'pendente',
      'desligar o agente pela tela não pode destruir a fila: alguém pode religar hoje');
    assert.equal(repo.registros[0].tentativas, 0);
  });
});

describe('Manutenção do ciclo', () => {
  test('todo ciclo encerra follow-up de lead arquivado', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    await executarCiclo(p);

    assert.equal(repo.arquivadosLimpos, 1,
      'a limpeza roda no ciclo, senão o registro fica pendente para sempre quando o lead é arquivado por SQL cru');
    assert.equal(repo.orfaosResolvidos, 1, 'o reaper também');
  });
});

describe('Cenário 7 — credencial/saldo do provedor de IA', () => {
  test('pausa a empresa e não queima o follow-up', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, tipo: 'agente_ia', lead_id: 101 }),
      followupFalso({ id: 2, tipo: 'agente_ia', lead_id: 102 }),
    ]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroIA(400, 'Your credit balance is too low'); },
    });

    const r = await executarCiclo(p);

    assert.deepEqual(r.empresasPausadas, [5]);
    assert.equal(repo.registros[0].status, 'pendente', 'adiado, não falhado');
    assert.equal(repo.registros[0].erro_categoria, 'ia_credencial');
    assert.equal(p.despachos.length, 1, 'o resto da empresa não é tentado no mesmo ciclo');
  });

  test('403 da IA pausa; 403 do WhatsApp não — mesmo código, destinos opostos', async () => {
    const repoIA = new RepoFalso([followupFalso({ id: 1, tipo: 'agente_ia' })]);
    const pIA = portasDeTeste({
      repo: repoIA, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroIA(403, 'permission_error'); },
    });
    const rIA = await executarCiclo(pIA);

    const repoWa = new RepoFalso([followupFalso({ id: 1 })]);
    const pWa = portasDeTeste({
      repo: repoWa, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async () => { throw erroWhatsApp(403, 'Forbidden'); },
      chip: { estado: 'bloqueado', exigeIntervencao: true, motivo: 'ban', porta: 3011 },
    });
    const rWa = await executarCiclo(pWa);

    assert.deepEqual(rIA.empresasPausadas, [5]);
    assert.deepEqual(rWa.empresasPausadas, []);
  });
});

describe('Cenário 8 — concorrência: dois ciclos, um só envio', () => {
  test('o segundo ciclo não reclama o registro que o primeiro pegou', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p1 = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });
    const p2 = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const [r1, r2] = await Promise.all([executarCiclo(p1), executarCiclo(p2)]);

    assert.equal(r1.enviados + r2.enviados, 1, 'exatamente UM envio');
    assert.equal(p1.despachos.length + p2.despachos.length, 1, 'o despacho roda uma vez só');
    assert.equal(repo.registros[0].status, 'enviado');
  });

  test('follow-up cancelado entre a leitura da fila e o envio não é enviado', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1 })]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });
    // Lead movido de estágio (cancela a cadência) logo após a leitura da fila.
    const buscarOriginal = repo.buscarPendentes.bind(repo);
    repo.buscarPendentes = async () => {
      const fila = await buscarOriginal();
      repo.registros[0].status = 'cancelado';
      return fila;
    };

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 0);
    assert.equal(p.despachos.length, 0, 'o claim falha e nada é enviado');
    assert.equal(repo.registros[0].status, 'cancelado');
  });

  test('registro já enviado nunca é reenviado', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, status: 'enviado' })]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });
    const r = await executarCiclo(p);
    assert.equal(r.enviados, 0);
    assert.equal(p.despachos.length, 0);
  });
});

describe('Janela operacional e conflito de configuração', () => {
  test('fora do horário: reagenda para a próxima abertura, não envia', async () => {
    const madrugada = new Date('2026-08-25T03:00:00-03:00').getTime();
    const repo = new RepoFalso([followupFalso({ id: 1, agendado_para: new Date(madrugada - 1000) })]);
    const p = portasDeTeste({ repo, agora: madrugada, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 0);
    assert.equal(repo.registros[0].status, 'pendente');
    const horaSP = Number(repo.registros[0].agendado_para.toLocaleString('pt-BR',
      { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
    assert.ok(horaSP === 8, `deve abrir às 08h (jitter fica dentro da hora), veio ${horaSP}h`);
  });

  test('dias do passo sem interseção com a janela = conflito explícito, não envio silencioso', async () => {
    // Passo só no sábado; janela da empresa de segunda a sexta.
    const repo = new RepoFalso([followupFalso({ id: 1, dias_semana: [6] })]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });

    const r = await executarCiclo(p);

    assert.equal(r.conflitos, 1);
    assert.equal(r.enviados, 0, 'NÃO envia numa terça só porque a janela da empresa permite');
    assert.equal(repo.registros[0].status, 'falhou');
    assert.equal(repo.registros[0].erro_categoria, 'conflito_config');
    assert.match(repo.registros[0].erro!, /Conflito de configuração/);
  });

  test('dias do passo dentro da janela continuam valendo', async () => {
    const repo = new RepoFalso([followupFalso({ id: 1, dias_semana: [2] })]);  // terça
    const p = portasDeTeste({ repo, agora: TERCA_13H, janela: JANELA_COMERCIAL });
    const r = await executarCiclo(p);
    assert.equal(r.enviados, 1);
  });
});

describe('Isolamento entre empresas', () => {
  test('empresa pausada por saldo de IA não segura a outra', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, empresa_id: 5, lead_id: 101, remetente_id: 10, tipo: 'agente_ia' }),
      followupFalso({ id: 2, empresa_id: 32, lead_id: 201, remetente_id: 20 }),
    ]);
    const p = portasDeTeste({
      repo, agora: TERCA_13H, janela: JANELA_COMERCIAL,
      despachar: async (f: any) => {
        if (f.empresa_id === 5) throw erroIA(401, 'invalid x-api-key');
        return 'enviado';
      },
    });

    const r = await executarCiclo(p);

    assert.deepEqual(r.empresasPausadas, [5]);
    assert.equal(r.enviados, 1, 'a empresa 32 envia normalmente');
    assert.equal(repo.registros[1].status, 'enviado');
  });
});

// ─── Chamados #77 e #78 da Panteras (15/09/2026) ──────────────────────────────

/** Instante em São Paulo, para ler as asserções como a cliente leria a agenda. */
const sp = (iso: string) => new Date(`${iso}-03:00`).getTime();

describe('Cenário 9 — passo atrasado não arrasta a cadência junto (#77)', () => {
  // A cadência real: D+1, D+4 e D+12 às 09:00. O passo 0 ficou 18 dias preso (IA sem
  // crédito); quando saiu, os outros dois já estavam vencidos e foram atrás dele em
  // minutos — 29 leads receberam três mensagens seguidas.
  const cadencia = () => [
    followupFalso({ id: 1, passo_ordem: 0, atraso_dias: 1, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-10T09:00:00')) }),
    followupFalso({ id: 2, passo_ordem: 1, atraso_dias: 4, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-13T09:00:00')) }),
    followupFalso({ id: 3, passo_ordem: 2, atraso_dias: 12, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-21T09:00:00')) }),
  ];

  test('só o passo atrasado sai; os seguintes mantêm o intervalo a partir do envio real', async () => {
    const repo = new RepoFalso(cadencia());
    const p = portasDeTeste({ repo, agora: TERCA_13H });

    const r = await executarCiclo(p);

    assert.equal(r.enviados, 1);
    assert.deepEqual(p.despachos, [1], 'os passos 1 e 2 não podem sair no mesmo ciclo');
    assert.deepEqual(p.esperas, [], 'passo reajustado é pulado, sem esperar o anti-ban por ele');
    const [, p1, p2] = repo.registros;
    assert.equal(p1.status, 'pendente');
    assert.equal(p1.agendado_para.getTime(), sp('2026-08-28T09:00:00'), 'D+4 − D+1 = 3 dias depois do envio');
    assert.equal(p2.agendado_para.getTime(), sp('2026-09-05T09:00:00'), 'D+12 − D+4 = 8 dias depois do passo 1');
  });

  test('no fluxo em dia nada muda: o alvo coincide com o horário desenhado', async () => {
    const repo = new RepoFalso([
      followupFalso({ id: 1, passo_ordem: 0, atraso_dias: 1, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-25T09:00:00')) }),
      followupFalso({ id: 2, passo_ordem: 1, atraso_dias: 4, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-28T09:00:00')) }),
    ]);
    const p = portasDeTeste({ repo, agora: TERCA_13H });

    await executarCiclo(p);

    assert.equal(repo.registros[1].agendado_para.getTime(), sp('2026-08-28T09:00:00'));
  });
});

describe('Cenário 10 — chip fora do ar não pula passo da cadência (#78)', () => {
  const bloqueado = { estado: 'bloqueado' as const, exigeIntervencao: true, motivo: 'sem número conectado', porta: 3015 };
  const disponivel = { estado: 'disponivel' as const, exigeIntervencao: false, motivo: 'conectado', porta: 3015 };
  const cadencia = () => [
    followupFalso({ id: 1, passo_ordem: 0, atraso_dias: 1, hora_envio: '09:00', status: 'falhou', erro_categoria: 'canal_bloqueado',
      agendado_para: new Date(sp('2026-08-24T09:00:00')) }),
    followupFalso({ id: 2, passo_ordem: 1, atraso_dias: 4, hora_envio: '09:00', agendado_para: new Date(sp('2026-08-25T09:00:00')) }),
  ];

  test('com o chip ainda fora, o passo seguinte espera o que falhou', async () => {
    const repo = new RepoFalso(cadencia());
    const p = portasDeTeste({ repo, agora: TERCA_13H, chip: bloqueado });

    await executarCiclo(p);

    assert.deepEqual(p.despachos, [], 'o passo 1 não pode sair no lugar do passo 0');
    assert.equal(repo.registros[0].status, 'falhou');
    assert.equal(repo.registros[1].status, 'pendente');
  });

  test('quando o chip volta, a cadência retoma DO passo que falhou', async () => {
    const repo = new RepoFalso(cadencia());
    const p = portasDeTeste({ repo, agora: TERCA_13H, chip: disponivel });

    await executarCiclo(p);

    assert.deepEqual(p.despachos, [1], 'sai primeiro o que tinha falhado');
    assert.equal(repo.registros[0].status, 'enviado');
    assert.equal(repo.registros[1].status, 'pendente');
    assert.equal(repo.registros[1].agendado_para.getTime(), sp('2026-08-28T09:00:00'),
      'e o seguinte conta o intervalo a partir da retomada');
  });

  test('falha que já foi "pulada" (passo posterior enviado) não é retomada', async () => {
    const repo = new RepoFalso([
      ...cadencia().slice(0, 1),
      followupFalso({ id: 2, passo_ordem: 1, status: 'enviado' }),
      followupFalso({ id: 3, passo_ordem: 2, agendado_para: new Date(TERCA_13H - 60_000) }),
    ]);
    const p = portasDeTeste({ repo, agora: TERCA_13H, chip: disponivel });

    await executarCiclo(p);

    assert.deepEqual(p.despachos, [3], 'o passado segue como estava; o passo 2 não fica preso');
    assert.equal(repo.registros[0].status, 'falhou');
  });

  test('falha de número inexistente não é retomada nem segura a cadência', async () => {
    const repo = new RepoFalso(cadencia());
    repo.registros[0].erro_categoria = 'destino_invalido';
    const p = portasDeTeste({ repo, agora: TERCA_13H, chip: disponivel });

    await executarCiclo(p);

    assert.deepEqual(p.despachos, [2]);
    assert.equal(repo.registros[0].status, 'falhou');
  });
});
