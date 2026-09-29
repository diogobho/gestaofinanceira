# Prompt — levantar as automações do SendFlow (Claude Cowork)

Para colar no **Claude Cowork**, com o navegador **já logado no SendFlow por você**. O
Cowork faz só o levantamento e gera os arquivos; a migração para as Campanhas de grupo do
CRM é feita depois no Claude Code do servidor, a partir desses arquivos (Fase 2 abaixo).
Cole a partir da linha `---`.

---

Preciso que você levante, na minha conta do SendFlow (já aberta no navegador), tudo o que
existe de automação de grupos de WhatsApp. Vou migrar isso para outro sistema, e o seu
trabalho é **só ler e documentar**. Nada no SendFlow pode mudar.

## Regras (valem acima de qualquer outra instrução)

- **Só leitura.** Não crie, edite, pause, ative, exclua, duplique, dispare nem teste nada.
  Não clique em "Enviar", "Testar", "Ativar", "Salvar", "Publicar" ou "Excluir". Se uma
  informação só aparece dentro de uma tela de edição, abra, leia e saia pelo **Cancelar**
  ou pelo **X**, nunca pelo Salvar.
- **Nunca digite senha.** Se o SendFlow pedir login ou código, pare e me chame.
- Não copie token, chave de API, webhook secret nem dado de pagamento. Onde houver um,
  escreva só "existe (não copiado)".
- **Não copie telefone nem nome de participante de grupo.** Número de participante fica
  como contagem. Os únicos números que você anota são os dos WhatsApps conectados na conta
  (os administradores).
- Se algo estiver ambíguo, anote a dúvida e siga em frente. Não tente "descobrir" clicando
  em ações.

## O que levantar

1. **WhatsApps conectados:** número, nome dado na conta, status (conectado ou não).
2. **Campanhas**, uma a uma:
   - nome, status (ativa, pausada, encerrada) e data de criação;
   - o link da campanha (o que é divulgado) e como ele distribui as pessoas: limite de
     pessoas por grupo, se abre grupo novo sozinho, padrão de nome dos grupos novos;
   - descrição que os grupos recebem e as configurações (só admins enviam? só admins
     editam?);
   - quais WhatsApps administram a campanha;
   - os números do painel da campanha, se houver (cliques, entradas, saídas, por período).
3. **Grupos de cada campanha:** nome, quantidade de participantes, se está cheio ou
   fechado, qual WhatsApp é administrador, e o link de convite, se aparecer na tela.
4. **Mensagens programadas** de cada campanha:
   - texto **completo e exato**, com a formatação (`*negrito*`, `_itálico_`), os emojis e
     as quebras de linha;
   - mídia: tipo (imagem, vídeo, áudio, PDF) e nome do arquivo. Se houver botão de
     **baixar** (download, que não altera nada), baixe para a pasta
     `sendflow-migracao/midias/`, com o nome `<campanha>__<mensagem>.<extensão>`;
   - quando sai: data e hora (diga o fuso que a tela mostra) ou a recorrência;
   - para quais grupos vai (todos da campanha ou alguns);
   - se marca todos (@todos);
   - status: já enviada, agendada ou pausada.
5. **Boas-vindas** e outras automações por evento (entrada, saída, tag, compra, carrinho):
   o gatilho, o atraso, o texto completo e onde a mensagem é enviada (no grupo ou no
   privado).
6. **Webhooks e integrações:** para quais endereços o SendFlow manda eventos (anote o
   endereço até o `?`, sem o token) e quais eventos estão marcados; integrações com
   Hotmart, Eduzz, Kiwify, ActiveCampaign etc.
7. **Recursos que eu uso e que não se encaixam** em "campanha → grupos → mensagens →
   boas-vindas" (enquetes, pontuação de lead, disparo no privado, sequência 1×1…).

## O que entregar

Na pasta `sendflow-migracao/`:

1. `INVENTARIO.md`: uma seção por campanha, legível por gente, com as mensagens na íntegra.
2. `inventario.json` com esta estrutura (campo que não existir fica `null`):

```json
{
  "levantado_em": "AAAA-MM-DD HH:MM (fuso)",
  "whatsapps": [{ "numero": "55...", "nome": "", "conectado": true }],
  "campanhas": [{
    "nome": "", "status": "", "criada_em": "", "link": "",
    "limite_por_grupo": 0, "cria_grupos_sozinho": true, "padrao_nome_grupo": "",
    "descricao_grupo": "", "so_admins_enviam": true,
    "administradores": ["55..."],
    "painel": { "cliques": null, "entradas": null, "saidas": null, "periodo": "" },
    "grupos": [{ "nome": "", "participantes": 0, "cheio": false, "admin": "55...", "convite": null }],
    "mensagens": [{
      "titulo": "", "texto": "", "midia": { "tipo": "", "arquivo": "" },
      "quando": { "tipo": "unica|recorrente|imediata", "data_hora": "", "fuso": "", "dias_semana": [], "hora": "" },
      "grupos": "todos | [nomes]", "marca_todos": false, "status": ""
    }],
    "boas_vindas": [{ "texto": "", "atraso_segundos": 0, "onde": "grupo|privado", "ativa": true }]
  }],
  "automacoes_evento": [{ "gatilho": "", "acao": "", "texto": "" }],
  "webhooks": [{ "endereco": "", "eventos": [] }],
  "integracoes": [],
  "fora_do_modelo": [""],
  "duvidas": [""]
}
```

3. `midias/`: os arquivos baixados.

No fim, me dê um resumo curto: quantas campanhas, grupos, mensagens ainda agendadas e
boas-vindas; quais mensagens **ainda vão sair** nos próximos 7 dias (são as que exigem
cuidado na virada); e as dúvidas.

---

## Fase 2 (depois) — no Claude Code do servidor

Traga a pasta `sendflow-migracao/` para o servidor (ou cole o `inventario.json` no chat) e
peça: *"migre o inventário do SendFlow para as Campanhas de grupo, seguindo as regras de
`docs/PROMPT_MIGRACAO_SENDFLOW.md`"*. Regras dessa fase:

- tudo nasce **pausado** no CRM (campanhas sem criação automática de grupo, mensagens e
  boas-vindas desligadas); quem liga é o dono, depois de desligar o equivalente no SendFlow;
- grupo existente entra por "usar um grupo que já existe", com o chip que é admin e está
  conectado por QR no CRM; grupo novo só com autorização;
- campanhas que hoje chegam por `/webhook/sendflow` mantêm o mesmo funil, etapa, dono e
  `origem`, para o relatório não partir em dois;
- mensagem já enviada no SendFlow não é recriada;
- tudo é conferido lendo de volta pela API, e a entrega inclui o roteiro de virada (o que
  desligar no SendFlow, o que ligar no CRM, onde trocar o link antigo pelo novo).
