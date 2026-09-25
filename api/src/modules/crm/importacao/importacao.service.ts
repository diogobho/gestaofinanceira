import { query } from '../../../config/database';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { digitosParaGravar, chaveTelefone } from '../_shared/telefone';

const ORIGENS_VALIDAS = new Set(['whatsapp','manual','importacao','indicacao','networking','parceria','instagram','lancamento','forms','diagnostico']);

function limparTelefone(raw: any): string | null {
  if (!raw) return null;
  const primeiro = raw.toString().split(',')[0].trim();
  const limpo = primeiro.replace(/[^\d+\-() ]/g, '').trim();
  const apenasDigitos = limpo.replace(/\D/g, '');
  // Rejeitar IDs de redes sociais (ex: Facebook PSID com 15+ dígitos)
  if (apenasDigitos.length > 15) return null;
  return limpo || null;
}

// Planilha é lida pelos BYTES, não pelo caminho: o SheetJS abre CSV como Latin-1, e
// o CSV que o Excel/Google Planilhas exporta é UTF-8 — "MENDONÇA" virava
// "MENDONÃ\u0087A" (21 nomes da Anchor em 17/09/2026). xlsx/xls (zip/OLE) seguem pelo
// SheetJS; texto é decodificado como UTF-8 e, se não for UTF-8 válido, como Latin-1
// (o "CSV" antigo do Excel no Windows).
export function lerPlanilha(buf: Buffer): XLSX.WorkBook {
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;               // PK: xlsx/ods
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf;               // xls antigo
  if (zip || ole) return XLSX.read(buf, { type: 'buffer' });
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    texto = new TextDecoder('latin1').decode(buf);
  }
  return XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string' });
}

// Origem da planilha é do cliente, não nossa: ela classifica o lead ("Diagnóstico",
// "Evento maio") para o comercial personalizar a conversa. Até 23/09/2026 tudo que
// não fosse uma das chaves fixas virava 'importacao' — os 873 leads da Anchor perderam
// a classificação. Agora: chave conhecida fica como chave, nome do catálogo da empresa
// (sem diferença de caixa/acento) fica com a grafia do catálogo, o resto entra como
// veio. `leads.origem` é VARCHAR(50).
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function normalizarOrigem(valor: any, catalogo: string[] = []): string {
  const texto = (valor ?? '').toString().replace(/\s+/g, ' ').trim();
  if (!texto) return 'importacao';
  const chave = semAcento(texto);
  if (ORIGENS_VALIDAS.has(chave)) return chave;
  const doCatalogo = catalogo.find(nome => semAcento(nome) === chave);
  return (doCatalogo ?? texto).slice(0, 50);
}

export interface MapeamentoColunas {
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  valor_potencial?: string;
  temperatura?: string;
  origem?: string;
  notas?: string;
}

export interface ResultadoImportacao {
  total: number;
  importados: number;
  duplicados: number;
  erros: Array<{ linha: number; erro: string; dados?: any }>;
}

export interface PreviewDados {
  colunas: string[];
  linhas: any[];
  totalLinhas: number;
}

export const importacaoService = {
  // Fazer preview do arquivo (primeiras 10 linhas)
  async preview(filePath: string): Promise<PreviewDados> {
    const workbook = lerPlanilha(fs.readFileSync(filePath));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Converter para JSON
    const dados = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (dados.length === 0) {
      throw new Error('Arquivo vazio');
    }

    // Primeira linha são os headers
    const colunas = dados[0].map((col: any) => String(col || '').trim());

    // Próximas linhas são os dados (max 10 para preview)
    const linhas = dados.slice(1, 11).map(row => {
      const obj: any = {};
      colunas.forEach((col, i) => {
        obj[col] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    });

    // Limpar arquivo temporário
    fs.unlinkSync(filePath);

    return {
      colunas,
      linhas,
      totalLinhas: dados.length - 1
    };
  },

  // Importar leads do arquivo
  async importar(
    filePath: string,
    empresaId: number,
    usuarioId: number,
    funilId: number,
    mapeamento: MapeamentoColunas
  ): Promise<ResultadoImportacao> {
    const workbook = lerPlanilha(fs.readFileSync(filePath));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Converter para JSON com headers
    const dados = XLSX.utils.sheet_to_json(sheet) as any[];

    if (dados.length === 0) {
      fs.unlinkSync(filePath);
      throw new Error('Arquivo vazio');
    }

    // Estágio de destino: o de entrada, se houver. Vários funis (principalmente os de CX,
    // criados a partir de um funil existente) não têm nenhum estágio marcado como entrada —
    // aí a importação inteira falhava. Nesses casos cai no PRIMEIRO estágio da ordem, que é
    // para onde o card iria de qualquer jeito.
    const estagioResult = await query(
      `SELECT id FROM estagios_funil
        WHERE funil_id = $1
        ORDER BY is_entrada DESC NULLS LAST, ordem ASC, id ASC
        LIMIT 1`,
      [funilId]
    );

    if (!estagioResult.rows[0]) {
      fs.unlinkSync(filePath);
      throw new Error('Funil não possui estágios configurados');
    }

    const estagioId = estagioResult.rows[0].id;

    // Pre-fetch telefones já existentes no funil destino (duplicidade é por funil).
    // A chave ignora DDI e 9º dígito: a mesma pessoa chega da planilha como
    // "43999536125" e já está no CRM como "5543999536125". Comparar dígito a dígito
    // deixava passar a duplicata.
    const catalogoOrigens: string[] = (await query(
      `SELECT nome FROM crm_origens WHERE empresa_id = $1`, [empresaId]
    )).rows.map((r: any) => r.nome);

    const existingPhonesResult = await query(
      `SELECT telefone, nome
       FROM leads WHERE empresa_id = $1 AND funil_id = $2 AND arquivado = false AND telefone IS NOT NULL AND telefone != ''`,
      [empresaId, funilId]
    );
    const existingPhones = new Map<string, string>();
    existingPhonesResult.rows.forEach((r: any) => {
      const chave = chaveTelefone(r.telefone);
      if (chave) existingPhones.set(chave, r.nome);
    });

    // Buscar ordem máxima atual no estágio (1 query só)
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem_estagio), 0) as max_ordem FROM leads WHERE estagio_id = $1`,
      [estagioId]
    );
    let nextOrdem: number = ordemResult.rows[0].max_ordem + 1;

    const resultado: ResultadoImportacao = {
      total: dados.length,
      importados: 0,
      duplicados: 0,
      erros: []
    };

    // Processar cada linha em memória
    type LeadRow = [number, number, number, number, number, string, string | null, string | null, string | null, string | null, number, string, string, string | null, number];
    const leadsValidos: LeadRow[] = [];

    for (let i = 0; i < dados.length; i++) {
      const linha = dados[i];
      const numLinha = i + 2;

      try {
        const nome = linha[mapeamento.nome]?.toString().trim();
        const telefone = limparTelefone(mapeamento.telefone ? linha[mapeamento.telefone] : null);
        const email = mapeamento.email ? linha[mapeamento.email]?.toString().trim() : null;
        const empresa = mapeamento.empresa ? linha[mapeamento.empresa]?.toString().trim() : null;
        const cargo = mapeamento.cargo ? linha[mapeamento.cargo]?.toString().trim() : null;
        const valorStr = mapeamento.valor_potencial ? linha[mapeamento.valor_potencial]?.toString() : null;
        const temperatura = mapeamento.temperatura ? linha[mapeamento.temperatura]?.toString().toLowerCase().trim() : 'morno';
        const origem = normalizarOrigem(mapeamento.origem ? linha[mapeamento.origem] : null, catalogoOrigens);
        const notas = mapeamento.notas ? linha[mapeamento.notas]?.toString().trim() : null;

        if (!nome) {
          resultado.erros.push({ linha: numLinha, erro: 'Nome é obrigatório', dados: linha });
          continue;
        }

        // Verificar duplicata em memória
        let telefoneFinal = telefone;
        if (telefone) {
          const chave = chaveTelefone(telefone);
          if (chave && existingPhones.has(chave)) {
            resultado.duplicados++;
            resultado.erros.push({
              linha: numLinha,
              erro: `Telefone já existe no lead "${existingPhones.get(chave)}"`,
              dados: { nome, telefone }
            });
            continue;
          }
          // Marcar como já visto para evitar duplicatas dentro do próprio arquivo
          if (chave) existingPhones.set(chave, nome);

          // Grava o número da planilha como ele veio (só dígitos). A comparação de
          // duplicidade é por `chaveTelefone`, então o formato não precisa ser mexido.
          telefoneFinal = digitosParaGravar(telefone);
        }

        let valorPotencial = 0;
        if (valorStr) {
          const valorLimpo = valorStr.replace(/[R$\s.]/g, '').replace(',', '.');
          valorPotencial = parseFloat(valorLimpo) || 0;
        }

        let tempFinal: 'frio' | 'morno' | 'quente' = 'morno';
        if (temperatura === 'frio' || temperatura === 'cold') tempFinal = 'frio';
        else if (temperatura === 'quente' || temperatura === 'hot') tempFinal = 'quente';

        leadsValidos.push([
          usuarioId, empresaId, usuarioId, funilId, estagioId,
          nome,
          telefoneFinal || null,
          email || null,
          empresa || null,
          cargo || null,
          valorPotencial,
          tempFinal,
          origem || 'importacao',
          notas || null,
          nextOrdem++
        ]);
      } catch (error: any) {
        resultado.erros.push({ linha: numLinha, erro: error.message, dados: linha });
      }
    }

    // Inserir em batches (máx ~4000 linhas por batch para não exceder limite de params do PG)
    const COLS = 15;
    const BATCH_SIZE = Math.floor(60000 / COLS); // ~4000 rows

    for (let i = 0; i < leadsValidos.length; i += BATCH_SIZE) {
      const batch = leadsValidos.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const row of batch) {
        placeholders.push(
          `($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11},$${idx+12},$${idx+13},$${idx+14})`
        );
        values.push(...row);
        idx += COLS;
      }

      await query(
        `INSERT INTO leads (
          usuario_id, empresa_id, responsavel_id, funil_id, estagio_id,
          nome, telefone, email, empresa, cargo,
          valor_potencial, temperatura, origem, notas, ordem_estagio
        ) VALUES ${placeholders.join(',')}`,
        values
      );

      resultado.importados += batch.length;
    }

    // Origem nova da planilha entra no catálogo da empresa: é de lá que o card do lead
    // monta a lista de origens (com cor), e sem isso ela só apareceria como valor solto.
    const origensNovas = [...new Set(leadsValidos.map(l => l[12] as string))]
      .filter(o => !ORIGENS_VALIDAS.has(o) && !catalogoOrigens.includes(o));
    if (origensNovas.length > 0) {
      await query(
        `INSERT INTO crm_origens (empresa_id, nome)
         SELECT $1, unnest($2::text[])
         ON CONFLICT (empresa_id, nome) DO NOTHING`,
        [empresaId, origensNovas]
      );
    }

    // Limpar arquivo temporário
    fs.unlinkSync(filePath);

    return resultado;
  }
};
