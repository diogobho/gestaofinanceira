/**
 * Vídeo de verificação do Google (OAuth, escopo sensível calendar.events) — abertura e
 * encerramento em inglês, com narração. O meio é a gravação REAL do fluxo (tela de
 * consentimento logada, em inglês), feita pelo dono: o Google não aceita simulação e o
 * servidor não entra numa conta Google. `montar.sh` junta tudo.
 * Uso: node verificacao-google/cartelas.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { falar } = require('../tts');

const SAIDA = __dirname;
const FONTE = path.join(__dirname, '../fonts/Poppins-SemiBold.ttf');
const FONTE2 = path.join(__dirname, '../fonts/Poppins-Medium.ttf');

const CARTELAS = {
  abertura: {
    titulo: 'Duo — CRM and Finance with AI',
    linhas: ['Google Calendar integration', 'OAuth scope: calendar.events', 'Project: agente-crm-495614 · duofuturo.tech'],
    falas: [
      'This video shows how Duo, a CRM and finance app by DuoFuturo, uses Google Calendar.',
      'Duo requests one sensitive scope: calendar dot events. It is used only to create, update and delete the events of meetings scheduled inside the Duo CRM, with a Google Meet link.',
      'Duo does not read, copy or store any other event from the user\'s calendar.',
    ],
  },
  encerramento: {
    titulo: 'How Duo uses calendar.events',
    linhas: ['Creates the event when a meeting is scheduled in the CRM', 'Updates it when the meeting is rescheduled', 'Deletes it when the meeting is canceled', 'Never reads other events · Disconnect anytime in My profile'],
    falas: [
      'To summarize: Duo creates the event when a meeting is scheduled in the CRM, updates it when the meeting is rescheduled, and deletes it when the meeting is canceled.',
      'It never reads other events. Users can disconnect at any time in My profile, which deletes the stored tokens and the future events created by Duo.',
    ],
  },
};

const esc = (t) => t.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');

(async () => {
  for (const [nome, c] of Object.entries(CARTELAS)) {
    const vozes = [];
    for (const f of c.falas) vozes.push(await falar(f, 'en'));
    const pausa = 0.6;
    const total = vozes.reduce((s, v) => s + v.duracao + pausa, 0.8);
    // Áudio: as falas em sequência, com respiro.
    const lista = path.join(SAIDA, `${nome}-audio.txt`);
    const sil = path.join(SAIDA, 'silencio.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(pausa), sil]);
    fs.writeFileSync(lista, [`file '${sil}'`, ...vozes.flatMap((v) => [`file '${v.arquivo}'`, `file '${sil}'`])].join('\n'));
    const audio = path.join(SAIDA, `${nome}.wav`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-ar', '48000', '-ac', '2', audio]);
    // Imagem: fundo navy, título dourado, linhas em creme.
    const filtros = [
      `drawtext=fontfile=${FONTE}:text='DUO · GOOGLE OAUTH VERIFICATION DEMO':fontcolor=0xD2B773:fontsize=26:x=(w-tw)/2:y=250`,
      `drawtext=fontfile=${FONTE}:text='${esc(c.titulo)}':fontcolor=white:fontsize=64:x=(w-tw)/2:y=320`,
      ...c.linhas.map((l, i) => `drawtext=fontfile=${FONTE2}:text='${esc(l)}':fontcolor=0xC9D3E6:fontsize=34:x=(w-tw)/2:y=${470 + i * 62}`),
      `drawbox=x=(iw-90)/2:y=430:w=90:h=4:color=0xD2B773:t=fill`,
    ].join(',');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x13264C:s=1920x1080:r=30:d=${total.toFixed(2)}`,
      '-i', audio, '-vf', filtros, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', path.join(SAIDA, `${nome}.mp4`)]);
    console.log(`✔ ${nome}.mp4 — ${total.toFixed(1)}s`);
  }
  process.exit(0);
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
