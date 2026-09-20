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
} from './contas';
import { instancia } from './instancia';

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
   * Volta ao QR Code. Desliga só o número DO USUÁRIO — o número da empresa
   * inteira é desligado pela DuoFuturo, no painel, porque derruba o canal de todos.
   */
  async desconectar(req: Request, res: Response) {
    const usuarioId = Number((req as any).user?.userId ?? (req as any).user?.id);
    const minha = await contaDoUsuario(usuarioId);
    if (!minha) {
      return res.status(404).json({ message: 'Você não tem número oficial próprio conectado.' });
    }
    try {
      await desligarConta(minha.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || 'Não foi possível desconectar' });
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
