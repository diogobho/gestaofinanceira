/**
 * Voz dos tutoriais. Cada frase vira um .wav (24 kHz, mono) guardado em cache pelo
 * texto + voz: regravar a tela não gasta voz de novo, só frase nova ou alterada.
 *
 *   VOZ_PROVEDOR=gemini      (padrão) voz pronta do Gemini: VOZ_GEMINI_API_KEY no .env, ou a chave da empresa 1
 *   VOZ_PROVEDOR=elevenlabs  voz clonada — ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no .env
 *   VOZ_ENSAIO=1             sem voz: só confere se o roteiro grava (saída em outra pasta!)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { query } = require('/var/www/apps/gestao_financeira/api/dist/config/database.js');
const { decrypt } = require('/var/www/apps/gestao_financeira/api/dist/utils/crypto.js');

const CACHE = path.join(__dirname, '.cache-voz');
const PROVEDOR = process.env.VOZ_PROVEDOR || 'gemini';
const VOZ_GEMINI = process.env.VOZ_GEMINI || 'Kore';

// VOZ_GEMINI_API_KEY aceita várias chaves separadas por vírgula (a cota grátis é por projeto
// do Google: 10 frases/dia). Esgotou a do dia, passa para a próxima.
const chavesVideo = (process.env.VOZ_GEMINI_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
let chaveAtual = 0;

async function chaveGemini() {
  if (chavesVideo.length) return chavesVideo[chaveAtual];
  // Sem chave própria dos vídeos: a da DuoFuturo (empresa 1) — nunca a chave de um cliente.
  const r = (await query(`SELECT gemini_api_key, api_key FROM empresa_ia_credenciais WHERE empresa_id = 1`)).rows[0];
  const k = r?.gemini_api_key || r?.api_key;
  if (!k) throw new Error('Empresa 1 sem chave do Gemini');
  try { return decrypt(k); } catch { return k; }
}

async function gemini(texto, idioma = 'pt') {
  // Plano gratuito do Gemini TTS: limite por minuto (o 429 se resolve esperando) e por dia (não).
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    const key = await chaveGemini();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: idioma === 'en'
            ? `Read in clear, neutral American English, in a calm and friendly tone, like someone explaining a product: ${texto}`
            : `Leia em português do Brasil, com tom acolhedor e natural, de quem explica para um cliente, sem pressa: ${texto}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_GEMINI } } } },
        }),
      }
    );
    const j = await res.json();
    const b64 = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (b64) return { pcm: Buffer.from(b64, 'base64'), rate: 24000 };
    // O plano gratuito também tem teto DIÁRIO (10 frases/dia no TTS): esse não passa esperando.
    if (res.status === 429 && JSON.stringify(j.error?.details || []).includes('PerDay')) {
      if (chaveAtual + 1 < chavesVideo.length) {
        chaveAtual++;
        console.log(`  voz: cota do dia esgotada — passando para a chave ${chaveAtual + 1} de ${chavesVideo.length}`);
        tentativa--; continue;
      }
      throw new Error(`Cota diária do Gemini TTS esgotada (plano gratuito: 10 frases/dia). ${(j.error.message.match(/retry in [^.]+/) || [''])[0]}. As frases já geradas ficam no cache.`);
    }
    console.log(`  voz: tentativa ${tentativa} falhou (${res.status})${res.status === 429 ? ' — limite por minuto, esperando' : ' ' + JSON.stringify(j).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, res.status === 429 ? 25000 : 3000 * tentativa));
  }
  throw new Error('Gemini não devolveu áudio');
}

async function elevenlabs(texto) {
  const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voz } = process.env;
  if (!key || !voz) throw new Error('Faltam ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no .env');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=pcm_24000`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2', language_code: 'pt' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { pcm: Buffer.from(await res.arrayBuffer()), rate: 24000 };
}

/** Devolve { arquivo, duracao } — duração em segundos, medida no próprio .wav. */
/** `idioma: 'en'` = narração em inglês (vídeo de verificação do Google). */
async function falar(texto, idioma = 'pt') {
  fs.mkdirSync(CACHE, { recursive: true });
  // Ensaio (VOZ_ENSAIO=1): silêncio com a duração estimada da fala (~14 caracteres/s), para
  // validar a gravação de um roteiro sem gastar cota de voz.
  if (process.env.VOZ_ENSAIO) {
    fs.mkdirSync(CACHE, { recursive: true });
    const duracao = Math.max(1.2, texto.length / 14);
    const wav = path.join(CACHE, `ensaio-${Math.round(duracao * 10)}.wav`);
    if (!fs.existsSync(wav)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', duracao.toFixed(1), wav]);
    return { arquivo: wav, duracao: Number(duracao.toFixed(1)) };
  }
  const voz = PROVEDOR === 'elevenlabs' ? `eleven-${process.env.ELEVENLABS_VOICE_ID}` : `gemini-${VOZ_GEMINI}`;
  const id = crypto.createHash('sha1').update(`${voz}|${idioma === 'en' ? 'en|' : ''}${texto}`).digest('hex').slice(0, 16);
  const wav = path.join(CACHE, `${id}.wav`);
  if (!fs.existsSync(wav)) {
    const { pcm, rate } = PROVEDOR === 'elevenlabs' ? await elevenlabs(texto) : await gemini(texto, idioma);
    const bruto = path.join(CACHE, `${id}.pcm`);
    fs.writeFileSync(bruto, pcm);
    // Corta o silêncio das pontas: o ritmo do vídeo é medido pela fala, não pelo respiro.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', bruto,
      '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
      wav]);
    fs.unlinkSync(bruto);
  }
  const duracao = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  return { arquivo: wav, duracao };
}

module.exports = { falar };
