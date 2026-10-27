import { criarEnvio, enviarEmailDoEnvio, linkWhatsApp, DadosContaNova } from '../modules/onboarding/onboarding.service';

/**
 * Boas-vindas de conta nova.
 *
 * A régua inteira mora em `modules/onboarding/`; isto aqui é a porta que o
 * cadastro usa, mantida por ser o ponto que `auth.service.registrar` já chamava.
 *
 * **Nada aqui pode derrubar o cadastro.** Quando isto roda, empresa, usuário e
 * cobrança já existem: uma exceção cairia no catch do `registrar`, que faz
 * rollback, e apagaria a conta de quem acabou de pagar.
 *
 * O que mudou em 13/09/2026:
 *
 * - **Conteúdo por plano.** Era um e-mail só para os três planos, falando de
 *   WhatsApp e funil até para quem assinou o Starter, que não tem CRM.
 * - **O WhatsApp virou opt-in e saiu da Baileys.** A mensagem automática ia por
 *   uma instância não oficial, sem a pessoa pedir — o disparo que faz um número
 *   ser bloqueado, e o oposto do que o número oficial existe para resolver. Hoje
 *   só sai para quem marcou no cadastro, pelo número oficial (Cloud API), e só
 *   depois de a PESSOA escrever: é a mensagem dela que abre a janela de 24h em
 *   que a Meta nos deixa responder com texto livre e anexo.
 */

export type DadosBoasVindas = DadosContaNova;

export interface ResultadoBoasVindas {
  /** Id em `onboarding_envios` — nulo quando nem registrar deu certo. */
  envioId: number | null;
  /** Código curto que identifica a conta na mensagem de WhatsApp. */
  codigo: string | null;
  /** Link `wa.me` pronto, só para quem deu opt-in. */
  whatsappUrl: string | null;
}

/**
 * Registra a conta nova e devolve na hora o que o cadastro precisa mostrar na
 * tela de confirmação. O e-mail sai depois, sem `await`: um SMTP lento não pode
 * segurar a resposta do cadastro.
 *
 * Nunca lança.
 */
export async function enviarBoasVindas(dados: DadosBoasVindas): Promise<ResultadoBoasVindas> {
  let envioId: number | null = null;
  let codigo: string | null = null;

  try {
    const envio = await criarEnvio(dados);
    envioId = envio.id;
    codigo = envio.codigo;
  } catch (err: any) {
    // Sem registro não há e-mail nem botão de WhatsApp — mas a conta existe, e
    // é isso que importa nesta hora.
    console.error('[boas-vindas] não foi possível registrar a conta nova —', err?.message || err);
    return { envioId: null, codigo: null, whatsappUrl: null };
  }

  void enviarEmailDoEnvio(envioId).then((ok) => {
    console.log(
      `[boas-vindas] empresa ${dados.empresaId} (${dados.nomeEmpresa}) — plano ${dados.plano || '?'} — ` +
        `e-mail: ${ok ? 'ok' : 'falhou'}, WhatsApp: ${dados.optinWhatsapp ? 'aguardando contato' : 'não solicitado'}`
    );
  });

  return {
    envioId,
    codigo,
    whatsappUrl: dados.optinWhatsapp && codigo ? linkWhatsApp(codigo) : null,
  };
}
