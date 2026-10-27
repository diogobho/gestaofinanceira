/**
 * Chat do Duo simulado nos vídeos do Duo (23/10/2026): o histórico começa vazio e cada
 * mensagem enviada recebe a resposta da primeira regra cujo trecho aparece no texto.
 * Nada vai para a IA nem grava — o gerador responde o POST localmente.
 */
const HISTORICO = [/\/chat-financeiro\/historico/, () => []];

function respostasDoDuo(regras) {
  return [/\/chat-financeiro\/mensagem/, (_url, corpo) => {
    let msg = '';
    try { msg = JSON.parse(corpo || '{}').mensagem || ''; } catch { /* corpo vazio */ }
    const r = regras.find(([trecho]) => msg.toLowerCase().includes(trecho.toLowerCase()));
    return { resposta: r ? r[1] : 'Certo!' };
  }];
}

// Digita no campo do chat e envia (Enter).
async function mandar(h, texto, { atraso = 28 } = {}) {
  await h.clicar('textarea[aria-label="Mensagem para o Duo"]', '', { ms: 600 });
  await h.p.evaluate(() => { const t = document.querySelector('textarea[aria-label="Mensagem para o Duo"]'); t.select(); });
  await h.digitar(texto, atraso);
  await h.dorme(300);
  await h.p.keyboard.press('Enter');
}

module.exports = { HISTORICO, respostasDoDuo, mandar };
