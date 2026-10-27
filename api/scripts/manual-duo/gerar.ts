/**
 * Manual do Duo em PDF (23/10/2026). Lê os comandos da mesma lista da tela
 * Comandos do Duo (frontend/src/utils/comandosDuo.ts) e grava em
 * landing/assets/manuais/manual-duo.pdf → https://duofuturo.tech/assets/manuais/manual-duo.pdf
 *
 *   cd api && npx tsx scripts/manual-duo/gerar.ts
 */
import fs from 'fs';
import path from 'path';
import { FRENTES_DUO } from '../../../frontend/src/utils/comandosDuo';
const puppeteer = require('/var/www/apps/whatsapp-integration/node_modules/puppeteer');

const SAIDA = '/var/www/apps/landing/assets/manuais/manual-duo.pdf';
const FONTES = path.resolve(__dirname, '../videos/fonts');
const DUO = fs.readFileSync(path.resolve(__dirname, '../../../frontend/public/avatar/duo-face.svg'), 'utf8');
// Fonte embutida: página montada por setContent não carrega file://.
const fonte = (arq: string) => `data:font/ttf;base64,${fs.readFileSync(path.join(FONTES, arq)).toString('base64')}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const destacar = (s: string) => esc(s).replace(/\[([^\]]+)\]/g, '<span class="troca">[$1]</span>');

const comandos = FRENTES_DUO.map(f => `
  <section class="frente">
    <h3>${esc(f.titulo)}</h3>
    <p class="sub">${esc(f.descricao)}</p>
    ${f.comandos.map(c => `
      <div class="cmd">
        <div class="cmd-titulo">${esc(c.titulo)}${c.pedeConfirmacao ? ' <span class="tag">pede confirmação</span>' : ''}</div>
        <div class="cmd-texto">${destacar(c.texto)}</div>
        ${c.observacao ? `<div class="obs">${esc(c.observacao)}</div>` : ''}
      </div>`).join('')}
  </section>`).join('');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
@font-face { font-family: Poppins; font-weight: 500; src: url('${fonte('Poppins-Medium.ttf')}'); }
@font-face { font-family: Poppins; font-weight: 600; src: url('${fonte('Poppins-SemiBold.ttf')}'); }
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
body { font-family: Poppins, Arial, sans-serif; font-weight: 500; color: #1f2937; font-size: 10.5pt; line-height: 1.55; margin: 0; }
h1, h2, h3 { color: #13264C; font-weight: 600; line-height: 1.25; }
h2 { font-size: 17pt; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 3px solid #D2B773; }
h3 { font-size: 13pt; margin: 18px 0 2px; }
p { margin: 6px 0; }
.capa { height: 297mm; display: flex; flex-direction: column; justify-content: center; background: #13264C; color: #F7F3EA; margin: 0; padding: 0 22mm; page-break-after: always; position: relative; }
.capa .faixa { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #10b981; }
.capa .duo { width: 150px; height: 150px; margin-bottom: 28px; background: #F1E9DA; border-radius: 50%; overflow: hidden; border: 4px solid #D2B773; }
.capa .duo svg { width: 100%; height: 100%; display: block; }
.capa h1 { color: #F7F3EA; font-size: 36pt; margin: 0; }
.capa .linha { color: #D2B773; font-size: 15pt; margin-top: 8px; }
.capa .rodape { position: absolute; bottom: 22mm; left: 22mm; color: #C9D3E6; font-size: 10pt; }
.pagina { page-break-before: always; }
ol, ul { padding-left: 20px; margin: 6px 0; }
li { margin: 3px 0; }
.caixa { border-radius: 10px; padding: 10px 14px; margin: 10px 0; page-break-inside: avoid; }
.verde { background: #ecfdf5; border: 1px solid #a7f3d0; }
.amarela { background: #fffbeb; border: 1px solid #fde68a; }
.azul { background: #eef2f9; border: 1px solid #c9d3e6; }
.caixa b, b { font-weight: 600; color: #13264C; }
code, .url { font-family: Poppins, monospace; background: #eef2f9; color: #13264C; padding: 1px 6px; border-radius: 4px; }
.frente { page-break-inside: auto; }
.sub { color: #6b7280; margin-top: 0; }
.cmd { border: 1px solid #e5e7eb; border-left: 4px solid #10b981; border-radius: 8px; padding: 8px 12px; margin: 8px 0; page-break-inside: avoid; }
.cmd-titulo { font-weight: 600; color: #13264C; }
.cmd-texto { margin-top: 2px; }
.troca { color: #b45309; font-weight: 600; }
.tag { font-size: 8pt; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 10px; font-weight: 500; }
.obs { font-size: 8.5pt; color: #6b7280; margin-top: 3px; }
.passo { display: flex; gap: 10px; margin: 8px 0; page-break-inside: avoid; }
.num { flex: 0 0 26px; height: 26px; border-radius: 50%; background: #13264C; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 10pt; }
.fala { margin: 4px 0; padding: 6px 10px; border-radius: 10px; max-width: 85%; page-break-inside: avoid; }
.voce { background: #13264C; color: #fff; margin-left: auto; }
.ele { background: #f3f4f6; }
</style></head><body>

<div class="capa">
  <div class="faixa"></div>
  <div class="duo">${DUO}</div>
  <h1>Manual do Duo</h1>
  <div class="linha">O assistente de IA do seu CRM e Financeiro</div>
  <p style="max-width:120mm;margin-top:18px;color:#C9D3E6">Como usar o Duo dentro do sistema, como conectá-lo ao Claude e os principais comandos de cada área.</p>
  <div class="rodape">DuoFuturo · duofuturo.tech/gestao · versão de outubro de 2026</div>
</div>

<h2>1. O que é o Duo</h2>
<p>O Duo é o assistente de IA do sistema. Você conversa com ele em português normal, como falaria com alguém da equipe, e ele consulta e faz coisas por você no CRM, no WhatsApp e no financeiro.</p>
<p>Ele funciona de dois jeitos, com as mesmas funções:</p>
<ul>
  <li><b>Dentro do sistema:</b> no botão do Duo no canto de baixo da tela, ou em tela cheia no menu Agente IA. Cada conversa usa um pouco dos créditos do Duo da sua conta.</li>
  <li><b>Dentro do Claude:</b> conectando o Duo como conector no Claude (claude.ai ou o aplicativo). A conversa roda no seu plano do Claude e não gasta crédito do Duo.</li>
</ul>

<div class="caixa verde">
  <b>Segurança, nos dois jeitos</b>
  <ul>
    <li>O Duo usa o seu login: só vê e faz o que você já pode ver e fazer nas telas.</li>
    <li>Ele <b>nunca exclui nada</b>. Para apagar, use a tela correspondente.</li>
    <li>Tudo que grava ou envia (criar, editar, mover, lançar, mandar WhatsApp, disparar) passa por <b>confirmação</b>: ele mostra o que vai fazer e só faz depois do seu "sim".</li>
    <li>Cada ação feita pelo Duo fica registrada.</li>
  </ul>
</div>

<h2 style="margin-top:22px">2. Usar o Duo dentro do sistema</h2>
<div class="passo"><div class="num">1</div><div>Clique no <b>Duo</b>, o mascote no canto de baixo à direita de qualquer tela. Abre o chat.</div></div>
<div class="passo"><div class="num">2</div><div>Escreva o que precisa e aperte Enter. Exemplo: <i>"Quais são minhas tarefas de hoje?"</i></div></div>
<div class="passo"><div class="num">3</div><div>Se o pedido grava ou envia algo, o Duo responde com um resumo e pergunta se pode. Responda <b>"sim"</b> para fazer ou <b>"não"</b> para desistir. Para mudar alguma coisa, diga o ajuste ("muda o horário para 16h").</div></div>
<div class="passo"><div class="num">4</div><div>Para ideias prontas, abra <b>Comandos do Duo</b> no menu (ou a lâmpada no topo do chat). Cada comando tem o botão <b>Usar no Duo</b>, que coloca o texto no chat para você trocar o que está entre colchetes e mandar.</div></div>
<div class="caixa azul">
  <b>Atalhos no topo do chat:</b> lâmpada = Comandos do Duo · moeda = Créditos do Duo · setas = tela cheia · lixeira = limpar a conversa.
  <br><b>Créditos:</b> o saldo e a recarga (PIX, boleto ou cartão) ficam em <span class="url">duofuturo.tech/gestao/creditos-duo</span>. Indicando o Duo, você ganha R$ 20 de crédito por indicada que assinar.
</div>

<h2 class="pagina">3. Conectar o Duo ao Claude</h2>
<p>Quem conecta precisa de uma conta no Claude que aceite conectores personalizados. Cada pessoa da equipe conecta com o próprio login do Duo.</p>
<div class="passo"><div class="num">1</div><div>No Duo, abra <b>Agente IA → Configurar Agente</b> e copie o endereço do conector: <span class="url">https://duofuturo.tech/api/gestao/mcp</span></div></div>
<div class="passo"><div class="num">2</div><div>No Claude, abra <b>Configurações → Conectores</b> e escolha <b>adicionar conector personalizado</b>. Dê o nome "Duo" e cole o endereço.</div></div>
<div class="passo"><div class="num">3</div><div>Nas opções avançadas, deixe como o Claude detectar: em <b>Autenticação</b>, "Entrar agora"; em <b>Cliente OAuth</b>, "Registrar automaticamente"; <b>Cabeçalhos de requisição</b> em branco.</div></div>
<div class="passo"><div class="num">4</div><div>Clique em <b>Conectar</b>. Abre uma página do Duo: entre com o seu e-mail e senha do Duo e autorize. O Claude volta mostrando o Duo como conectado, com a lista de ferramentas.</div></div>
<div class="passo"><div class="num">5</div><div>Abra uma <b>conversa nova</b> no Claude e confira, no botão de ferramentas da caixa de mensagem, se o Duo está ligado. Depois é só pedir.</div></div>
<div class="caixa amarela">
  <b>Permissões das ferramentas no Claude.</b> Em "Requer aprovação", o Claude pede licença antes de cada ferramenta. Para ganhar tempo, marque "Sempre permitir" nas ferramentas que só consultam (buscar leads, ler conversas, listar tarefas, resumo financeiro). Nas que gravam ou enviam, o Duo já pede confirmação; mantenha a aprovação se preferir conferir duas vezes.
</div>
<p><b>Desconectar:</b> em Agente IA → Configurar Agente, na lista "Conectados à sua conta", clique em Desconectar. O acesso daquele aplicativo para na hora.</p>

<h2 style="margin-top:22px">4. Como pedir bem</h2>
<ul>
  <li><b>Fale de leads, funis e pessoas pelo nome.</b> O Duo acha o resto sozinho; não precisa saber números de registro.</li>
  <li><b>Diga datas e horários do jeito normal:</b> "amanhã às 10h", "sexta às 15h", "dia 5".</li>
  <li><b>Peça para ver antes:</b> "me mostre antes de enviar" funciona sempre.</li>
  <li><b>Encadeie pedidos:</b> "leia as conversas da etapa Proposta, me diga quem esfriou e agende uma ligação amanhã para cada um".</li>
  <li><b>Ajuste a proposta:</b> se o resumo não estiver certo, diga o que mudar em vez de responder "não".</li>
</ul>

<h3>Exemplo completo: disparo personalizado</h3>
<div class="fala voce">Leia a conversa de cada lead da etapa Proposta Enviada do funil Comercial e prepare uma mensagem para cada um, retomando o que ele falou e convidando para uma conversa de 15 minutos esta semana. Me mostre antes de disparar.</div>
<div class="fala ele">Li as 12 conversas. Seguem as mensagens: Mariana: "Oi Mariana! Você comentou que queria começar em novembro..." · João: "..." Quer que eu dispare agora ou agende?</div>
<div class="fala voce">Troca a do João para falar do desconto à vista. Dispara amanhã às 9h e depois move cada um para Negociação.</div>
<div class="fala ele">Preparei o disparo: 12 mensagens, começando amanhã às 9h, uma a cada 45 a 90 segundos; depois de receber, cada lead vai para Negociação. Posso confirmar?</div>
<div class="fala voce">Sim</div>
<div class="caixa amarela">
  <b>Regras do disparo pelo Duo</b> (as mesmas da tela de Disparos):
  <ul>
    <li>É do plano Enterprise e sai pelo WhatsApp oficial de quem pede (ou por um chip liberado).</li>
    <li>No WhatsApp oficial, mensagem de texto livre só chega para quem escreveu nas últimas 24 horas. Para os outros, use um modelo aprovado pela tela de Disparos.</li>
    <li>Até 100 envios por dia por pessoa, com intervalo entre um e outro para proteger o número. Dá para agendar.</li>
    <li>Quem pediu para não receber mensagens fica de fora automaticamente.</li>
    <li>O andamento aparece na tela de Disparos do CRM, ou pergunte ao Duo: "como estão meus disparos?".</li>
  </ul>
</div>

<h2 class="pagina">5. Comandos por área</h2>
<p>Troque o que está <span class="troca">[entre colchetes]</span> antes de mandar. A mesma lista está no sistema, em <b>Comandos do Duo</b>, com o botão para usar direto.</p>
${comandos}

<h2 style="margin-top:22px">6. O que o Duo ainda não faz</h2>
<ul>
  <li>Excluir qualquer coisa (lead, lançamento, tarefa).</li>
  <li>Mandar áudio, imagem ou arquivo pelo WhatsApp (só texto).</li>
  <li>Criar ou mudar funis, etapas, cadências e configurações do agente.</li>
  <li>Mexer em outra conta ou empresa.</li>
</ul>
<h3>Perguntas frequentes</h3>
<p><b>O Duo respondeu que não tenho acesso.</b> Ele segue as permissões do seu usuário. Peça a quem administra a conta para liberar o módulo.</p>
<p><b>O disparo foi recusado pelo canal.</b> Disparo em massa só sai pelo WhatsApp oficial. Conecte o número oficial em WhatsApp ou peça para quem já está no oficial.</p>
<p><b>O Duo diz que o saldo acabou.</b> Recarregue em Créditos do Duo, ou use pelo Claude, que não consome crédito.</p>
<p><b>O Claude não mostra as ferramentas do Duo.</b> Confira se o conector está ligado na conversa. Se pedir login de novo, entre com o seu e-mail e senha do Duo.</p>
<p><b>Precisa de ajuda?</b> Abra um chamado em Suporte, dentro do sistema, ou escreva para suporte@duofuturo.tech.</p>
</body></html>`;

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'networkidle0' });
  await p.pdf({
    path: SAIDA, format: 'A4', printBackground: true, displayHeaderFooter: true, preferCSSPageSize: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;color:#9ca3af;width:100%;text-align:center;font-family:Arial">Manual do Duo · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
  });
  await b.close();
  console.log('PDF:', SAIDA, fs.statSync(SAIDA).size, 'bytes');
  process.exit(0);
})();
