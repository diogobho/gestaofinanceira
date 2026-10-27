import { randomBytes } from 'crypto';
import { query } from '../../config/database';
import { env } from '../../config/env';
import { contaazulService } from './contaazul.service';
import { sincronizar, sincronizarAlteracoes } from './contaazul.importacao.service';

/**
 * Conectar o Conta Azul pela tela, como o Asaas (09/10/2026). Botão "Conta Azul" em Receitas e
 * em Despesas; quem administra a empresa escolhe a data e entra na conta do Conta Azul. Depois
 * disso as contas a receber viram receitas e as a pagar, despesas (contaazul.importacao.service).
 *
 * Diferente do Asaas, o Conta Azul tem login (OAuth): não há chave para colar. Todas as empresas
 * autorizam o MESMO aplicativo do Duo (CONTAAZUL_CLIENT_ID/SECRET do .env — migration 107); cada
 * conta fica com o seu refresh_token. Uma empresa pode ter várias contas (a Panteras tem duas).
 *
 * Fluxo: `iniciar` cria a conexão "Conectando …" com a importação desligada e devolve a URL do
 * Conta Azul → o /callback grava o token e chama `concluir`, que dá o nome da conta à conexão,
 * liga a importação e roda a 1ª carga em segundo plano.
 */

export class ErroContaAzul extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const PENDENTE = 'Conectando ';
const VOLTAS = new Set(['receitas', 'despesas']);

export async function status(empresaId: number) {
  const r = await query(
    `SELECT c.id, c.nome, i.ativo AS importando, i.importar_desde::text AS importar_desde, i.importar_ate::text AS importar_ate,
            i.ultima_sync_em, i.ultima_alteracao_em, i.erro, i.conta_nome, i.conta_documento,
            (t.id IS NOT NULL) AS autorizado, COALESCE(t.renovacao_falhas, 0) AS falhas, t.ultimo_erro,
            (SELECT COUNT(*) FROM contaazul_lancamentos l JOIN receitas x ON x.id = l.receita_id
              WHERE l.conexao_id = c.id AND NOT l.espelho_asaas)::int AS receitas,
            (SELECT COUNT(*) FROM contaazul_lancamentos l JOIN despesas x ON x.id = l.despesa_id
              WHERE l.conexao_id = c.id)::int AS despesas,
            (SELECT COUNT(*) FROM contaazul_lancamentos l
              WHERE l.conexao_id = c.id AND l.espelho_asaas)::int AS no_asaas
       FROM contaazul_conexoes c
       LEFT JOIN contaazul_importacao i ON i.conexao_id = c.id
       LEFT JOIN contaazul_tokens t ON t.conexao_id = c.id
      WHERE c.empresa_id = $1 AND c.ativo AND c.nome NOT LIKE '${PENDENTE}%'
      ORDER BY c.ordem, c.id`, [empresaId]);
  return {
    disponivel: Boolean(env.CONTAAZUL_CLIENT_ID && env.CONTAAZUL_CLIENT_SECRET && env.CONTAAZUL_REDIRECT_URI),
    contas: r.rows.map((c: any) => ({
      conexao_id: c.id,
      nome: c.conta_nome || c.nome,
      documento: c.conta_documento,
      importando: c.importando === true,
      importar_desde: c.importar_desde,
      importar_ate: c.importar_ate,
      ultima_sync_em: c.ultima_sync_em,
      ultima_alteracao_em: c.ultima_alteracao_em,
      // Token recusado pelo Conta Azul (app apagado, acesso revogado): só entrando de novo.
      precisa_reconectar: !c.autorizado || c.falhas >= 3 || /invalid_(client|grant)/.test(c.ultimo_erro || ''),
      erro: c.erro || c.ultimo_erro || null,
      receitas: c.receitas,
      despesas: c.despesas,
      ja_no_asaas: c.no_asaas,
    })),
  };
}

async function conexaoDaEmpresa(empresaId: number, conexaoId: number) {
  const r = await query(
    `SELECT c.*, i.conta_id, i.ativo AS importando FROM contaazul_conexoes c
       LEFT JOIN contaazul_importacao i ON i.conexao_id = c.id
      WHERE c.id = $1 AND c.empresa_id = $2`, [conexaoId, empresaId]);
  if (!r.rows[0]) throw new ErroContaAzul('Essa conta do Conta Azul não é desta empresa.', 404);
  return r.rows[0];
}

/** Apaga a conexão por inteiro. Receitas e despesas importadas ficam; só some o vínculo. */
async function apagarConexao(conexaoId: number) {
  await query('DELETE FROM contaazul_lancamentos WHERE conexao_id = $1', [conexaoId]);
  await query('DELETE FROM contaazul_importacao WHERE conexao_id = $1', [conexaoId]);
  await query('DELETE FROM contaazul_tokens WHERE conexao_id = $1', [conexaoId]);
  await query('DELETE FROM contaazul_oauth_states WHERE conexao_id = $1', [conexaoId]);
  await query('DELETE FROM contaazul_conexoes WHERE id = $1', [conexaoId]);
}

/** Cria a conexão provisória e devolve a URL de login do Conta Azul. */
export async function iniciar(
  empresaId: number, usuarioId: number, importarDesde: string, substituir?: number | null, voltarPara?: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importarDesde || '')) throw new ErroContaAzul('Informe a partir de qual data importar.');
  if (!env.CONTAAZUL_CLIENT_ID || !env.CONTAAZUL_CLIENT_SECRET || !env.CONTAAZUL_REDIRECT_URI) {
    throw new ErroContaAzul('A conexão com o Conta Azul não está disponível agora. Fale com o suporte.', 503);
  }
  if (substituir) await conexaoDaEmpresa(empresaId, substituir);

  // Tentativa anterior que não voltou do Conta Azul (a pessoa fechou a aba): sai.
  const velhas = await query(
    `SELECT c.id FROM contaazul_conexoes c
      WHERE c.empresa_id = $1 AND c.nome LIKE '${PENDENTE}%'
        AND NOT EXISTS (SELECT 1 FROM contaazul_tokens t WHERE t.conexao_id = c.id)`, [empresaId]);
  for (const { id } of velhas.rows) await apagarConexao(id);

  let c: any;
  try {
    c = (await query(
      `INSERT INTO contaazul_conexoes (empresa_id, nome, client_id, client_secret, ativo, ordem)
       VALUES ($1, $2, $3, $4, true,
               (SELECT COALESCE(MAX(ordem), 0) + 1 FROM contaazul_conexoes WHERE empresa_id = $1))
       RETURNING id`,
      [empresaId, PENDENTE + randomBytes(4).toString('hex'), env.CONTAAZUL_CLIENT_ID, env.CONTAAZUL_CLIENT_SECRET])).rows[0];
  } catch (e: any) {
    // Sem a 107 o índice único de client_id da 066 ainda está lá: o app compartilhado não entra.
    if (e?.code === '23505') {
      console.error('[ContaAzulImport] falta a migration 107 (índice contaazul_conexoes_client_id)');
      throw new ErroContaAzul('A conexão de contas novas do Conta Azul está sendo liberada. Tente de novo mais tarde ou fale com o suporte.', 503);
    }
    throw e;
  }
  await query(
    `INSERT INTO contaazul_importacao (conexao_id, empresa_id, usuario_id, importar_desde, ativo, substitui_conexao_id, voltar_para)
     VALUES ($1, $2, $3, $4, false, $5, $6)`,
    [c.id, empresaId, usuarioId, importarDesde, substituir || null, VOLTAS.has(voltarPara || '') ? voltarPara : 'receitas']);
  return { url: await contaazulService.iniciarAutorizacao(c.id, usuarioId) };
}

export async function contaConectada(conexaoId: number) {
  const r = await contaazulService.api(conexaoId, '/v1/pessoas/conta-conectada');
  if (r.status !== 200) throw new ErroContaAzul(`O Conta Azul não devolveu os dados da conta (${r.status}).`, 502);
  const c: any = await r.json();
  return {
    id: String(c.id_empresa || ''),
    nome: String(c.nome_fantasia || c.razao_social || 'Conta Azul').trim(),
    documento: String(c.documento || '').replace(/\D/g, '') || null,
  };
}

/** Nome da conexão é único na empresa (índice da 066). */
async function nomeLivre(empresaId: number, conexaoId: number, base: string) {
  const raiz = base.slice(0, 54);
  for (let n = 1; ; n++) {
    const nome = n === 1 ? raiz : `${raiz} (${n})`;
    const r = await query('SELECT 1 FROM contaazul_conexoes WHERE empresa_id = $1 AND nome = $2 AND id <> $3',
      [empresaId, nome, conexaoId]);
    if (!r.rows[0]) return nome;
  }
}

/**
 * Chamado pelo /callback depois de gravar o token. Devolve para onde a pessoa volta, ou null
 * quando a conexão não foi aberta pela tela (autorização manual do /authorize).
 */
export async function concluir(conexaoId: number): Promise<{ voltar: string; nome: string } | null> {
  const imp = (await query(
    `SELECT * FROM contaazul_importacao WHERE conexao_id = $1 AND NOT ativo AND conta_id IS NULL`, [conexaoId])).rows[0];
  if (!imp) return null;
  const voltar = imp.voltar_para || 'receitas';
  let conta;
  try {
    conta = await contaConectada(conexaoId);
  } catch (e) {
    await apagarConexao(conexaoId);
    throw e;
  }

  // A mesma conta já está ligada nesta empresa (fora a que esta substitui): não duplica.
  const repetida = (await query(
    `SELECT i.conexao_id FROM contaazul_importacao i JOIN contaazul_conexoes c ON c.id = i.conexao_id AND c.ativo
      WHERE i.empresa_id = $1 AND i.conta_id = $2 AND i.conexao_id <> $3 AND i.conexao_id IS DISTINCT FROM $4`,
    [imp.empresa_id, conta.id, conexaoId, imp.substitui_conexao_id])).rows[0];
  if (repetida) {
    await apagarConexao(conexaoId);
    throw new ErroContaAzul(`A conta "${conta.nome}" do Conta Azul já está conectada aqui.`, 409);
  }

  let ordem: number | null = null;
  if (imp.substitui_conexao_id) {
    const velha = (await query(
      `SELECT c.id, c.ordem, i.conta_id,
              (SELECT COUNT(*) FROM contaazul_lancamentos l WHERE l.conexao_id = c.id)::int AS vinculos
         FROM contaazul_conexoes c LEFT JOIN contaazul_importacao i ON i.conexao_id = c.id
        WHERE c.id = $1 AND c.empresa_id = $2`, [imp.substitui_conexao_id, imp.empresa_id])).rows[0];
    if (velha) {
      // Os vínculos só passam se for a MESMA conta: numa conta diferente, a passada completa
      // acharia todas as parcelas "excluídas" e cancelaria os lançamentos.
      if (velha.vinculos > 0 && velha.conta_id !== conta.id) {
        await apagarConexao(conexaoId);
        throw new ErroContaAzul('Você entrou numa conta do Conta Azul diferente da que estava conectada. Entre na mesma conta para reconectar.', 409);
      }
      await query('UPDATE contaazul_lancamentos SET conexao_id = $1 WHERE conexao_id = $2', [conexaoId, velha.id]);
      await query('DELETE FROM contaazul_importacao WHERE conexao_id = $1', [velha.id]);
      await query('DELETE FROM contaazul_tokens WHERE conexao_id = $1', [velha.id]);
      // Desligada, não apagada: conexão antiga com app próprio guarda o client dela.
      await query(`UPDATE contaazul_conexoes SET ativo = false, updated_at = now() WHERE id = $1`, [velha.id]);
      ordem = velha.ordem;
    }
  }

  const nome = await nomeLivre(imp.empresa_id, conexaoId, conta.nome);
  await query(
    `UPDATE contaazul_conexoes SET nome = $2, ordem = COALESCE($3, ordem), updated_at = now() WHERE id = $1`,
    [conexaoId, nome, ordem]);
  await query(
    `UPDATE contaazul_importacao SET ativo = true, conta_id = $2, conta_nome = $3, conta_documento = $4,
            substitui_conexao_id = NULL, erro = NULL
      WHERE conexao_id = $1`, [conexaoId, conta.id, conta.nome, conta.documento]);
  console.log(`[ContaAzulImport] empresa ${imp.empresa_id}: conta "${conta.nome}" conectada pela tela (conexão ${conexaoId})`);
  // A 1ª carga leva alguns minutos numa conta grande: roda em segundo plano.
  setImmediate(() => sincronizar(conexaoId).catch((e) => console.error('[ContaAzulImport] carga inicial', conexaoId, e.message)));
  return { voltar, nome };
}

/**
 * Liga a importação numa conta que já está conectada (as da Panteras, autorizadas antes de
 * existir o botão, só alimentavam a aba do Dashboard).
 */
export async function ligarImportacao(empresaId: number, usuarioId: number, conexaoId: number, importarDesde: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importarDesde || '')) throw new ErroContaAzul('Informe a partir de qual data importar.');
  await conexaoDaEmpresa(empresaId, conexaoId);
  let conta;
  try { conta = await contaConectada(conexaoId); }
  catch { throw new ErroContaAzul('O Conta Azul não aceitou esta conta. Use "Reconectar" e entre de novo.', 502); }
  await query(
    `INSERT INTO contaazul_importacao (conexao_id, empresa_id, usuario_id, importar_desde, conta_id, conta_nome, conta_documento)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (conexao_id) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, importar_desde = EXCLUDED.importar_desde,
       conta_id = EXCLUDED.conta_id, conta_nome = EXCLUDED.conta_nome, conta_documento = EXCLUDED.conta_documento,
       ativo = true, erro = NULL`,
    [conexaoId, empresaId, usuarioId, importarDesde, conta.id, conta.nome, conta.documento]);
  setImmediate(() => sincronizar(conexaoId).catch((e) => console.error('[ContaAzulImport] carga inicial', conexaoId, e.message)));
  return status(empresaId);
}

export async function desconectar(empresaId: number, conexaoId: number) {
  const c = await conexaoDaEmpresa(empresaId, conexaoId);
  if (c.client_id === env.CONTAAZUL_CLIENT_ID) {
    await apagarConexao(conexaoId);
  } else {
    // App próprio (as da 066): guarda o client para quem administra reautorizar pelo /authorize.
    await query('DELETE FROM contaazul_lancamentos WHERE conexao_id = $1', [conexaoId]);
    await query('DELETE FROM contaazul_importacao WHERE conexao_id = $1', [conexaoId]);
    await query('DELETE FROM contaazul_tokens WHERE conexao_id = $1', [conexaoId]);
    await query('UPDATE contaazul_conexoes SET ativo = false, updated_at = now() WHERE id = $1', [conexaoId]);
  }
  return status(empresaId);
}

/** "Conferir agora": o que mudou desde a última conferência, em todas as contas da empresa. */
export async function conferir(empresaId: number) {
  const r = await query(
    `SELECT i.conexao_id, i.ultima_alteracao_em FROM contaazul_importacao i JOIN contaazul_conexoes c ON c.id = i.conexao_id
      WHERE i.empresa_id = $1 AND i.ativo AND c.ativo ORDER BY c.ordem, c.id`, [empresaId]);
  if (!r.rows.length) throw new ErroContaAzul('Nenhuma conta do Conta Azul está importando lançamentos.', 404);
  const total = { criada: 0, atualizada: 0, carregando: false };
  const erros: string[] = [];
  for (const { conexao_id, ultima_alteracao_em } of r.rows) {
    // 1ª carga ainda rodando em segundo plano: não começa outra por cima.
    if (!ultima_alteracao_em) { total.carregando = true; continue; }
    try {
      const c = await sincronizarAlteracoes(conexao_id);
      total.criada += c?.criada || 0;
      total.atualizada += c?.atualizada || 0;
    } catch (e: any) { erros.push(e.message); }
  }
  if (erros.length && erros.length === r.rows.length) throw new ErroContaAzul(`O Conta Azul não respondeu: ${erros[0]}`, 502);
  return total;
}
