#!/usr/bin/env node
/**
 * Regrava `onboarding_modelos` com o padrão de `modules/onboarding/conteudo.ts`.
 *
 * Existe por causa de uma pegadinha do serviço: a tabela GANHA do código. O
 * `modeloDoPlano` lê a linha e só semeia com o padrão quando ela não existe
 * (`if (existente.rows[0]) return`). Ou seja, corrigir o TypeScript e subir NÃO
 * muda o e-mail que sai — as três linhas foram semeadas em 13/09/2026 e ficariam
 * como estavam para sempre.
 *
 *   node scripts/resemear_onboarding_modelos.js            # mostra o que mudaria
 *   node scripts/resemear_onboarding_modelos.js --aplicar
 *   node scripts/resemear_onboarding_modelos.js --aplicar --plano=3
 *
 * Só toca em linha que a EQUIPE não editou (`atualizado_por IS NULL`): quem
 * escreveu à mão em /gestao/onboarding não pode ser sobrescrito por um deploy.
 * Use `--forcar` para passar por cima disso, sabendo o que está fazendo.
 */
require('dotenv').config();

const { query, pool } = require('../dist/config/database');
const {
  assuntoPadrao,
  corpoPadrao,
  whatsappPadrao,
  planoSlug,
  PLANOS,
} = require('../dist/modules/onboarding/conteudo');

const aplicar = process.argv.includes('--aplicar');
const forcar = process.argv.includes('--forcar');
const sóPlano = Number((process.argv.find((a) => a.startsWith('--plano=')) || '').split('=')[1]) || null;

const c = { ok: '\x1b[32m', no: '\x1b[31m', wa: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };

(async () => {
  const r = await query(
    `SELECT m.*, p.nome AS plano_nome FROM onboarding_modelos m
       JOIN planos p ON p.id = m.plano_id ORDER BY m.plano_id`
  );
  let mudou = 0;

  for (const linha of r.rows) {
    if (sóPlano && linha.plano_id !== sóPlano) continue;
    const slug = planoSlug(linha.plano_nome, linha.plano_id);
    const novo = {
      email_assunto: assuntoPadrao(slug),
      email_corpo: corpoPadrao(slug),
      whatsapp_texto: whatsappPadrao(slug),
      pdf_arquivo: PLANOS[slug].pdf,
    };
    const campos = Object.keys(novo).filter((k) => linha[k] !== novo[k]);

    console.log(`\n${linha.plano_nome} (id ${linha.plano_id}, ${slug})`);
    if (!campos.length) {
      console.log(`  ${c.ok}já está igual ao padrão${c.off}`);
      continue;
    }
    if (linha.atualizado_por && !forcar) {
      console.log(`  ${c.wa}editado à mão pelo usuário #${linha.atualizado_por} — não vou sobrescrever (--forcar)${c.off}`);
      continue;
    }
    for (const k of campos) {
      console.log(`  ${c.wa}muda${c.off} ${k}  ${c.dim}${String(linha[k]).length} → ${String(novo[k]).length} caracteres${c.off}`);
    }
    // O que importa conferir a olho: o passo do canal e o do disparo.
    const antes = String(linha.email_corpo);
    const depois = novo.email_corpo;
    const marcas = ['QR Code', 'número oficial', 'janela', 'Dispare para muita gente', 'Dispare e-mail'];
    for (const m of marcas) {
      const a = antes.includes(m), d = depois.includes(m);
      if (a !== d) console.log(`    ${d ? c.ok + 'entra' : c.no + 'sai  '}${c.off} "${m}"`);
    }
    mudou++;

    if (aplicar) {
      await query(
        `UPDATE onboarding_modelos
            SET email_assunto = $2, email_corpo = $3, whatsapp_texto = $4, pdf_arquivo = $5,
                updated_at = now()
          WHERE plano_id = $1`,
        [linha.plano_id, novo.email_assunto, novo.email_corpo, novo.whatsapp_texto, novo.pdf_arquivo]
      );
      console.log(`  ${c.ok}gravado${c.off}`);
    }
  }

  console.log(
    `\n${mudou} modelo(s) ${aplicar ? 'atualizado(s)' : 'a atualizar'}.` +
      (aplicar ? '' : `  ${c.dim}(--aplicar para gravar)${c.off}`)
  );
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
