/**
 * Gera `catalogo.json` ao lado dos vídeos: o que a FAQ (landing e sistema) lê para saber
 * qual vídeo mostrar a quem. `canal`: 'todos' | 'qr' (Profissional, e Enterprise ainda no
 * QR) | 'oficial' (Enterprise no número oficial). Só entra roteiro que já tem mp4.
 * `tema` e a ordem saem de TEMAS abaixo: é por ele que a página pública e a aba Tutoriais
 * do Suporte agrupam. Roteiro novo fora da lista entra em "Outros", no fim.
 *
 *   node api/scripts/videos/catalogo.js [pasta-dos-vídeos]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PASTA = process.argv[2] || '/var/www/apps/landing/assets/videos/tutoriais';
const URL = '/assets/videos/tutoriais';
const TEMAS = [
  ['Usando o Duo', ['ajuda-em-video', 'instalar-app', 'conectar-agenda']],
  ['Primeiros passos no CRM', ['cadastrar-lead', 'mover-lead-etapa', 'organizar-quadro', 'importar-planilha']],
  ['WhatsApp', ['conectar-whatsapp-qr', 'conectar-whatsapp-oficial', 'criar-modelo-abordagem', 'conversa-card', 'conversa-card-oficial', 'disparo-oficial']],
  ['Grupos do WhatsApp', ['conectar-chip-grupos', 'grupos-mensagem-boas-vindas', 'grupos-criar-lead', 'campanhas-grupo']],
  ['Follow-up e automações', ['agendar-followup', 'agendar-followup-oficial', 'cadencia-etapa', 'cadencia-etapa-oficial', 'followup-motivo-falha', 'respostas-botao', 'leads-automaticos', 'agente-ia-etapa']],
  ['E-mail marketing', ['email-marketing']],
  ['Financeiro', ['lancar-receita', 'parcelas-marcar-paga', 'asaas-receitas', 'contaazul-receitas']],
];
const ORDEM = TEMAS.flatMap(([tema, lista]) => lista.map((id) => [id, tema]));
const temaDe = (id) => (ORDEM.find(([i]) => i === id) || [, 'Outros'])[1];
const posicao = (id) => { const i = ORDEM.findIndex(([x]) => x === id); return i < 0 ? ORDEM.length : i; };
const ids = fs.readdirSync(path.join(__dirname, 'roteiros')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.slice(0, -3));

const videos = ids.filter((id) => fs.existsSync(path.join(PASTA, `${id}.mp4`))).map((id) => {
  const r = require(`./roteiros/${id}.js`);
  const duracao = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(PASTA, `${id}.mp4`)]).toString()));
  return { id, titulo: r.titulo, tema: temaDe(id), canal: r.canal || 'todos', rota: r.rota, duracao, mp4: `${URL}/${id}.mp4`, legenda: `${URL}/${id}.vtt`, capa: `${URL}/${id}.jpg` };
}).sort((a, b) => posicao(a.id) - posicao(b.id));
fs.writeFileSync(path.join(PASTA, 'catalogo.json'), JSON.stringify({ atualizado: new Date().toISOString(), videos }, null, 2));
console.log(videos.map((v) => `${v.canal.padEnd(7)} ${String(v.duracao).padStart(3)}s  ${v.id}`).join('\n'));
