/**
 * Guarda de segurança do vínculo lead ↔ contato do WhatsApp.
 *
 * NÃO normaliza nem corrige número: não existe padrão universal que sirva para
 * todo país e para os formatos antigo/novo do Brasil ao mesmo tempo. A única
 * pergunta respondida aqui é: "o contato para onde a mensagem vai é mesmo o
 * telefone que está no card?". Quando não dá para responder com segurança
 * (número incompleto, lixo, JID sem telefone), a resposta é "não sei" e o envio
 * segue — quem corrige número errado é o usuário, não o sistema.
 */

/**
 * Só os dígitos, para GRAVAR: o número fica exatamente como a pessoa digitou.
 *
 * O sistema não insere o 9º dígito nem nada no meio do número. Fazia isso antes e
 * era uma trava: quem editava um fixo ou um celular de formato antigo via o 9
 * voltar sozinho, sem jeito de salvar o número certo. Nada mais depende do formato
 * gravado — a duplicidade compara por `chaveTelefone` e o destino do envio é
 * resolvido pelo próprio WhatsApp.
 */
export function digitosParaGravar(valor: string | null | undefined): string | null {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos || null;
}

/**
 * DDI para montar o JID no momento do ENVIO — não para gravar.
 *
 * Um número sem DDI não tem destino no WhatsApp. Cadastro antigo do CRM guardou
 * muito número brasileiro sem o 55 (DDD + 8 ou 9 dígitos), e é só esse caso que
 * completamos aqui. Note que isto NÃO altera o que está no banco: a base se
 * corrige sozinha quando o WhatsApp confirma o JID real do contato.
 */
export function comDDIParaEnvio(digits: string): string {
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/**
 * Chave de comparação entre dois telefones: DDD + 8 dígitos finais, sem o DDI 55 e
 * sem o 9º dígito — as duas partes que variam conforme a origem do cadastro
 * (planilha, WhatsApp, formulário) para a MESMA pessoa.
 *
 * Só vale para número brasileiro plausível. Fora disso devolve os dígitos como
 * vieram, para que a comparação seja de igualdade exata: sem padrão conhecido,
 * agrupar seria pior do que não agrupar.
 */
export function chaveTelefone(valor: string | null | undefined): string | null {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return null;

  const semDDI = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos;
  if (semDDI.length === 11 && semDDI[2] === '9') return semDDI.slice(0, 2) + semDDI.slice(3);
  if (semDDI.length === 10) return semDDI;
  return digitos;
}

/**
 * Todas as formas em que o MESMO número brasileiro pode estar gravado no banco:
 * com e sem o DDI 55, com e sem o 9º dígito. Para comparar por igualdade em SQL
 * sem precisar reescrever a normalização lá dentro.
 */
export function variantesTelefone(valor: string | null | undefined): string[] {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return [];

  const chave = chaveTelefone(digitos);
  // Sem chave brasileira reconhecível (estrangeiro, lixo): só ele mesmo.
  if (!chave || chave.length !== 10) return [digitos];

  const com9 = `${chave.slice(0, 2)}9${chave.slice(2)}`;
  return [...new Set([digitos, chave, com9, `55${chave}`, `55${com9}`])];
}

/** Os 8 dígitos finais — a parte que não muda com DDI nem com o 9º dígito. */
function final8(valor: string | null | undefined): string | null {
  const digitos = String(valor || '').replace(/\D/g, '');
  // Fora dessa faixa não é telefone comparável (vazio, ramal, ID, lixo colado).
  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos.slice(-8);
}

/**
 * true quando o telefone do lead e o número do contato são, ambos, telefones
 * plausíveis e apontam para pessoas diferentes — o cenário em que a mensagem
 * sairia para quem não é o dono do card.
 */
export function vinculoDivergente(
  telefoneLead: string | null | undefined,
  numeroContato: string | null | undefined,
  whatsappIdContato?: string | null
): boolean {
  // @lid (ID interno da Meta) e @g.us (grupo) não carregam telefone: nada a comparar.
  const jid = String(whatsappIdContato || '');
  if (jid.includes('@lid') || jid.includes('@g.us')) return false;

  const lead = final8(telefoneLead);
  const contato = final8(numeroContato);
  if (!lead || !contato) return false;

  return lead !== contato;
}

/** Mensagem de erro única para os pontos de envio. */
export function erroVinculoDivergente(
  telefoneLead: string | null | undefined,
  numeroContato: string | null | undefined
): string {
  return (
    `Envio bloqueado: o card está vinculado à conversa do número ${numeroContato}, ` +
    `mas o telefone do lead é ${telefoneLead}. Corrija o telefone do card ou ` +
    `desvincule a conversa antes de enviar.`
  );
}
