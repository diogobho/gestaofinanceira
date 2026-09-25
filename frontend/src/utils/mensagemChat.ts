// Peças do chat do card compartilhadas entre o balão e o compositor (#188).

// As mesmas seis do atalho do WhatsApp — quem usa o app reconhece de cara.
export const REACOES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const ROTULO_TIPO: Record<string, string> = {
  imagem: '📷 Imagem', audio: '🎤 Áudio', video: '🎥 Vídeo', documento: '📄 Documento',
  sticker: 'Figurinha', location: '📍 Localização',
}

/** Trecho de uma mensagem para a citação: texto numa linha, ou o tipo da mídia. */
export function trechoDaMensagem(conteudo?: string | null, tipo?: string | null): string {
  const texto = (conteudo || '').replace(/\s+/g, ' ').trim()
  if (texto) return texto
  return (tipo && ROTULO_TIPO[tipo]) || 'Mensagem'
}
