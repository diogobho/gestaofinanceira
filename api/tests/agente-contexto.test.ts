/**
 * Cenário 2 — o agente de follow-up escreve COM contexto.
 *
 * Exercita `buildSystemPromptFollowUp` com o formato exato do registro que o
 * scheduler carrega. É prompt, não SQL: o teste garante que os dados chegam ao
 * modelo, não que o modelo obedeça.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agenteIaService } from '../src/modules/agente-ia/agente-ia.service';

const config: any = {
  tom: 'amigavel', nome_agente: 'Assistente', area_negocio: 'Panteras',
  system_prompt_extra: 'Fale com a voz da Débora.', max_tokens: 1024, contexto_mensagens: 10,
};

/** Como o registro chega de `buscarPendentes`: sem `nome`, só `lead_nome`. */
const registroDoScheduler = {
  id: 77, lead_id: 42, lead_nome: 'Ana Paula', lead_telefone: '5511999',
  lead_email: 'ana@x.com', lead_temperatura: 'quente', lead_notas: 'quer parcelar',
  estagio_nome: 'Reunião Agendada', instrucao_ia: 'Confirme presença na reunião.',
};

/** O lead fresco do banco, mesclado por cima pelo processarFollowUpIA. */
const leadDoBanco = {
  id: 42, nome: 'Ana Paula', telefone: '5511999', empresa: 'Studio AP', cargo: 'Sócia',
  origem: 'Instagram', valor_potencial: '2500.00', moeda: 'BRL',
  created_at: '2026-07-01T12:00:00Z', ultima_resposta_cliente_at: '2026-08-20T17:30:00Z',
};

const agendaComReuniao = {
  pendentes: [{
    tipo: 'reuniao', titulo: 'Reunião de fechamento', descricao: 'Google Meet',
    prioridade: 'alta', quando: '27/08/2026 14:00', quando_data: '27/08/2026',
    atrasada: false, hora_definida: true,
  }],
  concluidas: [{ tipo: 'ligacao', titulo: 'Primeiro contato', status: 'concluida', quando: '01/07/2026 10:00' }],
  proximoFollowup: null,
};

const anotacoes = [
  { conteudo: 'Cliente pediu proposta por escrito', tipo: 'importante', origem: 'usuario' },
  { conteudo: 'Follow-up automático enviado: "oi, tudo bem?"', tipo: 'nota', origem: 'sistema' },
  { conteudo: 'Prefere falar à noite', tipo: 'nota', origem: 'agente' },
];

function montar(over: { agenda?: any; instrucaoEstagio?: string | null } = {}) {
  return agenteIaService.buildSystemPromptFollowUp(
    config,
    { ...registroDoScheduler, ...leadDoBanco },
    { nome: 'Reunião Agendada' },
    registroDoScheduler.instrucao_ia,
    anotacoes,
    ['vip'],
    'Débora',
    over.instrucaoEstagio !== undefined ? over.instrucaoEstagio : 'Confirme a presença sem reabrir negociação.',
    over.agenda !== undefined ? over.agenda : agendaComReuniao
  );
}

describe('Cenário 2 — reunião já agendada chega ao agente', () => {
  test('a reunião aparece com data e hora exatas', () => {
    const p = montar();
    assert.match(p, /REUNIÃO MARCADA/);
    assert.match(p, /27\/08\/2026 14:00/);
  });

  test('o prompt proíbe propor outro horário por conta própria', () => {
    const p = montar();
    assert.match(p, /nunca proponha outro horário/i);
    assert.match(p, /nunca invente outro horário/i);
    assert.match(p, /Não crie outra tarefa de reunião/i);
  });

  test('hora não preenchida vira instrução de confirmar, não de inventar', () => {
    const p = montar({
      agenda: {
        ...agendaComReuniao,
        pendentes: [{ ...agendaComReuniao.pendentes[0], hora_definida: false }],
      },
    });
    assert.match(p, /A HORA não está registrada no sistema/);
    assert.match(p, /NÃO afirme uma hora/);
  });
});

describe('Cenário 2 — demais contextos exigidos', () => {
  test('o nome do lead é resolvido (o registro do scheduler não tem `nome`)', () => {
    const p = montar();
    assert.match(p, /- Nome: Ana Paula/);
    assert.ok(!/undefined/.test(p), 'nenhum campo pode sair como undefined');
  });

  test('instrução do estágio e instrução do passo convivem', () => {
    const p = montar();
    assert.match(p, /Confirme a presença sem reabrir negociação/, 'instrução do ESTÁGIO');
    assert.match(p, /Confirme presença na reunião/, 'instrução do PASSO da cadência');
  });

  test('dados do relacionamento entram no prompt', () => {
    const p = montar();
    assert.match(p, /Instagram/);
    assert.match(p, /R\$\s?2\.500,00/);
    assert.match(p, /É lead desde: 01\/07\/2026/);
    assert.match(p, /Última vez que ELE respondeu/);
  });

  test('sem reunião, nenhum aviso de reunião é inventado', () => {
    const p = montar({ agenda: { pendentes: [], concluidas: [], proximoFollowup: null } });
    assert.ok(!/REUNIÃO MARCADA/.test(p));
    assert.match(p, /Nenhuma tarefa pendente/);
  });
});

describe('Cenário 7 (prompt) — eco de anotação não vira fala de vendedor', () => {
  test('cada anotação é rotulada pela origem', () => {
    const p = montar();
    assert.match(p, /\[anotação de um vendedor · importante\] Cliente pediu proposta/);
    assert.match(p, /\[evento automático do sistema — não é fala de vendedor\] Follow-up automático/);
    assert.match(p, /\[anotação que VOCÊ mesmo registrou\] Prefere falar à noite/);
  });
});
