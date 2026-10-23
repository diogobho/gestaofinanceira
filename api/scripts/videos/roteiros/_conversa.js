/**
 * Conversa de exemplo no card do Eduardo Freitas (demo, contato 16837) e o que muda nela
 * conforme o vídeo "envia": a resposta citando, a reação e o áudio. Nada sai de verdade.
 */
const AUDIO_DEMO = 'https://duofuturo.tech/assets/videos/tutoriais/demo/audio.ogg';
const atras = (min) => new Date(Date.now() - min * 60000).toISOString();

function criarConversa() {
  const estado = { respondeu: false, reagiu: false, audio: false };
  const msg = (id, direcao, conteudo, min, extra = {}) => ({
    id, contato_whatsapp_id: 16837, usuario_id: 55, whatsapp_message_id: `wamid.demo${id}`, direcao, tipo: 'texto',
    conteudo, enviado_at: atras(min), created_at: atras(min), entregue_at: direcao === 'saida' ? atras(min) : null,
    lido_at: direcao === 'saida' ? atras(min - 1) : null, reacao_contato: null, reacao_minha: null, ...extra,
  });
  const historico = () => {
    const h = [
      msg(1, 'entrada', 'Oi! Vi a proposta que você mandou, gostei bastante 😊', 95),
      msg(2, 'saida', 'Que bom, Eduardo! Ficou alguma dúvida?', 90),
      msg(3, 'entrada', 'Só uma: dá para fazer em 3 vezes?', 12),
    ];
    if (estado.reagiu) h[0] = { ...h[0], reacao_minha: '👍' };
    if (estado.respondeu) h.push(msg(4, 'saida', 'Dá sim! Em até 3 vezes no cartão, sem juros.', 1, {
      resposta_a_message_id: 'wamid.demo3', citada_conteudo: 'Só uma: dá para fazer em 3 vezes?', citada_direcao: 'entrada', citada_tipo: 'texto' }));
    if (estado.audio) h.push(msg(5, 'saida', null, 0, { tipo: 'audio', media_url: AUDIO_DEMO, media_mimetype: 'audio/ogg', media_filename: 'audio.ogg' }));
    return h.reverse(); // a API devolve da mais nova para a mais antiga; a tela inverte
  };
  return { estado, simulacao: [/\/crm\/contatos\/16837\/historico/, () => historico()] };
}

// Passa o mouse sobre o balão (as ações aparecem no hover) e clica no botão de título `titulo`.
async function acaoNoBalao(h, trecho, titulo) {
  const alvo = await h.p.evaluate((t, ti) => {
    const p = [...document.querySelectorAll('p,span,div')].find((e) => e.children.length === 0 && (e.textContent || '').includes(t));
    const linha = p.closest('.group');
    linha.scrollIntoView({ block: 'center' });
    const b = linha.getBoundingClientRect();
    const bt = linha.querySelector(`button[title="${ti}"]`).getBoundingClientRect();
    return { balao: { x: b.x + b.width / 2, y: b.y + b.height / 2 }, botao: { x: bt.x + bt.width / 2, y: bt.y + bt.height / 2 } };
  }, trecho, titulo);
  await h.ir(alvo.balao.x, alvo.balao.y, 700);
  await h.dorme(500);
  await h.clicarPonto(alvo.botao, { ms: 600 });
}

module.exports = { criarConversa, acaoNoBalao };
