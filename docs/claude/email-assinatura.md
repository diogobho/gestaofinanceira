# Assinatura de e-mail

> Parte do `CLAUDE.md` da Gestão Financeira, separada por tamanho. Índice no `CLAUDE.md` da app.

## Assinatura de e-mail — é do usuário, não do sistema

Mora em `usuarios.assinatura_email` (migration 063) e é editada em
`/gestao/perfil` (`UserProfile.tsx`). O disparo de e-mail
(`DisparoEmailModal.tsx`) só **lê** dali; editar no modal vale para aquele
disparo (rascunho em `localStorage`, chave `crm_email_signature_draft`).

Quem não tem assinatura salva recebe um padrão **gerado na hora** com os dados
da própria empresa — `frontend/src/utils/assinaturaEmail.ts` usa
`empresas.{nome,email,telefone,endereco,logo_url,cor_primaria}` + nome do
usuário. Nunca chumbar assinatura de cliente como padrão: até 13/08/2026 o
`DEFAULT_SIGNATURE` era o HTML do Instituto Totem (empresa 5) e ele aparecia
para **todas** as empresas. A da Panteras foi preservada no banco por
`api/scripts/seed_assinatura_email_panteras_20260813.sql`.

Assets: os da Panteras/Totem em `frontend/public/signature/` (SVG, servido em
`/gestao/signature/`); os da DuoFuturo em `/var/www/apps/landing/signature/`
(PNG + página de preview em `duofuturo.tech/signature/`). **PNG, não SVG** —
Gmail e Outlook bloqueiam SVG em e-mail.

### A assinatura nunca passa pelo editor de texto rico (09/09/2026)

Ela é HTML de e-mail — tabelas com `<td>` lado a lado — e o `EmailEditor` é TipTap
**sem nó de tabela**: recebendo o template inteiro ele descarta `<table>/<tr>/<td>`,
promove cada filho a bloco e devolve isso no `onUpdate`, que era gravado por cima do
original. `EditarAgendamentoModal` fazia exatamente isso; a criação sempre fez certo,
com a assinatura num textarea à parte.

O template gravado é `corpo + SEPARADOR_ASSINATURA + assinatura`, e os dois lados
moram em `utils/assinaturaEmail.ts` (`montarEmailComAssinatura` / `separarAssinatura`).
**Quem edita um disparo tem que separar antes e recompor depois** — só o corpo entra
no editor.

- **O que se perdia não era o empilhamento.** Ícone empilhado é do editor, onde a
  imagem é bloco; no e-mail os `<img>` são inline e ficam lado a lado. Perdiam-se o
  alinhamento central, a tipografia da marca e os `<a href>` em volta dos ícones — as
  redes deixavam de ser clicáveis.
- **Impressão digital do achatamento:** o editor carimba `max-w-full rounded` no que
  serializa (`Image.configure`). Num disparo íntegro a classe aparece só no CORPO; num
  achatado, nos ícones da ASSINATURA. É esse o teste — "não tem `<table>`" daria falso
  positivo em quem nunca teve assinatura.
- Passado corrigido por `api/scripts/reparar_assinatura_disparos_20260909.js`
  (idempotente, simula sem `--aplicar`; a assinatura de referência sai do disparo
  íntegro mais recente do mesmo usuário, não de `usuarios.assinatura_email` — a da
  Panteras é a do perfil menos o logo, tirado de propósito).

`setImage({ src })` também insere `<img>` **sem largura** e nada pós-processa o HTML:
imagem entra no tamanho natural e estoura o cabeçalho. Arte de e-mail vai publicada já
em 600px (largura padrão) em `uploads/email-images/` — a única árvore de `uploads/`
que é pública, porque a imagem precisa abrir para quem não tem login.
