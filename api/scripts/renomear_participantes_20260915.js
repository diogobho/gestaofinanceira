/**
 * Leads "Participante 55…" — nome provisório que a importação de grupo usava quando não
 * achava nome (antes de 15/09/2026). Renomeia com o nome que a conta já tem para o número,
 * pela mesma regra da importação (`contatosService.nomesConhecidos`: contato da empresa,
 * agenda antes do nome de perfil, depois lead), e completa com a agenda dos chips da
 * empresa lida do disco — os chips que importaram podem estar fora do ar, e aí o `/chats`
 * deles não responde.
 *
 * Só toca em quem se chama exatamente "Participante <dígitos>". Sem nome conhecido, fica
 * como está. Registra a atividade no card.
 *
 *   node scripts/renomear_participantes_20260915.js --empresa=5            # simula
 *   node scripts/renomear_participantes_20260915.js --empresa=5 --aplicar  # grava
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { query } = require('../dist/config/database');
const { contatosService } = require('../dist/modules/crm/contatos/contatos.service');
const { chaveTelefone } = require('../dist/modules/crm/_shared/telefone');

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const EMPRESA = Number(arg('empresa'));
const APLICAR = process.argv.includes('--aplicar');
const USUARIO_SUPORTE = 12; // master@gestao.com
const STORES = '/var/www/apps/whatsapp-integration';

const ehNome = (s) => /[a-zà-ÿ]/i.test(s || '') && !/^participante\s+\d+$/i.test(s || '');

(async () => {
  if (!EMPRESA) throw new Error('Informe --empresa=N');

  const leads = (await query(
    `SELECT id, nome, telefone FROM leads
      WHERE empresa_id = $1 AND nome ~ '^Participante [0-9]+$'`,
    [EMPRESA]
  )).rows;
  const numeros = leads.map((l) => String(l.telefone || l.nome.replace(/\D/g, '')));

  // 1) Banco: contatos da empresa e leads (mesma regra da importação).
  const nomes = await contatosService.nomesConhecidos(numeros, EMPRESA, null);

  // 2) Agenda dos chips da empresa, do disco (nome da agenda antes do nome de perfil).
  const portas = (await query(
    `SELECT DISTINCT whatsapp_porta FROM usuarios WHERE empresa_id = $1 AND whatsapp_porta IS NOT NULL`,
    [EMPRESA]
  )).rows.map((r) => r.whatsapp_porta);
  const chaves = new Set(numeros.map(chaveTelefone).filter(Boolean));
  for (const campo of ['name', 'notify']) {
    for (const porta of portas) {
      const arq = `${STORES}/.contacts-whatsapp-${porta}.json`;
      if (!fs.existsSync(arq)) continue;
      for (const c of JSON.parse(fs.readFileSync(arq, 'utf8'))) {
        const chave = chaveTelefone(String(c.id || '').replace(/@.*$/, ''));
        const nome = String(c[campo] || '').trim();
        if (chave && chaves.has(chave) && !nomes.has(chave) && ehNome(nome)) nomes.set(chave, nome.slice(0, 200));
      }
    }
  }

  const renomear = [];
  for (let i = 0; i < leads.length; i++) {
    const nome = nomes.get(chaveTelefone(numeros[i]) || '');
    if (nome) renomear.push({ ...leads[i], novo: nome });
  }
  console.log(`Leads "Participante": ${leads.length} · com nome conhecido: ${renomear.length} · continuam sem nome: ${leads.length - renomear.length}\n`);
  for (const l of renomear.slice(0, 15)) console.log(`  #${l.id} ${l.nome} → ${l.novo}`);
  if (renomear.length > 15) console.log(`  … e mais ${renomear.length - 15}`);

  if (!APLICAR) {
    console.log('\nSimulação. Rode com --aplicar para gravar.');
    process.exit(0);
  }
  for (const l of renomear) {
    await query(`UPDATE leads SET nome = $1, updated_at = NOW() WHERE id = $2 AND nome = $3`, [l.novo, l.id, l.nome]);
    await query(
      `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
       VALUES ($1, $2, $3, 'atualizacao', $4, $5)`,
      [l.id, USUARIO_SUPORTE, EMPRESA, `Nome preenchido pelo contato salvo: "${l.novo}"`,
       JSON.stringify({ campos: ['nome'], de: l.nome, para: l.novo, origem: 'renomear_participantes_20260915' })]
    );
  }
  console.log(`\n${renomear.length} lead(s) renomeado(s).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
