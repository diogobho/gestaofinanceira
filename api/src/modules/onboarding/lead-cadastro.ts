import { query } from '../../config/database';
import { leadsService } from '../crm/leads/leads.service';

/**
 * Todo cadastro em /gestao/register vira lead no CRM da conta DuoFuturo
 * (suporte@duofuturo.tech) — funil "Vendas CRM", estágio "Entrada". É por lá que o
 * comercial acompanha quem entrou no teste grátis e quem pagou.
 *
 * Mesma regra das boas-vindas: NADA aqui pode derrubar o cadastro. Quando isto roda,
 * empresa, usuário e cobrança já existem; por isso a função nunca lança e o
 * `registrar` a chama sem `await`.
 *
 * Destino configurável por `.env` (padrões = empresa 32, funil 57, estágio 322,
 * responsável 57). O estágio é conferido contra o funil a cada chamada, e o funil
 * contra a empresa — um id trocado no `.env` não pode jogar o lead no CRM de cliente.
 */
const EMPRESA_ID = Number(process.env.CADASTRO_LEAD_EMPRESA_ID) || 32;
const FUNIL_ID = Number(process.env.CADASTRO_LEAD_FUNIL_ID) || 57;
const ESTAGIO_ID = Number(process.env.CADASTRO_LEAD_ESTAGIO_ID) || 322;
const RESPONSAVEL_ID = Number(process.env.CADASTRO_LEAD_RESPONSAVEL_ID) || 57;

/** `leads.origem` é VARCHAR(50). Também é o que o dashboard de Integrações casa. */
export const ORIGEM_CADASTRO = 'Cadastro no app';

const FORMA: Record<string, string> = {
  TRIAL: 'Teste grátis (7 dias)',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto',
};

export interface DadosLeadCadastro {
  empresaId: number;
  usuarioId: number;
  nomeUsuario: string;
  nomeEmpresa: string;
  email: string;
  telefone?: string;
  plano: string;
  precoMensal?: number;
  billingType: string;
  ciclo?: string;
  optinWhatsapp?: boolean;
}

async function destinoValido(): Promise<number | null> {
  const r = await query(
    `SELECT e.id FROM estagios_funil e
       JOIN funis f ON f.id = e.funil_id
      WHERE e.id = $1 AND f.id = $2 AND f.empresa_id = $3`,
    [ESTAGIO_ID, FUNIL_ID, EMPRESA_ID]
  );
  return r.rows[0]?.id ?? null;
}

/** Bloco de notas — a primeira linha é o marcador do catálogo de integrações. */
function notasDoCadastro(d: DadosLeadCadastro): string {
  return [
    'Cadastro no app DuoFuturo',
    `Plano: ${d.plano}`,
    `Forma de começar: ${FORMA[d.billingType] || d.billingType}`,
    d.billingType !== 'TRIAL' && d.ciclo ? `Ciclo: ${d.ciclo}` : '',
    `Empresa: ${d.nomeEmpresa}`,
    `E-mail: ${d.email}`,
    `Material pelo WhatsApp: ${d.optinWhatsapp ? 'pediu' : 'não pediu'}`,
    `Conta: empresa #${d.empresaId} · usuário #${d.usuarioId}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function registrarLeadDoCadastro(d: DadosLeadCadastro): Promise<void> {
  try {
    if (!d.telefone) {
      console.warn(`[LeadCadastro] empresa #${d.empresaId} sem telefone — lead não criado`);
      return;
    }
    const estagio = await destinoValido();
    if (!estagio) {
      console.error(
        `[LeadCadastro] destino inválido (empresa ${EMPRESA_ID}, funil ${FUNIL_ID}, estágio ${ESTAGIO_ID}) — lead não criado`
      );
      return;
    }

    const notas = notasDoCadastro(d);

    // Já está no funil (veio de prospecção, ou cadastrou de novo com outro e-mail)?
    // Anexa ao card existente, como os webhooks de captação: estágio e origem do card
    // antigo não mudam — um lead em negociação não volta para a Entrada.
    const duplicata = await leadsService.telefoneExiste(d.telefone, EMPRESA_ID, undefined, FUNIL_ID);
    if (duplicata.existe && duplicata.lead_id) {
      const carimbo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      await query(
        `UPDATE leads
            SET notas = concat_ws(E'\\n\\n', nullif(notas, ''), $2::text),
                email = coalesce(nullif(email, ''), $3::text),
                empresa = coalesce(nullif(empresa, ''), $4::text),
                updated_at = NOW()
          WHERE id = $1`,
        [duplicata.lead_id, `[${carimbo}] ${notas}`, d.email, d.nomeEmpresa]
      );
      console.log(`[LeadCadastro] lead #${duplicata.lead_id} já existia — cadastro anexado`);
      return;
    }

    const lead = await leadsService.create(
      EMPRESA_ID,
      RESPONSAVEL_ID,
      {
        funil_id: FUNIL_ID,
        estagio_id: estagio,
        responsavel_id: RESPONSAVEL_ID,
        nome: d.nomeUsuario,
        telefone: d.telefone,
        email: d.email,
        empresa: d.nomeEmpresa,
        origem: ORIGEM_CADASTRO,
        temperatura: 'quente',
        valor_potencial: Number(d.precoMensal) > 0 ? Number(d.precoMensal) : undefined,
        notas,
      },
      false // lead automático: sem tarefa inicial obrigatória
    );
    console.log(`[LeadCadastro] lead #${lead.id} criado para a empresa #${d.empresaId} ("${d.nomeEmpresa}")`);
  } catch (err: any) {
    console.error(`[LeadCadastro] falhou para a empresa #${d.empresaId} —`, err?.message || err);
  }
}
