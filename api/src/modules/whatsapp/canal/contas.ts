import { query, pool } from '../../../config/database';
import { decrypt, encrypt } from '../../../utils/crypto';
import { CredenciaisMeta, consultarNumero } from '../meta/meta-whatsapp.service';

/**
 * Número oficial (Cloud API) — tabela `whatsapp_cloud_contas` (074, alargada pela 084).
 *
 * O resto do sistema continua falando em `usuarios.whatsapp_porta`: ligar o oficial
 * grava a `porta_virtual` da conta na porta de quem passa a usá-lo, e
 * `instancia(porta)` (./instancia.ts) reconhece a porta e fala com a Meta. Assim o
 * follow-up, o disparo, o agente, os lembretes e o chat do card mudam de canal sem
 * uma linha de regra nova — o caminho é o mesmo, só a ponta muda.
 *
 * **A conta é por NÚMERO, e o número tem dono.** `usuario_id` preenchido = o número
 * é daquele operador e só a porta dele muda; `usuario_id` nulo = número da empresa
 * inteira, que é o caso da DuoFuturo (empresa 1, o canal do funil Suporte). Os dois
 * convivem de propósito: num cliente Enterprise a migração do QR para a Cloud API é
 * um operador de cada vez, e no meio do caminho a empresa tem os dois canais no ar.
 *
 * Quem pergunta "qual o número desta pessoa?" chama `contaAtivaDoUsuario`, que cai na
 * conta da empresa como reserva. `contaAtivaDaEmpresa` responde só pela conta da
 * empresa inteira — é o que o webhook e a janela de 24h precisam saber.
 */

export interface ContaCloud {
  id: number;
  empresa_id: number;
  /** Dono do número. NULL = número da empresa inteira. */
  usuario_id: number | null;
  phone_number_id: string;
  waba_id: string;
  numero: string | null;
  nome_exibicao: string | null;
  porta_virtual: number;
  token_enc: string | null;
  ativo: boolean;
  portas_anteriores: Record<string, number | null>;
  ativado_em: string | null;
  business_id: string | null;
  pin_enc: string | null;
  qualidade: string | null;
  pagamento_ok: boolean | null;
  /** 'manual' (cadastrado pela DuoFuturo) ou 'embedded_signup' (o cliente autorizou). */
  origem: string;
  conectado_em: string | null;
}

/** Faixa das portas virtuais (CHECK da 074). As instâncias Baileys vivem em 3010–3200. */
export const PORTA_VIRTUAL_MINIMA = 49000;

export function ehPortaVirtual(porta: number | string | null | undefined): boolean {
  return Number(porta) >= PORTA_VIRTUAL_MINIMA;
}

// Cache curto por processo. São 3 instâncias no cluster: quem liga/desliga limpa o
// próprio cache na hora e os outros dois enxergam em até TTL_MS.
const TTL_MS = 15_000;
let cache: { em: number; contas: ContaCloud[] } | null = null;

async function todas(): Promise<ContaCloud[]> {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.contas;
  const r = await query(`SELECT * FROM whatsapp_cloud_contas ORDER BY id`);
  cache = { em: Date.now(), contas: r.rows };
  return r.rows;
}

export function limparCacheContas() {
  cache = null;
}

export async function contaPorPorta(porta: number): Promise<ContaCloud | null> {
  return (await todas()).find((c) => c.porta_virtual === Number(porta)) ?? null;
}

export async function contaPorPhoneNumberId(phoneNumberId: string): Promise<ContaCloud | null> {
  return (await todas()).find((c) => c.phone_number_id === String(phoneNumberId)) ?? null;
}

/**
 * Conta "da empresa inteira" (sem dono): o número que vale para todos os usuários
 * dela. É o caso da DuoFuturo (empresa 1). Número de um operador específico NÃO
 * responde aqui — para isso existe `contaDoUsuario`.
 */
export async function contaDaEmpresa(empresaId: number): Promise<ContaCloud | null> {
  return (await todas()).find((c) => c.empresa_id === Number(empresaId) && c.usuario_id === null) ?? null;
}

/** Todas as contas de uma empresa — a da empresa inteira e as dos operadores. */
export async function contasDaEmpresa(empresaId: number): Promise<ContaCloud[]> {
  return (await todas()).filter((c) => c.empresa_id === Number(empresaId));
}

export async function contaDoUsuario(usuarioId: number): Promise<ContaCloud | null> {
  return (await todas()).find((c) => c.usuario_id === Number(usuarioId)) ?? null;
}

/** A empresa está falando pelo número oficial agora? (conta da empresa inteira) */
export async function contaAtivaDaEmpresa(empresaId: number): Promise<ContaCloud | null> {
  const c = await contaDaEmpresa(empresaId);
  return c && c.ativo ? c : null;
}

/**
 * O número por onde ESTE usuário fala: o dele, e a conta da empresa inteira como
 * reserva. A ordem importa — invertê-la faria o operador que acabou de conectar o
 * próprio número continuar falando pelo número da empresa.
 */
export async function contaAtivaDoUsuario(
  usuarioId: number | null | undefined,
  empresaId: number | null | undefined
): Promise<ContaCloud | null> {
  if (usuarioId) {
    const propria = await contaDoUsuario(Number(usuarioId));
    if (propria?.ativo) return propria;
  }
  return empresaId ? contaAtivaDaEmpresa(Number(empresaId)) : null;
}

/**
 * A conta por onde a conversa DESTE contato entrou — é a do dono dele. Num cliente
 * com parte da equipe no oficial e parte no QR, perguntar pela empresa devolveria o
 * número errado (ou nenhum), e o tique azul iria para a conta de outra pessoa.
 */
export async function contaAtivaDoContato(
  contatoId: number,
  empresaId: number
): Promise<ContaCloud | null> {
  const r = await query(`SELECT usuario_id FROM contatos_whatsapp WHERE id = $1 AND empresa_id = $2`, [
    contatoId,
    empresaId,
  ]);
  return contaAtivaDoUsuario(r.rows[0]?.usuario_id, empresaId);
}

export function credenciaisDa(conta: ContaCloud): CredenciaisMeta {
  return {
    phoneNumberId: conta.phone_number_id,
    wabaId: conta.waba_id,
    // Nulo = System User da DuoFuturo (META_WA_TOKEN), que só alcança a WABA dela.
    // O número de um cliente traz o token do próprio Embedded Signup.
    token: conta.token_enc ? decrypt(conta.token_enc) : undefined,
  };
}

export async function listarContas(): Promise<Array<ContaCloud & { empresa_nome: string }>> {
  const r = await query(
    `SELECT c.*, e.nome AS empresa_nome, u.nome AS usuario_nome
       FROM whatsapp_cloud_contas c
       JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY c.id`
  );
  return r.rows.map(({ token_enc, pin_enc, ...resto }: any) => ({
    ...resto,
    token_enc: token_enc ? '(próprio)' : null,
  }));
}

/**
 * Cadastra (ou atualiza) um número oficial, SEM ligar. O número é conferido na Meta
 * antes de gravar: id errado vira erro aqui, e não uma conta que falha em silêncio
 * no primeiro envio.
 *
 * A chave é o `phone_number_id` — o número É a linha. Reconectar o mesmo número
 * atualiza a linha que já existe (inclusive o token novo do Embedded Signup) em vez
 * de criar outra porta virtual para o mesmo aparelho.
 */
export async function salvarConta(dados: {
  empresaId: number;
  usuarioId?: number | null;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string | null;
  /** Token do cliente (Embedded Signup). Ausente = System User da DuoFuturo. */
  token?: string | null;
  pin?: string | null;
  origem?: 'manual' | 'embedded_signup';
}): Promise<ContaCloud> {
  const cred: CredenciaisMeta = {
    phoneNumberId: dados.phoneNumberId,
    wabaId: dados.wabaId,
    token: dados.token || undefined,
  };
  const numero = await consultarNumero(cred);
  const digitos = String(numero.display_phone_number || '').replace(/\D/g, '') || null;
  const tokenEnc = dados.token ? encrypt(dados.token) : null;
  const pinEnc = dados.pin ? encrypt(dados.pin) : null;

  const r = await query(
    `INSERT INTO whatsapp_cloud_contas
       (empresa_id, usuario_id, phone_number_id, waba_id, numero, nome_exibicao, porta_virtual,
        business_id, token_enc, pin_enc, origem, qualidade, conectado_em)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT GREATEST(COALESCE(MAX(porta_virtual), $7 - 1) + 1, $7) FROM whatsapp_cloud_contas),
             $8, $9, $10, $11, $12, now())
     ON CONFLICT (phone_number_id) DO UPDATE
        SET empresa_id = EXCLUDED.empresa_id,
            usuario_id = EXCLUDED.usuario_id,
            waba_id = EXCLUDED.waba_id,
            numero = EXCLUDED.numero,
            nome_exibicao = EXCLUDED.nome_exibicao,
            business_id = COALESCE(EXCLUDED.business_id, whatsapp_cloud_contas.business_id),
            -- Token/PIN novos substituem; ausentes mantêm o que já valia (o painel
            -- manual não tem token para dar, e apagá-lo derrubaria a conta do cliente).
            token_enc = COALESCE(EXCLUDED.token_enc, whatsapp_cloud_contas.token_enc),
            pin_enc = COALESCE(EXCLUDED.pin_enc, whatsapp_cloud_contas.pin_enc),
            origem = EXCLUDED.origem,
            qualidade = EXCLUDED.qualidade,
            conectado_em = now(),
            updated_at = now()
     RETURNING *`,
    [
      dados.empresaId,
      dados.usuarioId ?? null,
      dados.phoneNumberId,
      dados.wabaId,
      digitos,
      numero.verified_name || null,
      PORTA_VIRTUAL_MINIMA,
      dados.businessId ?? null,
      tokenEnc,
      pinEnc,
      dados.origem ?? 'manual',
      (numero as any).quality_rating ?? null,
    ]
  );
  limparCacheContas();
  return r.rows[0];
}

/** Quem troca de porta quando a conta liga: o dono, ou a empresa inteira. */
function alvosDe(conta: ContaCloud): { sql: string; params: any[] } {
  return conta.usuario_id
    ? { sql: `SELECT id, whatsapp_porta FROM usuarios WHERE id = $1`, params: [conta.usuario_id] }
    : { sql: `SELECT id, whatsapp_porta FROM usuarios WHERE empresa_id = $1`, params: [conta.empresa_id] };
}

/**
 * Liga o número oficial: quem ele cobre passa a enviar e receber por ele. A porta
 * Baileys de cada um fica guardada em `portas_anteriores` para o desligar devolver
 * exatamente o que havia. Idempotente.
 *
 * Conta COM dono move só a porta do dono — é o que permite um operador migrar para
 * a Cloud API sem tirar os colegas do QR Code.
 */
export async function ligarConta(contaId: number, porUsuarioId: number | null): Promise<ContaCloud> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const c = await cliente.query(`SELECT * FROM whatsapp_cloud_contas WHERE id = $1 FOR UPDATE`, [contaId]);
    const conta: ContaCloud | undefined = c.rows[0];
    if (!conta) throw new Error('Número oficial não encontrado');

    const alvo = alvosDe(conta);
    const usuarios = await cliente.query(alvo.sql, alvo.params);
    const anteriores: Record<string, number | null> = { ...(conta.portas_anteriores || {}) };
    for (const u of usuarios.rows) {
      // Quem já está na porta virtual (religar) mantém a anterior que já foi guardada.
      if (u.whatsapp_porta !== conta.porta_virtual) anteriores[String(u.id)] = u.whatsapp_porta ?? null;
    }
    await cliente.query(
      `UPDATE usuarios SET whatsapp_porta = $2 WHERE id = ANY($1::int[])`,
      [usuarios.rows.map((u: any) => u.id), conta.porta_virtual]
    );
    const r = await cliente.query(
      `UPDATE whatsapp_cloud_contas
          SET ativo = true, portas_anteriores = $2::jsonb, ativado_em = now(),
              ativado_por = $3, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [conta.id, JSON.stringify(anteriores), porUsuarioId]
    );
    await cliente.query('COMMIT');
    limparCacheContas();
    return r.rows[0];
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

/** Desliga: cada usuário volta à porta Baileys que tinha (ou a nenhuma). */
export async function desligarConta(contaId: number): Promise<ContaCloud> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const c = await cliente.query(`SELECT * FROM whatsapp_cloud_contas WHERE id = $1 FOR UPDATE`, [contaId]);
    const conta: ContaCloud | undefined = c.rows[0];
    if (!conta) throw new Error('Número oficial não encontrado');

    const anteriores = conta.portas_anteriores || {};
    const usuarios = await cliente.query(
      `SELECT id FROM usuarios WHERE whatsapp_porta = $1`,
      [conta.porta_virtual]
    );
    for (const u of usuarios.rows) {
      const porta = anteriores[String(u.id)] ?? null;
      // A porta antiga pode ter sido dada a outro usuário nesse meio-tempo.
      const ocupada = porta
        ? (await cliente.query(`SELECT 1 FROM usuarios WHERE whatsapp_porta = $1 AND id <> $2`, [porta, u.id])).rowCount
        : 0;
      await cliente.query(`UPDATE usuarios SET whatsapp_porta = $2 WHERE id = $1`, [u.id, ocupada ? null : porta]);
    }
    const r = await cliente.query(
      `UPDATE whatsapp_cloud_contas SET ativo = false, updated_at = now() WHERE id = $1 RETURNING *`,
      [conta.id]
    );
    await cliente.query('COMMIT');
    limparCacheContas();
    return r.rows[0];
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Usuário novo numa empresa que já fala pelo oficial entra direto na porta virtual —
 * sem isto ele ganharia uma instância Baileys e um QR para escanear. Vale só para a
 * conta da empresa inteira: número com dono é de quem o conectou.
 */
export async function portaParaUsuarioNovo(empresaId: number | null | undefined): Promise<number | null> {
  if (!empresaId) return null;
  const conta = await contaAtivaDaEmpresa(empresaId);
  return conta ? conta.porta_virtual : null;
}
