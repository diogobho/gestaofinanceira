import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { horaFalada, diaFalado, linkDaTarefa, proximosHorarios, aplicarVariaveisReuniao } from '../src/jobs/reuniao-variaveis';

describe('variáveis dos lembretes de reunião', () => {
  test('hora e dia falados', () => {
    assert.equal(horaFalada('16:00'), '16h');
    assert.equal(horaFalada('09:30'), '9h30');
    assert.equal(diaFalado('2026-10-14'), 'quarta-feira, 14/10');
  });

  test('link: primeiro https da descrição ou do título, sem pontuação colada', () => {
    assert.equal(linkDaTarefa('Entrar em https://meet.google.com/abc-defg-hij.', null), 'https://meet.google.com/abc-defg-hij');
    assert.equal(linkDaTarefa(null, 'Call 16h https://zoom.us/j/123'), 'https://zoom.us/j/123');
    assert.equal(linkDaTarefa('sem link', 'Reunião 14/10'), '');
  });

  test('dois próximos dias úteis no mesmo horário, pulando o fim de semana', () => {
    // 2026-10-09 é sexta: segunda 12 e terça 13
    assert.deepEqual(proximosHorarios('2026-10-09', '16:00'), ['segunda (12/10) às 16h', 'terça (13/10) às 16h']);
  });

  test('tokens trocados; os do lead ficam intactos', () => {
    const t = aplicarVariaveisReuniao('[PrimeiroNome]: [DiaReuniao] às [HoraReuniao] — [LinkReuniao] / [Horario1] ou [Horario2]', {
      diaIso: '2026-10-14', hora: '16:00', data: '14/10', hojeIso: '2026-10-14', descricao: 'https://meet.google.com/x',
    });
    assert.equal(t, '[PrimeiroNome]: quarta-feira, 14/10 às 16h — https://meet.google.com/x / quinta (15/10) às 16h ou sexta (16/10) às 16h');
  });
});
