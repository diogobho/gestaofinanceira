/**
 * Roda a cota de mídia do WhatsApp à mão (a mesma do job diário das 04:30).
 *
 *   node api/scripts/retencao_midia.js            # simulação: quanto sairia de cada empresa
 *   node api/scripts/retencao_midia.js --aplicar  # apaga (só com backup das últimas 26h)
 *
 * Usa o build (`dist/`): rode `npm run build` antes se mexeu em modules/midia/retencao.ts.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { aplicarRetencaoMidia } = require('../dist/modules/midia/retencao');

aplicarRetencaoMidia({ simular: !process.argv.includes('--aplicar') })
  .then((r) => {
    if (r.bloqueado) { console.log(r.bloqueado); process.exit(1); }
    console.log(r.simulacao ? 'SIMULAÇÃO — nada foi apagado' : 'APLICADO');
    console.log(`Grupos: ${r.grupos.arquivos} arquivos, ${r.grupos.liberado_mb} MB`);
    console.table(r.empresas);
    if (r.falhas) console.log(`${r.falhas} falha(s) — ver log acima`);
    process.exit(0);
  })
  .catch((err) => { console.error(err); process.exit(1); });
