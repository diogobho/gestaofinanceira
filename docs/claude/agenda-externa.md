# Agenda externa — Google Agenda e Microsoft 365/Teams (103, 06/10/2026)

Reunião do CRM (`tarefas_lead` tipo `reuniao`) vira evento na agenda do **responsável**, com sala
do **Meet** (Google) ou do **Teams** (Microsoft). Só ida: o que se cria direto lá não volta.
Decisão do dono: reuniões do CRM (não Sessões), Duo → agenda com link.

- **Conexão por usuário**, em Meu perfil → "Agenda (Google ou Microsoft)". Uma agenda por
  usuário (`agenda_contas`, PK `usuario_id`); tokens com `encrypt()`. OAuth: `POST
  /agenda-externa/conectar/:provedor` devolve a URL; o retorno (`GET /callback/:provedor`, sem
  login) confia no `state` assinado com `JWT_ACCESS_SECRET` (15 min) e volta a
  `/gestao/perfil?agenda=ok|erro|cancelada|expirada`.
- **Sincronização** (`sincronizarTarefa`, idempotente, decide pelo estado da tarefa): pendente/em
  andamento → cria ou atualiza (só se a `assinatura` mudou); concluída → fica como está;
  cancelada/excluída/outro tipo/responsável sem agenda → apaga; trocou o responsável → sai de uma
  agenda e entra na outra. `tarefasService.create/update/delete` chamam `aoMudarTarefa` (sem
  esperar); o job `agenda-externa-scheduler` (5 min, instância 0) concilia o resto.
- **Evento:** título da tarefa + nome do lead, duração de `tarefas_reuniao` (104, tabela à parte
  porque `tarefas_lead` é do postgres; sem linha = 60 min — o form do card e o agente gravam),
  descrição com WhatsApp/e-mail do lead. Lead com e-mail vira **convidado** (`sendUpdates=all`:
  o Google/Outlook manda o convite). Horário: `data_vencimento` é UTC naive → vai como UTC.
- O link (`agenda_eventos.link_reuniao`) aparece na tarefa do card ("Entrar na reunião").
  **Meet sai pendente:** a doc do Google avisa que a sala é criada de forma assíncrona e a
  resposta do POST pode vir sem link. `completarLink` relê o evento (2,5 s depois) e o job
  insiste enquanto `link_reuniao` for nulo — só no Google: conta pessoal da Microsoft nunca
  ganha sala do Teams, e reler para sempre seria inútil.
- Desconectar apaga as reuniões futuras que o Duo pôs lá. Token revogado → `agenda_contas.erro`
  e a tela pede "Reconectar".

## Configuração

Google: feito em 06/10/2026 no projeto `agente-crm-495614` (Google Auth Platform, público
Externo, em teste; cliente Web "Duo produção"), chaves no `.env`. Microsoft: pendente.

Credenciais no `.env` (nunca no ecosystem): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET` (opcional `MS_OAUTH_TENANT`, padrão `common`).
Sem elas o botão do provedor fica desabilitado.

- **Google Cloud Console:** projeto → APIs → ativar *Google Calendar API* → Tela de consentimento
  (externo; escopos `openid`, `email`, `calendar.events`) → Credenciais → ID do cliente OAuth
  (aplicativo da Web) com URI de redirecionamento
  `https://duofuturo.tech/api/gestao/agenda-externa/callback/google`. Em modo **Teste** só os
  e-mails cadastrados como testadores conectam, e o refresh token expira em 7 dias; para todo
  cliente, publicar e passar pela verificação do Google (`calendar.events` é escopo sensível).
- **Microsoft Entra (portal.azure.com) → Registros de aplicativo:** contas "qualquer diretório
  organizacional e contas pessoais"; redirecionamento Web
  `https://duofuturo.tech/api/gestao/agenda-externa/callback/microsoft`; permissões delegadas do
  Graph `User.Read`, `Calendars.ReadWrite`, `offline_access`; criar um segredo do cliente.
  Sala do **Teams** só sai em conta corporativa/escolar (Microsoft 365); conta pessoal
  (outlook.com) cria o evento sem a sala.

## Ajuda e política (06/10/2026)

- Formulário de tarefa (card): tipo Reunião mostra **Duração** e `AvisoAgendaReuniao` (vai para a
  sua agenda / conectar em Meu perfil).
- Vídeo `conectar-agenda` (tema "Usando o Duo"), linkado no cartão de Meu perfil; nota em
  Suporte → Atualizações.
- Política de privacidade v1.1, seção **6.1** (escopos, o que faz e não faz, revogação, frase de
  Uso Limitado do Google) — pré-requisito da verificação. Backup em landing/_backup_privacidade_20261006.
