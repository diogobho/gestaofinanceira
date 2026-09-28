import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { configES, onboardingDoNumero } from '../meta/embedded-signup.service';
import {
  contaDoUsuario,
  contaDaEmpresa,
  contasDaEmpresa,
  salvarConta,
  ligarConta,
  desligarConta,
  contaAtivaDoUsuario,
  credenciaisDa,
  ContaCloud,
} from './contas';
import { instancia } from './instancia';
import {
  consultarSaude,
  lerPerfilComercial,
  atualizarPerfilComercial,
  trocarFotoPerfil,
} from '../meta/meta-whatsapp.service';
import { isAdminEmpresa, isSuperAdmin } from '../../../shared/roles';

/**
 * Conectar o número oficial do CLIENTE — a ponta que faltava do canal oficial.
 *
 * Aqui é o cliente Enterprise que age, não a DuoFuturo: ele abre a janela do
 * Embedded Signup no navegador, a Meta devolve `code`, `waba_id` e
 * `phone_number_id`, e estas rotas fazem o resto **no servidor** (troca do code,
 * inscrição do app na WABA dele, registro do número) e ligam o número na conta.
 *
 * O painel `/whatsapp/meta` continua existindo e continua sendo só nosso: lá se
 * cadastra à mão um número que já está na WABA da DuoFuturo. São caminhos
 * diferentes para coisas diferentes — um conecta a conta do cliente, o outro
 * administra a nossa.
 *
 * ── O número é do OPERADOR ──────────────────────────────────────────────────
 * Cada linha de `whatsapp_cloud_contas` é um número, e aqui ela nasce com
 * `usuario_id`. É o que permite migrar um operador de cada vez: o resto da equipe
 * continua no QR Code, com grupos e agenda, enquanto quem precisa prospectar já
 * fala pelo canal que pode iniciar conversa.
 */

/** Só o dono do próprio WhatsApp, ou um administrador agindo pela equipe. */
function alvoPermitido(req: Request): { ok: boolean; usuarioId: number } {
  const eu = Number((req as any).user?.userId ?? (req as any).user?.id);
  const pedido = Number(req.body?.usuario_id) || eu;
  const admin = ['master', 'creator'].includes(String((req as any).user?.tipo_usuario))
    || (req as any).user?.nivel === 'super_admin';
  return { ok: pedido === eu || admin, usuarioId: pedido };
}

/**
 * O número que ESTA requisição pode administrar (perfil, desconexão).
 *
 * - sem `conta_id`: o número do próprio usuário;
 * - com `conta_id`: um número da empresa dele — de outro operador só se ele for
 *   administrador (master/creator);
 * - o número da empresa inteira (`usuario_id` nulo) só o `super_admin` mexe:
 *   desligá-lo tira o canal de todo mundo, e é o caso da conta institucional.
 */
async function contaGerenciavel(req: Request): Promise<{ conta: ContaCloud | null; erro?: string; status?: number }> {
  const user = (req as any).user;
  const eu = Number(user?.userId ?? user?.id);
  const empresaId = Number(user?.empresa_id);
  const pedido = Number(req.body?.conta_id ?? req.query?.conta_id) || null;

  if (!pedido) {
    const minha = await contaDoUsuario(eu);
    if (minha) return { conta: minha };
    const daEmpresa = await contaDaEmpresa(empresaId);
    if (daEmpresa && isSuperAdmin(user)) return { conta: daEmpresa };
    return {
      conta: null,
      status: daEmpresa ? 403 : 404,
      erro: daEmpresa
        ? 'Este é o número da empresa inteira — só a DuoFuturo altera.'
        : 'Você não tem número oficial conectado.',
    };
  }

  const conta = (await contasDaEmpresa(empresaId)).find((c) => c.id === pedido) ?? null;
  if (!conta) return { conta: null, status: 404, erro: 'Número oficial não encontrado nesta empresa.' };
  if (conta.usuario_id === eu) return { conta };
  if (conta.usuario_id === null) {
    return isSuperAdmin(user)
      ? { conta }
      : { conta: null, status: 403, erro: 'Este é o número da empresa inteira — só a DuoFuturo altera.' };
  }
  return isAdminEmpresa(user)
    ? { conta }
    : { conta: null, status: 403, erro: 'Só o dono do número ou um administrador da empresa altera.' };
}

export const oficialController = {
  /**
   * O que a tela precisa para decidir o que mostrar: se já há número conectado,
   * e se a janela do Embedded Signup pode sequer abrir.
   *
   * `configurado: false` não é erro do cliente — é configuração nossa que falta
   * (o app da Meta), e a tela diz isso em vez de oferecer um botão que quebra.
   */
  async get(req: Request, res: Response) {
    const usuarioId = Number((req as any).user?.userId ?? (req as any).user?.id);
    const empresaId = Number((req as any).user?.empresa_id);
    const cfg = configES();
    const minha = await contaDoUsuario(usuarioId);
    const daEmpresa = await contaDaEmpresa(empresaId);
    const conta = minha ?? daEmpresa;

    let status: any = null;
    if (conta?.ativo) {
      try {
        status = (await instancia(conta.porta_virtual).get('/status')).data;
      } catch (err: any) {
        status = { status: 'disconnected', erro: err?.response?.data?.error || err.message };
      }
    }

    return res.json({
      embeddedSignup: {
        configurado: cfg.configurado,
        faltando: cfg.faltando,
        appId: cfg.appId,
        configId: cfg.configId,
        graphVersion: cfg.graphVersion,
      },
      conta: conta
        ? {
            id: conta.id,
            numero: conta.numero,
            nomeExibicao: conta.nome_exibicao,
            ativo: conta.ativo,
            origem: conta.origem,
            qualidade: status?.qualidade ?? conta.qualidade,
            conectado: status?.status === 'connected',
            erro: status?.erro ?? null,
            // Número da empresa inteira não é gerenciável pelo operador: quem o
            // desligar tira o canal de todo mundo.
            meu: !!minha,
            daEmpresa: !minha && !!daEmpresa,
          }
        : null,
    });
  },

  /**
   * Conclui o Embedded Signup. O corpo vem da janela da Meta, e o `code` vive
   * ~30 segundos — por isso a troca acontece já, aqui, e não é guardada.
   */
  async conectar(req: Request, res: Response) {
    const empresaId = Number((req as any).user?.empresa_id);
    const { ok, usuarioId } = alvoPermitido(req);
    if (!ok) {
      return res.status(403).json({ message: 'Você só pode conectar o seu próprio número.' });
    }

    const code = String(req.body?.code || '').trim();
    const wabaId = String(req.body?.waba_id || '').trim();
    const phoneNumberId = String(req.body?.phone_number_id || '').trim();
    if (!code) return res.status(400).json({ message: 'A autorização da Meta não veio completa. Refaça a conexão.' });
    if (!/^\d{6,30}$/.test(wabaId) || !/^\d{6,30}$/.test(phoneNumberId)) {
      return res.status(400).json({ message: 'A Meta não devolveu a conta e o número. Refaça a conexão.' });
    }

    const dono = await query(`SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = true`, [
      usuarioId,
      empresaId,
    ]);
    if (!dono.rows[0]) return res.status(404).json({ message: 'Usuário não encontrado nesta empresa' });

    try {
      const onboarding = await onboardingDoNumero({ code, wabaId, phoneNumberId });
      const conta = await salvarConta({
        empresaId,
        usuarioId,
        phoneNumberId,
        wabaId,
        businessId: onboarding.businessId,
        token: onboarding.token,
        pin: onboarding.pin,
        origem: 'embedded_signup',
      });
      const ligada = await ligarConta(conta.id, usuarioId);
      console.log(
        `[Cloud API] número oficial CONECTADO por Embedded Signup — empresa #${empresaId}, usuário #${usuarioId}, ` +
          `número ${ligada.numero}, porta ${ligada.porta_virtual}`
      );
      return res.json({
        success: true,
        conta: {
          id: ligada.id,
          numero: ligada.numero,
          nomeExibicao: ligada.nome_exibicao,
          porta: ligada.porta_virtual,
        },
      });
    } catch (err: any) {
      // 23505 = o número já está em outra conta do sistema. Dizer isso é melhor do
      // que "erro ao conectar": quem tropeça aqui geralmente conectou duas vezes.
      if (err?.code === '23505') {
        return res.status(409).json({
          message: 'Este número já está conectado a outra conta. Desconecte-o antes de ligá-lo aqui.',
        });
      }
      console.error('[Cloud API] Embedded Signup falhou:', err?.message || err);
      return res.status(400).json({ message: err?.message || 'Não foi possível conectar o número oficial' });
    }
  },

  /**
   * Desvincula o número do CRM e devolve o operador ao QR Code. **Não apaga nada na
   * Meta**: o número continua na conta do WhatsApp do cliente, e conectar de novo
   * pela janela o traz de volta. O administrador desconecta o de um operador
   * mandando `conta_id`; o número da empresa inteira é só da DuoFuturo.
   */
  async desconectar(req: Request, res: Response) {
    const { conta, erro, status } = await contaGerenciavel(req);
    if (!conta) return res.status(status ?? 404).json({ message: erro });
    try {
      await desligarConta(conta.id);
      console.log(
        `[Cloud API] número oficial DESCONECTADO do CRM — conta #${conta.id}, empresa #${conta.empresa_id}, ` +
          `por usuário #${(req as any).user?.userId}`
      );
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || 'Não foi possível desconectar' });
    }
  },

  /**
   * O que limita o envio, dito pela própria Meta (`health_status`): limite de
   * contatos novos por dia, qualidade, nome em análise, portfólio sem verificação.
   * Só leitura — aberto a quem fala pelo número.
   */
  async saude(req: Request, res: Response) {
    const user = (req as any).user;
    const conta = await contaAtivaDoUsuario(user?.userId, user?.empresa_id);
    if (!conta) return res.status(404).json({ message: 'Você não tem número oficial conectado.' });
    try {
      return res.json({ saude: await consultarSaude(credenciaisDa(conta)), wabaId: conta.waba_id });
    } catch (err: any) {
      return res.status(502).json({ message: `A Meta não respondeu: ${err.message}` });
    }
  },

  async getPerfil(req: Request, res: Response) {
    const user = (req as any).user;
    const conta = await contaAtivaDoUsuario(user?.userId, user?.empresa_id);
    if (!conta) return res.status(404).json({ message: 'Você não tem número oficial conectado.' });
    const pode = await contaGerenciavel(req);
    try {
      return res.json({ perfil: await lerPerfilComercial(credenciaisDa(conta)), podeEditar: !!pode.conta });
    } catch (err: any) {
      return res.status(502).json({ message: `A Meta não respondeu: ${err.message}` });
    }
  },

  async putPerfil(req: Request, res: Response) {
    const { conta, erro, status } = await contaGerenciavel(req);
    if (!conta) return res.status(status ?? 404).json({ message: erro });
    const b = req.body ?? {};
    const campos: any = {};
    // Limites da Meta: sobre 139, descrição 512, endereço 256, e-mail 128, até 2 sites.
    if (b.about !== undefined) campos.about = String(b.about).slice(0, 139);
    if (b.description !== undefined) campos.description = String(b.description).slice(0, 512);
    if (b.address !== undefined) campos.address = String(b.address).slice(0, 256);
    if (b.email !== undefined) campos.email = String(b.email).slice(0, 128);
    if (Array.isArray(b.websites)) campos.websites = b.websites.map(String).filter(Boolean).slice(0, 2);
    if (b.vertical) campos.vertical = String(b.vertical);
    try {
      await atualizarPerfilComercial(campos, credenciaisDa(conta));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },

  async postFotoPerfil(req: Request, res: Response) {
    const { conta, erro, status } = await contaGerenciavel(req);
    if (!conta) return res.status(status ?? 404).json({ message: erro });
    const arquivo = (req as any).file as { buffer: Buffer; mimetype: string; size: number } | undefined;
    if (!arquivo) return res.status(400).json({ message: 'Envie a imagem' });
    if (arquivo.mimetype !== 'image/jpeg' && arquivo.mimetype !== 'image/png') {
      return res.status(400).json({ message: 'A foto do perfil precisa ser JPG ou PNG' });
    }
    try {
      await trocarFotoPerfil(arquivo.buffer, arquivo.mimetype, credenciaisDa(conta));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },

  /** Números oficiais da empresa — a visão do administrador. */
  async listar(req: Request, res: Response) {
    const empresaId = Number((req as any).user?.empresa_id);
    const contas = await contasDaEmpresa(empresaId);
    return res.json({
      contas: contas.map((c) => ({
        id: c.id,
        usuario_id: c.usuario_id,
        numero: c.numero,
        nome_exibicao: c.nome_exibicao,
        ativo: c.ativo,
        origem: c.origem,
        qualidade: c.qualidade,
        conectado_em: c.conectado_em,
      })),
    });
  },
};

/** Exportada para teste: a decisão de quem pode conectar por quem. */
export const _alvoPermitido = alvoPermitido;
