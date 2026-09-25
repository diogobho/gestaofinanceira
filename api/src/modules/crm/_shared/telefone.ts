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

/**
 * Os dígitos, só quando dá para tratá-los como telefone. Fora dessa faixa é
 * vazio, ramal, ID ou lixo colado: não dá para comparar, então não dá para
 * acusar divergência.
 */
function digitosComparaveis(valor: string | null | undefined): string | null {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos;
}

/**
 * O MESMO número com o DDI 55 sobrando de um lado.
 *
 * Cadastro antigo colou o 55 do Brasil na frente de número que já tinha o DDI
 * dele (`55` + `13016139577` dos EUA). Não é outra pessoa: é o mesmo destino
 * escrito de duas formas, e o WhatsApp resolve. Bloquear aqui só tiraria do ar
 * um envio que funciona.
 */
function mesmoNumeroCom55Sobrando(a: string, b: string): boolean {
  return a === `55${b}` || b === `55${a}`;
}

/**
 * Os dois lados apontam para o mesmo destino?
 *
 * Compara duas vezes de propósito: nos dígitos como estão e na `chaveTelefone`.
 * O 55 sobrando precisa da comparação crua porque a chave normaliza um lado e o
 * outro não — `5531994770550` vira `3194770550` (é BR reconhecível), enquanto
 * `555531994770550` fica inteiro (15 dígitos não casam padrão nenhum), e aí as
 * chaves não se encontram mesmo sendo o mesmo número.
 */
function mesmoDestino(a: string, b: string): boolean {
  if (a === b || mesmoNumeroCom55Sobrando(a, b)) return true;

  const chaveA = chaveTelefone(a);
  const chaveB = chaveTelefone(b);
  if (!chaveA || !chaveB) return false;

  return chaveA === chaveB || mesmoNumeroCom55Sobrando(chaveA, chaveB);
}

/**
 * true quando o telefone do lead e o número do contato são, ambos, telefones
 * plausíveis e apontam para pessoas diferentes — o cenário em que a mensagem
 * sairia para quem não é o dono do card.
 *
 * A comparação é pela `chaveTelefone` INTEIRA, não pelo fim do número. Comparar
 * só os 8 dígitos finais deixava passar justamente o erro mais comum de
 * cadastro, que é no começo: `351`+`5191070326` (DDI de Portugal grudado num
 * número brasileiro) e `55`+`5191070326` terminam igual, e a mensagem saía para
 * um JID que não existe — "não tem conta no WhatsApp" num número que o card
 * mostrava certo. Mesma coisa com DDD trocado: `5521973587656` contra
 * `5555973587656`.
 *
 * O que a chave já absorve, e por isso NÃO é divergência: o 9º dígito e o DDI
 * 55 ausente de um dos lados — as duas formas em que o mesmo número brasileiro
 * aparece conforme a origem do cadastro. Bloquear essas quebraria quase toda a
 * base (2.690 vínculos legítimos só na empresa 5).
 */
export function vinculoDivergente(
  telefoneLead: string | null | undefined,
  numeroContato: string | null | undefined,
  whatsappIdContato?: string | null
): boolean {
  // @lid (ID interno da Meta) e @g.us (grupo) não carregam telefone: nada a comparar.
  const jid = String(whatsappIdContato || '');
  if (jid.includes('@lid') || jid.includes('@g.us')) return false;

  const lead = digitosComparaveis(telefoneLead);
  const contato = digitosComparaveis(numeroContato);
  if (!lead || !contato) return false;

  return !mesmoDestino(lead, contato);
}

/**
 * A divergência está só no COMEÇO do número — mesmo assinante nos 8 dígitos
 * finais, DDI ou DDD escrito de outro jeito (`351`+`5191070326` contra
 * `55`+`5191070326`, ou DDD 21 contra 55).
 *
 * Serve para graduar o bloqueio: aqui é erro de cadastro, e uma resposta
 * recebida naquela conversa já prova qual é o destino real. Quando os 8 finais
 * também diferem é OUTRA pessoa — foi para isso que o guard nasceu, e nesse
 * caso nada isenta: o card da Lani Sian aponta para uma conversa com 554
 * mensagens recebidas de outro número.
 */
export function divergenciaApenasNoPrefixo(
  telefoneLead: string | null | undefined,
  numeroContato: string | null | undefined
): boolean {
  const lead = String(telefoneLead || '').replace(/\D/g, '');
  const contato = String(numeroContato || '').replace(/\D/g, '');
  if (lead.length < 10 || contato.length < 10) return false;
  return lead.slice(-8) === contato.slice(-8);
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

// Um número só é aceito se puder ser telefone de gente. O primeiro evento real do
// SendFlow (02/09/2026) trouxe "0000000000000" e virou um lead chamado 0000000000000:
// contar dígitos não basta, placeholder também tem 13.
export function telefonePlausivel(digitos: string): boolean {
  if (digitos.length < 10 || digitos.length > 15) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;      // 000..., 111... — placeholder
  if (digitos.startsWith('0')) return false;         // nenhum DDI começa com 0
  // Brasil: DDI + DDD + 8/9 dígitos. Fora disso é id, não telefone.
  if (digitos.startsWith('55') && digitos.length !== 12 && digitos.length !== 13) return false;
  return true;
}

// Primeira mensagem de um número desconhecido só vira contato quando o remetente é um
// TELEFONE: `@lid` sem resolução é id interno do WhatsApp (14–15 dígitos que passariam
// na contagem) e `@g.us` é grupo. Gravar um desses criaria card com número que não
// recebe mensagem.
export function podeSerContatoNovo(jid: string, numero: string): boolean {
  if (!jid || /@(lid|g\.us|broadcast|newsletter)$/.test(jid)) return false;
  return telefonePlausivel(numero);
}
