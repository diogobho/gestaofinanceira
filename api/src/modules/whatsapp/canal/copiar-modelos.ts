import axios from 'axios';
import { query } from '../../../config/database';
import { BASE_URL, erroDaGraph } from '../meta/meta-whatsapp.service';
import { ContaCloud, contasDaEmpresa, credenciaisDa } from './contas';

/**
 * Modelos da empresa em todos os números dela (14/10/2026, pedido do dono da Panteras).
 *
 * Na Meta, o modelo mora na conta do WhatsApp (WABA), não no portfólio. Quem está no app
 * WhatsApp Business (coexistência) não entra na WABA que já existe: cada número ganha a
 * sua, dentro do mesmo portfólio. Sem isto, a Hellen e a Jéssica conectariam sem nenhum
 * dos ~100 modelos que a Débora já aprovou, e teriam de escrever e aprovar tudo de novo.
 *
 * A FONTE é a conta ativa do dono da conta (creator); sem ela, a do número da empresa
 * inteira. Copia só o que está APROVADO na fonte e ainda não existe no destino (nome +
 * idioma) — repetir não duplica. A Meta reavalia cada cópia. Ela também limita quantos
 * modelos uma WABA cria por hora (100): o que não couber fica para a rodada seguinte do
 * job (`jobs/modelos-empresa-scheduler.ts`), que também leva os aprovados depois.
 */

const MAX_POR_RODADA = 90;
const PAUSA_MS = 500;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TemplateCompleto {
  name: string;
  status: string;
  category: string;
  language: string;
  parameter_format?: string;
  components?: any[];
}

async function todosOsModelos(conta: ContaCloud): Promise<TemplateCompleto[]> {
  const cred = credenciaisDa(conta);
  const lista: TemplateCompleto[] = [];
  let url: string | null = `${BASE_URL}/${cred.wabaId}/message_templates`;
  let params: any = { fields: 'name,status,category,language,parameter_format,components', limit: 100, access_token: cred.token };
  while (url) {
    const resp: any = await axios.get(url, { params, timeout: 20000 }).catch((e) => { throw erroDaGraph(e); });
    lista.push(...(resp.data?.data ?? []));
    url = resp.data?.paging?.next ?? null;
    params = undefined; // o `next` já traz os parâmetros
  }
  return lista;
}

/** A conta de onde os modelos saem: a do creator, senão a da empresa inteira. */
export async function contaFonteDeModelos(empresaId: number): Promise<ContaCloud | null> {
  const ativas = (await contasDaEmpresa(empresaId)).filter((c) => c.ativo);
  if (!ativas.length) return null;
  const creators = await query(
    `SELECT id FROM usuarios WHERE empresa_id = $1 AND tipo_usuario = 'creator' AND ativo = true`, [empresaId]);
  const ids = new Set(creators.rows.map((r: any) => Number(r.id)));
  return ativas.find((c) => c.usuario_id && ids.has(Number(c.usuario_id)))
    ?? ativas.find((c) => c.usuario_id === null)
    ?? null;
}

/** Cabeçalho de mídia leva um arquivo que só vale na WABA de origem: não dá para copiar. */
const temCabecalhoDeMidia = (t: TemplateCompleto) =>
  (t.components ?? []).some((c: any) => c.type === 'HEADER' && c.format && c.format !== 'TEXT');

/** Limite de criação da Meta: parar a rodada, o job tenta de novo na próxima hora. */
const ehLimite = (e: any) => e?.metaCode === 4 || e?.metaCode === 80008 || e?.httpStatus === 429 || /limit/i.test(String(e?.message || ''));

export interface ResultadoCopia {
  copiados: string[];
  falhas: { nome: string; erro: string }[];
  restantes: number;
  parouNoLimite: boolean;
}

export async function copiarModelosPara(destino: ContaCloud): Promise<ResultadoCopia | null> {
  const fonte = await contaFonteDeModelos(destino.empresa_id);
  if (!fonte || !destino.ativo || fonte.waba_id === destino.waba_id) return null;

  const [daFonte, doDestino] = await Promise.all([todosOsModelos(fonte), todosOsModelos(destino)]);
  const existentes = new Set(doDestino.map((t) => `${t.name}|${t.language}`));
  const faltam = daFonte.filter((t) => t.status === 'APPROVED' && !temCabecalhoDeMidia(t) && !existentes.has(`${t.name}|${t.language}`));

  const cred = credenciaisDa(destino);
  const r: ResultadoCopia = { copiados: [], falhas: [], restantes: 0, parouNoLimite: false };
  for (let i = 0; i < faltam.length; i++) {
    if (r.copiados.length >= MAX_POR_RODADA) { r.restantes = faltam.length - i; break; }
    const t = faltam[i];
    try {
      await axios.post(`${BASE_URL}/${cred.wabaId}/message_templates`, {
        name: t.name,
        language: t.language,
        category: t.category,
        ...(t.parameter_format ? { parameter_format: t.parameter_format } : {}),
        components: t.components,
      }, { headers: { Authorization: `Bearer ${cred.token}` }, timeout: 20000 });
      r.copiados.push(t.name);
    } catch (err) {
      const e: any = erroDaGraph(err);
      if (ehLimite(e)) { r.parouNoLimite = true; r.restantes = faltam.length - i; break; }
      r.falhas.push({ nome: t.name, erro: String(e?.message || e).slice(0, 200) });
    }
    await espera(PAUSA_MS);
  }
  if (r.copiados.length || r.falhas.length || r.restantes) {
    console.log(
      `[Modelos] empresa #${destino.empresa_id}: ${r.copiados.length} copiado(s) da conta #${fonte.id} para a #${destino.id}` +
      (r.falhas.length ? `, ${r.falhas.length} recusado(s) (${r.falhas.map((f) => `${f.nome}: ${f.erro}`).join(' | ')})` : '') +
      (r.restantes ? `, ${r.restantes} para a próxima rodada${r.parouNoLimite ? ' (limite da Meta)' : ''}` : '')
    );
  }
  return r;
}

/** Todas as empresas com mais de uma WABA ativa: leva os modelos da fonte às outras. */
export async function sincronizarModelosDasEmpresas(): Promise<void> {
  const r = await query(
    `SELECT empresa_id FROM whatsapp_cloud_contas WHERE ativo GROUP BY empresa_id HAVING count(DISTINCT waba_id) > 1`);
  for (const { empresa_id } of r.rows) {
    const fonte = await contaFonteDeModelos(Number(empresa_id));
    if (!fonte) continue;
    const destinos = (await contasDaEmpresa(Number(empresa_id))).filter((c) => c.ativo && c.waba_id !== fonte.waba_id);
    // Duas contas na mesma WABA dividem os modelos: copiar uma vez basta.
    const porWaba = new Map(destinos.map((c) => [c.waba_id, c]));
    for (const destino of porWaba.values()) {
      await copiarModelosPara(destino).catch((e) =>
        console.error(`[Modelos] empresa #${empresa_id}, conta #${destino.id}:`, e?.message || e));
    }
  }
}
