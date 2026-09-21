# Prompt — lançamento com os 10 usuários fundadores (15/09/2026)

> Montado em 14/09/2026 a partir do estado verificado do sistema. Cole na íntegra
> numa sessão nova do Claude Code, em `/var/www/apps/gestao_financeira`.

```markdown
# Tarefa: preparar o lançamento de amanhã (15/09/2026) com 10 usuários fundadores

Projeto: /var/www/apps/gestao_financeira (app em https://duofuturo.tech/gestao/).
Leia antes o CLAUDE.md da app — em especial "Papéis de usuário", "Boas-vindas de conta
nova", "Planos, fidelidade e usuários inclusos", "Suporte por ticket" e "Conexão por QR".

São duas entregas, nesta ordem, e a primeira alimenta a segunda:
A) revisar o app pela jornada que um fundador vai fazer amanhã — e consertar o que
   impediria essa jornada;
B) montar, junto com o comercial, o plano do dia com os 10 fundadores.

## Contexto verificado em 14/09/2026 (confira antes de depender de qualquer item)

### Bloqueio conhecido — resolver ANTES de qualquer outra coisa
- A API do Asaas responde 403 `commercial_info_expired` ("atualização cadastral anual
  obrigatória"). Com isso, cadastro por PIX/cartão/boleto FALHA: `registrar` chama
  `asaasService.garantirContaCorreta()`, que lança, e o catch desfaz empresa e usuário
  — a pessoa vê "Erro ao criar conta". Só o teste grátis (TRIAL) passa. A atualização
  é feita pelo dono da conta no painel do Asaas (conta Futuron, CNPJ 53441843000190);
  não há o que fazer no código. Confirme com:
  `cd api && node -e "require('dotenv').config();require('axios').get('https://api.asaas.com/v3/myAccount',{headers:{access_token:process.env.ASAAS_API_KEY}}).then(r=>console.log('OK',r.data.name)).catch(e=>console.log(e.response?.status,e.response?.data))"`
  Se continuar 403 amanhã cedo, o plano B é todo fundador entrar pelo TRIAL e a
  assinatura ser feita depois, em Minha Conta — e o comercial precisa saber disso.

### O que já foi testado e funciona
- Cadastro em página única (/gestao/register) pelo TRIAL: conta criada, dono nasce
  `creator` (abre Agente IA → Configurar Agente), e-mail de boas-vindas do plano sai de
  suporte@duofuturo.tech com o PDF do plano anexado.
- Opt-in de WhatsApp no cadastro → a pessoa manda a mensagem para o número oficial
  +55 11 94052-4435 e recebe texto + PDF do plano (dedupe e "uma vez só" testados).
- Painel /gestao/onboarding (super_admin, conta master@gestao.com): mostra o que cada
  conta nova recebeu, com o erro legível quando falha, e reenvia.
- Suporte por ticket (/gestao/suporte), atendido por gente — sem IA no módulo.
- Todo cadastro concluído vira lead no CRM da conta suporte@duofuturo.tech, funil
  **Vendas CRM → Entrada**, com plano, forma de começar e o id da conta nas notas —
  é por lá que o comercial vê quem entrou (sem automação no estágio).

### Riscos conhecidos que afetam amanhã
- **O e-mail de boas-vindas cai no lixo eletrônico do Outlook/Microsoft 365 — com ou
  sem o PDF anexado** (os dois testados em 14/09, no tenant da escolapanthers.com.br).
  **No Gmail chega na caixa de entrada**, com anexo (testado em 14/09). SPF, DKIM e
  DMARC passam (mail-tester 9,2/10, SpamAssassin −0,3): o que pesa é o filtro da
  Microsoft contra um domínio remetente novo + IP compartilhado do Brevo, e nada no
  conteúdo resolve isso a curto prazo. Consequência prática: para fundador com e-mail
  corporativo Microsoft (Outlook/Hotmail/365), o comercial tem que avisar antes, dizer
  que procure no lixo eletrônico e pedir que marque "não é lixo" (isso treina o filtro
  da caixa dela). Pergunte o provedor de e-mail de cada um na lista dos 10.
  Para os 10 fundadores, o material pode ir também pelo WhatsApp oficial (opt-in do
  cadastro) ou pelo próprio comercial.
- **O plano não restringe módulo nenhum** (não há guard por plano na API nem no menu):
  um fundador Starter enxerga CRM, WhatsApp e Agente IA. O conteúdo de boas-vindas é
  por plano; a tela, não. Não prometa ao fundador que "o Starter é mais simples".
- **WhatsApp do cliente é por QR (Baileys), não pela API oficial** — o Tech Provider da
  Meta ainda está em análise. Número novo que dispara muito de uma vez é bloqueado:
  o onboarding de WhatsApp tem que vir com a regra de ir devagar nos primeiros dias.
- **Agente de IA exige a chave de API do próprio cliente** (Anthropic ou Gemini). Sem
  chave e sem saldo, follow-up de IA fica parado — é o que acontece hoje na empresa 5.
- **E-mail do cliente sem SMTP próprio sai pela conta Brevo da Futuron** (fallback
  global). Para disparo de e-mail com o domínio do fundador, ele precisa configurar
  Config. E-mail — o guia do plano Profissional/Enterprise ensina.

### Oferta de fundador (docs/plano_vendas_2026_resumo_ceo.html — confirme com o dono)
- R$ 219/mês (Profissional) e R$ 397/mês (Enterprise), + R$ 100 por usuário extra.
- Quem assina em 2026 mantém o preço por 12 meses; em janeiro a tabela sobe 13%.
- Planos e ciclos vivos: tabela `planos` + `planos_ciclos` (Starter 79 · Profissional
  219 · Enterprise 397 no mensal, com desconto no tri/sem/anual).

## Parte A — Revisão do app pela jornada do fundador

Não é auditoria de código. É fazer, de ponta a ponta, o que um fundador fará amanhã, e
anotar o que trava, o que confunde e o que só é feio.

Método:
1. Crie UMA conta de teste por plano pelo /gestao/register (TRIAL), com e-mails e
   telefones nossos. Nunca use conta ou dado de cliente real (LGPD). Anote empresa_id
   e usuario_id: tudo que você criar será apagado no fim.
2. Em cada conta, siga o guia do próprio plano (landing/onboarding/guia.html?plano=…),
   passo a passo, como a pessoa faria. Meça no viewport real do usuário (1526×790 CSS)
   e no celular (390px).
3. Para cada problema: tela, passo, o que aconteceu, o que era esperado, severidade:
   - **BLOQUEIA** — o fundador não consegue concluir o passo;
   - **ATRAPALHA** — conclui, mas com erro, dúvida ou retrabalho;
   - **COSMÉTICO** — só aparência.
4. Conserte hoje só BLOQUEIA (e ATRAPALHA barato, de risco baixo). O resto vira lista
   priorizada para a semana — nada de refatorar na véspera do lançamento.

Jornada mínima a percorrer:
- Cadastro (TRIAL e, se o Asaas voltar, PIX) → confirmação → login → tutorial guiado.
- Financeiro: cliente → receita à vista e parcelada → despesa com categoria → Parcelas
  (dar baixa) → Dashboard bate com o que foi lançado → Exportar PDF.
- Perfil: assinatura de e-mail (prévia correta, não passa pelo editor rico).
- Profissional/Enterprise: tela WhatsApp (QR aparece e renova), funil e estágios,
  novo lead, importar CSV, card do lead, disparo de WhatsApp e de e-mail (com o
  fallback de SMTP), CRM Dashboard.
- Enterprise: Agente IA → Configurar Agente (só o creator vê), instrução por estágio,
  cadência na visão Fluxo, Agendamentos → Horário de envio, criar usuário da equipe
  (limite do plano respeitado).
- Minha Conta: trocar de plano/assinar depois do trial (depende do Asaas).
- Suporte: abrir chamado como fundador e responder como super_admin.
- Os e-mails que o sistema manda (boas-vindas, confirmação de chamado): chegaram? em
  que pasta? (Boas-vindas já medido: Gmail = entrada, Outlook/365 = lixo eletrônico.)

## Parte B — Plano do dia com o comercial

Monte o plano para os 10 fundadores, a partir do que a Parte A mostrou. Quero:

1. **Linha do tempo** D-1 (hoje), D0 (amanhã, por horário), D+1, D+3, D+7 — quem faz
   o quê, por qual canal.
2. **Onboarding assistido** em vez de "se vira com o e-mail": uma chamada curta por
   fundador (ou em grupos pequenos), com roteiro de 20–30 min que leva a pessoa até o
   **primeiro valor** do plano dela — defina qual é esse momento por plano (ex.:
   Starter = primeira receita e o Dashboard mostrando o mês; Profissional = WhatsApp
   conectado e primeiro lead conversado pelo card; Enterprise = agente respondendo no
   estágio de entrada).
3. **Mensagens prontas** para o comercial (WhatsApp e e-mail): convite com o link de
   cadastro, lembrete para olhar o lixo eletrônico, confirmação da chamada, pós-chamada,
   pedido de feedback no D+3 e no D+7. Curtas, no tom da marca, sem promessa que o app
   não cumpre (ver "Riscos conhecidos").
4. **Condição de fundador** escrita em uma frase que o comercial repete igual para os
   10 — preço, por quanto tempo vale, o que acontece depois do trial.
5. **Captura de feedback**: onde fica registrado (sugestão: um funil próprio no CRM da
   conta DuoFuturo, com um card por fundador e estágios do onboarding), o que perguntar
   e quem consolida.
6. **Plano de contingência** para os problemas prováveis: Asaas fora, e-mail no lixo,
   QR que não conecta, número bloqueado, dúvida fora do horário. Para cada um, o que o
   comercial diz e para quem escala.
7. **Critério de sucesso do dia** — números simples (quantos cadastrados, quantos
   chegaram ao primeiro valor, quantos chamados abertos) e onde o comercial olha isso
   (funil Vendas CRM na conta suporte@duofuturo.tech, painel /gestao/onboarding e
   /gestao/suporte).

## Entregáveis
- `docs/lancamento_fundadores/revisao_app.md` — a matriz da Parte A (tela, passo,
  severidade, status: corrigido/pendente) + o que foi corrigido hoje.
- `docs/lancamento_fundadores/plano_do_dia.md` — a Parte B, pronta para o comercial.
- Os roteiros e mensagens num formato que o comercial copie e cole.
- Atualize o CLAUDE.md da app só com armadilhas novas encontradas.

## Regras
- Teste só com e-mails e números nossos; nada de disparar para cliente real. Apague as
  contas de teste no fim (usuarios, assinaturas, empresas, onboarding_envios) e o lead
  que cada uma gerou no funil Vendas CRM (57) da empresa 32.
- Antes de mexer em código: `git status` — a árvore tem muita alteração em andamento de
  outras sessões. Nunca `git add -A`; commit só se o dono pedir.
- Build: `npm run build` em api/ e frontend/; `pm2 restart gestao-financeira-api`.
- Credencial mora no api/.env (nunca no ecosystem.config.js). Senhas de acesso em
  /var/www/apps/CREDENCIAIS.md — não copie para os entregáveis.
- Não mande o comercial prometer o que o app não faz. Quando o app não faz, o plano diz
  como contornar.

## Decisões em aberto — pergunte ao dono ANTES de montar a Parte B
1. Quem são os 10 (nome, empresa, plano pretendido, canal de contato, provedor de
   e-mail — Gmail ou Microsoft) e se já têm conta criada ou vão se cadastrar amanhã.
2. A condição de fundador acima está valendo como está? Há cupom, cortesia de usuários
   extras (`usuarios_cortesia`) ou trial estendido?
3. Quem do comercial conduz as chamadas, e em que horários de amanhã.
4. Como o material chega aos fundadores, sabendo que o e-mail cai no lixo do Outlook:
   só o e-mail (com aviso do comercial), também pelo WhatsApp oficial, ou o comercial
   manda o PDF do plano pessoalmente?
5. Os fundadores entram todos pelo TRIAL, ou o comercial quer fechar a assinatura na
   chamada (depende do Asaas)?
```
