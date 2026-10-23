import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { query } from '../../config/database';
import { lerPlanilha } from '../crm/importacao/importacao.service';

/**
 * Importar clientes de planilha (05/10/2026) — mesmo fluxo da importação de leads
 * (preview das colunas → mapeamento → importar), com as regras do cadastro manual
 * de `clientes.service.create`: nome e CPF/CNPJ obrigatórios, duplicidade por CPF/CNPJ
 * do mesmo usuário, CEP de 8 dígitos e UF de 2 letras. Não cria lead CX: o cadastro
 * pela tela também não cria (o form não manda `empresa_id`), e importar 300 clientes
 * não pode virar 300 cards de pós-venda sem ninguém pedir.
 */

export interface MapeamentoClientes {
  nome: string;
  cpf_cnpj: string;
  email?: string;
  telefone?: string;
  aniversario?: string;
  servico?: string;
  endereco_rua?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  endereco_cep?: string;
}

export interface ResultadoImportacaoClientes {
  total: number;
  importados: number;
  duplicados: number;
  erros: Array<{ linha: number; erro: string }>;
}

const texto = (v: any): string => (v ?? '').toString().replace(/\s+/g, ' ').trim();

/**
 * CPF/CNPJ só com dígitos. O Excel guarda CPF como número e come o zero da frente
 * ("01234567890" vira 1234567890): 9–10 dígitos voltam a 11, 12–13 voltam a 14.
 */
export function normalizarCpfCnpj(v: any): string | null {
  const d = texto(v).replace(/\D/g, '');
  if (d.length >= 9 && d.length <= 11) return d.padStart(11, '0');
  if (d.length >= 12 && d.length <= 14) return d.padStart(14, '0');
  return null;
}

/** CEP com 8 dígitos (o zero da frente também some no Excel). Inválido = vazio, não erro. */
export function normalizarCep(v: any): string | null {
  const d = texto(v).replace(/\D/g, '');
  if (d.length === 7 || d.length === 8) return d.padStart(8, '0');
  return null;
}

/** UF de 2 letras; qualquer outra coisa fica vazia. */
export function normalizarUf(v: any): string | null {
  const t = texto(v).toUpperCase();
  return /^[A-Z]{2}$/.test(t) ? t : null;
}

/**
 * Aniversário vindo de planilha: data do Excel (número de série), dd/mm/aaaa,
 * dd/mm (sem ano: grava 2000, só dia e mês importam) ou aaaa-mm-dd. Devolve
 * 'aaaa-mm-dd' ou null.
 */
export function normalizarData(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 0 && v < 100000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p && p.y && p.m && p.d) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const t = texto(v);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    let ano = m[3] ? +m[3] : 2000;
    if (ano < 100) ano += ano > 30 ? 1900 : 2000;
    return valida(ano, +m[2], +m[1]);
  }
  return null;
}

function valida(a: number, mes: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function importarClientes(
  filePath: string,
  usuarioId: number,
  mapeamento: MapeamentoClientes
): Promise<ResultadoImportacaoClientes> {
  try {
    const workbook = lerPlanilha(fs.readFileSync(filePath));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
    if (dados.length === 0) throw new Error('Arquivo vazio');

    const col = (linha: any, campo: keyof MapeamentoClientes) => {
      const c = mapeamento[campo];
      return c ? linha[c] : undefined;
    };

    // Duplicidade igual à do cadastro manual: CPF/CNPJ do mesmo usuário.
    const existentes = new Map<string, string>();
    (await query(
      `SELECT cpf_cnpj, nome FROM clientes WHERE usuario_id = $1 AND cpf_cnpj IS NOT NULL`,
      [usuarioId]
    )).rows.forEach((r: any) => existentes.set(String(r.cpf_cnpj).replace(/\D/g, ''), r.nome));

    const resultado: ResultadoImportacaoClientes = { total: dados.length, importados: 0, duplicados: 0, erros: [] };
    const linhas: any[][] = [];
    const base = Date.now();

    dados.forEach((linha, i) => {
      const numLinha = i + 2;
      const nome = texto(col(linha, 'nome'));
      if (!nome) { resultado.erros.push({ linha: numLinha, erro: 'Nome é obrigatório' }); return; }
      const cpfCnpj = normalizarCpfCnpj(col(linha, 'cpf_cnpj'));
      if (!cpfCnpj) { resultado.erros.push({ linha: numLinha, erro: `${nome}: CPF (11 dígitos) ou CNPJ (14) inválido` }); return; }
      if (existentes.has(cpfCnpj)) {
        resultado.duplicados++;
        resultado.erros.push({ linha: numLinha, erro: `${nome}: CPF/CNPJ já cadastrado em "${existentes.get(cpfCnpj)}"` });
        return;
      }
      existentes.set(cpfCnpj, nome); // repetido dentro da própria planilha

      const cidade = texto(col(linha, 'endereco_cidade')) || null;
      const telefone = texto(col(linha, 'telefone')).replace(/\D/g, '') || null;
      linhas.push([
        `CLI-${base}-${i}`, nome, cpfCnpj,
        texto(col(linha, 'email')) || null,
        telefone && telefone.length <= 15 ? telefone : null,
        normalizarData(col(linha, 'aniversario')),
        texto(col(linha, 'endereco_rua')) || null,
        texto(col(linha, 'endereco_numero')) || null,
        texto(col(linha, 'endereco_complemento')) || null,
        texto(col(linha, 'endereco_bairro')) || null,
        cidade,
        normalizarUf(col(linha, 'endereco_estado')),
        normalizarCep(col(linha, 'endereco_cep')),
        cidade,
        texto(col(linha, 'servico')) || null,
        usuarioId,
      ]);
    });

    // `empresa_id` vem do usuário que importa. Sem ele o cliente ficava fora da empresa, e
    // quem procura por empresa (importação do Asaas) não o achava e criava outro (06/10/2026).
    const empresaId = (await query('SELECT empresa_id FROM usuarios WHERE id = $1', [usuarioId])).rows[0]?.empresa_id ?? null;
    linhas.forEach((l) => l.push(empresaId));

    const COLS = 17;
    const LOTE = Math.floor(60000 / COLS);
    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE);
      const params: any[] = [];
      const valores = lote.map((l) => {
        const ph = l.map((v) => { params.push(v); return `$${params.length}`; });
        return `(${ph.join(',')})`;
      });
      await query(
        `INSERT INTO clientes (
           codigo, nome, cpf_cnpj, email, telefone, aniversario,
           endereco_rua, endereco_numero, endereco_complemento, endereco_bairro,
           endereco_cidade, endereco_estado, endereco_cep, cidade, servico, usuario_id, empresa_id
         ) VALUES ${valores.join(',')}`,
        params
      );
      resultado.importados += lote.length;
    }
    return resultado;
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}
