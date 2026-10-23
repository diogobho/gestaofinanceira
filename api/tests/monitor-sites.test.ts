import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliar, normalizar, textoDoHtml } from '../src/modules/monitor-sites/monitor-sites.service';

const TEXTOS = ['AGUARDANDO LIBERAR NOVAS VAGAS', 'VAGAS INDISPONÍVEIS'];
const FECHADO = `<p>Para realizar o agendamento:</p><button class="btn btn-danger"><span>AGUARDANDO LIBERAR NOVAS VAGAS</span></button>
  <span class="badge badge-danger">VAGAS INDISPONÍVEIS</span>`;
const ABERTO = `<p>Para realizar o agendamento:</p><a class="btn btn-success" href="/realizar-agendamento">AGENDAR AGORA</a>
  <span class="badge badge-success">VAGAS DISPONÍVEIS</span>
  <!-- ATENÇÃO ! VAGAS INDISPONÍVEIS (aviso antigo comentado) -->`;

test('fechado quando algum texto aparece', () => {
  assert.deepEqual(avaliar(FECHADO, TEXTOS), { estado: 'fechado', achado: 'AGUARDANDO LIBERAR NOVAS VAGAS' });
});

test('aberto quando nenhum aparece — comentário HTML não conta', () => {
  assert.equal(avaliar(ABERTO, TEXTOS).estado, 'aberto');
});

test('sem acento e sem caixa: "Vagas indisponiveis" ainda é fechado', () => {
  assert.equal(avaliar('<b>Vagas   indisponiveis</b>', ['VAGAS INDISPONÍVEIS']).estado, 'fechado');
});

test('script e style não entram no texto', () => {
  assert.equal(avaliar('<script>var x="VAGAS INDISPONÍVEIS"</script><p>ok</p>', TEXTOS).estado, 'aberto');
  assert.equal(normalizar(textoDoHtml('<style>.a{}</style>Olá&nbsp;mundo')), 'OLA MUNDO');
});
