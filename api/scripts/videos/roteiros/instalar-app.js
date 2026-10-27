/**
 * Instalar o Duo no celular (PWA). A instalação acontece no menu do navegador, que nenhuma
 * gravação de tela alcança: a cena é um celular desenhado por cima da página, com o Duo de
 * verdade rodando dentro (iframe na largura de celular, mesma sessão da demo). Os menus do
 * Chrome e do Safari são ilustrações neutras, sem marca.
 */
const { ENCERRAMENTO } = require('./_comum');

const CENA = `
<style>
#v-cena{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(circle at 30% 20%,#1d3766,#13264C 65%);font-family:Poppins,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:90px}
#v-cena .fone{position:relative;width:340px;height:720px;border-radius:46px;background:#0b0f19;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 0 0 2px #2a3550}
#v-cena .tela{position:relative;width:100%;height:100%;border-radius:36px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
#v-cena .status{height:30px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font-size:12px;font-weight:600;color:#111}
#v-cena .barra{flex:none;margin:2px 10px 6px;display:flex;align-items:center;gap:8px}
#v-cena .url{flex:1;background:#eef1f6;border-radius:18px;padding:8px 12px;font-size:12.5px;color:#334}
#v-cena .ico{width:30px;height:30px;border-radius:15px;display:grid;place-items:center;color:#334;font-size:18px;font-weight:700}
#v-cena iframe{flex:1;width:100%;border:0;background:#f5f6f8}
#v-cena .folha{position:absolute;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.25);font-size:14px;color:#111;opacity:0;transform:translateY(8px);transition:all .3s ease;pointer-events:none}
#v-cena .folha.on{opacity:1;transform:none;pointer-events:auto}
#v-cena .folha div{padding:12px 16px}
#v-cena .menu{top:76px;right:14px;width:210px;border-radius:12px}
#v-cena .dialogo{left:24px;right:24px;top:250px;border-radius:22px;padding:18px}
#v-cena .sheet{left:0;right:0;bottom:0;border-radius:18px 18px 0 0;padding:8px 6px 26px;background:#f2f2f7}
#v-cena .sheet div{background:#fff;margin:0 8px;display:flex;justify-content:space-between}
#v-cena .sheet div:first-of-type{border-radius:12px 12px 0 0}#v-cena .sheet div:last-of-type{border-radius:0 0 12px 12px}
#v-cena .sheet div+div{border-top:1px solid #e3e3e8}
#v-cena .inicio{position:absolute;inset:0;background:linear-gradient(160deg,#2b5876,#4e4376);display:none;padding:70px 22px 0;grid-template-columns:repeat(4,1fr);gap:22px 10px;align-content:start}
#v-cena .inicio.on{display:grid}
#v-cena .app{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#fff}
#v-cena .app i{width:56px;height:56px;border-radius:15px;display:block;background:rgba(255,255,255,.25)}
#v-cena .app img{width:56px;height:56px;border-radius:15px;display:block;box-shadow:0 4px 12px rgba(0,0,0,.3)}
#v-cena .app.novo img{animation:v-surge .6s ease}
@keyframes v-surge{from{transform:scale(.2);opacity:0}to{transform:none;opacity:1}}
#v-cena .lado{width:420px;color:#fff}
#v-cena .lado small{color:#D2B773;letter-spacing:.22em;font-weight:600;font-size:15px}
#v-cena .lado h2{font-size:38px;font-weight:600;margin:10px 0 24px;line-height:1.15}
#v-cena .lado ol{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
#v-cena .lado li{display:flex;gap:14px;align-items:flex-start;font-size:19px;color:#9fb0cc;transition:color .3s}
#v-cena .lado li b{flex:none;width:30px;height:30px;border-radius:15px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:15px}
#v-cena .lado li.on{color:#fff}#v-cena .lado li.on b{background:#D2B773;color:#13264C}
</style>
<div class="fone"><div class="tela" id="v-tela">
  <div class="status"><span>9:41</span><span>●●● ▮</span></div>
  <div class="barra" id="v-barra"><div class="url">🔒 duofuturo.tech/gestao</div><div class="ico" id="v-mais">⋮</div></div>
  <iframe id="v-app" src="/gestao/crm"></iframe>
  <div class="barra" id="v-barra-ios" style="display:none;margin:6px 10px 14px"><div class="ico">‹</div><div class="url" style="text-align:center">duofuturo.tech</div><div class="ico" id="v-compartilhar">⇪</div></div>
  <div class="folha menu" id="v-menu"><div>Nova guia</div><div>Favoritos</div><div>Histórico</div><div id="v-instalar"><b>Instalar app</b></div><div>Compartilhar…</div></div>
  <div class="folha dialogo" id="v-dialogo"><div style="display:flex;gap:12px;align-items:center;padding:0 0 14px"><img src="/gestao/icons/icon-192.png" style="width:44px;height:44px;border-radius:10px"><span><b>Instalar app?</b><br><span style="font-size:12px;color:#667">Duo · duofuturo.tech</span></span></div>
    <div style="display:flex;justify-content:flex-end;gap:18px;padding:0;color:#1a56db;font-weight:600"><span>Cancelar</span><span id="v-confirma">Instalar</span></div></div>
  <div class="folha sheet" id="v-sheet"><p style="text-align:center;font-size:12px;color:#667;margin:6px 0 10px">duofuturo.tech</p>
    <div>Copiar <span>⧉</span></div><div>Adicionar aos Favoritos <span>☆</span></div><div id="v-tela-inicio">Adicionar à Tela de Início <span>⊞</span></div><div>Buscar na Página <span>⌕</span></div></div>
  <div class="folha dialogo" id="v-ios-add" style="top:40px;left:0;right:0;border-radius:0;background:#f2f2f7;bottom:0;padding:14px">
    <div style="display:flex;justify-content:space-between;padding:0 0 18px;font-size:14px"><span style="color:#1a56db">Cancelar</span><b>Adicionar à Tela de Início</b><span style="color:#1a56db;font-weight:600" id="v-ios-confirma">Adicionar</span></div>
    <div style="display:flex;gap:12px;align-items:center;background:#fff;border-radius:12px;padding:12px"><img src="/gestao/icons/apple-touch-icon.png" style="width:52px;height:52px;border-radius:12px"><span><b>Duo</b><br><span style="font-size:12px;color:#667">duofuturo.tech/gestao</span></span></div></div>
  <div class="inicio" id="v-inicio">
    <div class="app"><i></i>Câmera</div><div class="app"><i></i>Fotos</div><div class="app"><i></i>Agenda</div><div class="app"><i></i>Relógio</div>
    <div class="app"><i></i>Mensagens</div><div class="app"><i></i>Notas</div><div class="app"><i></i>Ajustes</div>
    <div class="app novo" id="v-icone"><img src="/gestao/icons/icon-192.png">Duo</div>
  </div>
</div></div>
<div class="lado"><small id="v-plataforma">ANDROID · CHROME</small><h2>Instale o Duo no celular</h2><ol id="v-passos"></ol></div>`;

const PASSOS = {
  android: ['Abra duofuturo.tech/gestao no Chrome', 'Toque em ⋮ e em Instalar app', 'Confirme em Instalar', 'Abra pelo ícone do Duo'],
  ios: ['Abra duofuturo.tech/gestao no Safari', 'Toque em Compartilhar ⇪', 'Adicionar à Tela de Início', 'Entre com seu login no app'],
};
const lado = (h, qual, ativo) => h.p.evaluate((passos, ativo, rotulo) => {
  document.getElementById('v-plataforma').textContent = rotulo;
  document.getElementById('v-passos').innerHTML = passos.map((t, i) => `<li class="${i === ativo ? 'on' : ''}"><b>${i + 1}</b>${t}</li>`).join('');
}, PASSOS[qual], ativo, qual === 'ios' ? 'IPHONE · SAFARI' : 'ANDROID · CHROME');
const liga = (h, id, on = true) => h.p.evaluate((id, on) => document.getElementById(id).classList.toggle('on', on), id, on);

module.exports = {
  canal: 'todos',
  titulo: 'Como instalar o Duo no celular',
  rota: '/crm',
  passos: [
    {
      fala: 'Neste vídeo, você vai ver como colocar o Duo na tela inicial do celular, como um aplicativo. Não precisa de loja: é pelo próprio navegador.',
      acao: async (h) => {
        await h.cartaz('Instale o Duo no celular', 'Android e iPhone · menos de 1 minuto');
        await h.p.evaluate((html) => { const d = document.createElement('div'); d.id = 'v-cena'; d.innerHTML = html; document.body.appendChild(d); }, CENA);
        await lado(h, 'android', 0);
      },
      pausa: 300,
    },
    {
      fala: 'No Android, abra o endereço do Duo no Chrome, e entre com o seu login, como no computador.',
      acao: async (h) => { await h.tirarCartaz(); await h.dorme(600); await h.destacar('#v-barra .url', '', { folga: 4 }); },
    },
    {
      fala: 'Toque nos três pontinhos, no canto de cima, e em Instalar app. Em alguns celulares, a opção se chama Adicionar à tela inicial.',
      acao: async (h) => {
        await h.semDestaque(); await lado(h, 'android', 1);
        await h.clicar('#v-mais', '', { ms: 800 }); await liga(h, 'v-menu'); await h.dorme(900);
        await h.clicar('#v-instalar', '', { ms: 800 }); await liga(h, 'v-menu', false);
      },
    },
    {
      fala: 'Confirme em Instalar. Pronto: o ícone do Duo aparece na tela inicial, junto com os outros aplicativos.',
      acao: async (h) => {
        await lado(h, 'android', 2);
        await liga(h, 'v-dialogo'); await h.dorme(1000);
        await h.clicar('#v-confirma', '', { ms: 800 }); await liga(h, 'v-dialogo', false); await h.dorme(400);
        await liga(h, 'v-inicio'); await h.dorme(900);
        await h.destacar('#v-icone', '', { folga: 6 });
      },
    },
    {
      fala: 'Toque no ícone, e o Duo abre em tela cheia, sem a barra do navegador, direto no CRM.',
      acao: async (h) => {
        await h.semDestaque(); await lado(h, 'android', 3);
        await h.clicar('#v-icone img', '', { ms: 800 });
        await h.p.evaluate(() => { document.getElementById('v-barra').style.display = 'none'; });
        await liga(h, 'v-inicio', false);
      },
    },
    {
      fala: 'No iPhone, use o Safari. Abra o endereço, toque no botão de compartilhar, embaixo, e depois em Adicionar à Tela de Início.',
      acao: async (h) => {
        await lado(h, 'ios', 0);
        await h.p.evaluate(() => { document.getElementById('v-barra-ios').style.display = 'flex'; });
        await h.dorme(1500); await lado(h, 'ios', 1);
        await h.clicar('#v-compartilhar', '', { ms: 800 }); await liga(h, 'v-sheet'); await h.dorme(1000);
        await lado(h, 'ios', 2);
        await h.clicar('#v-tela-inicio', '', { ms: 800 }); await liga(h, 'v-sheet', false);
      },
    },
    {
      fala: 'Toque em Adicionar, no canto de cima. No iPhone, o aplicativo não aproveita o login do Safari: na primeira vez, entre de novo com o seu e-mail e senha.',
      acao: async (h) => {
        await liga(h, 'v-ios-add'); await h.dorme(1000);
        await h.clicar('#v-ios-confirma', '', { ms: 800 }); await liga(h, 'v-ios-add', false);
        await h.p.evaluate(() => { document.getElementById('v-barra-ios').style.display = 'none'; });
        await liga(h, 'v-inicio'); await lado(h, 'ios', 3); await h.dorme(700);
        await h.destacar('#v-icone', '', { folga: 6 });
      },
    },
    ENCERRAMENTO,
  ],
};
