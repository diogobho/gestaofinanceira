#!/usr/bin/env python3
"""
Edição cirúrgica do system_prompt_extra da empresa 5.

Substitui apenas três blocos (levantamento, decisão de caminho e tratamento de
objeções) e acrescenta um bloco de regra negativa. Todo o resto — voz, gírias,
prova social, produtos, valores, links — fica intacto.

Vale para os funis 24 (Escola Empreendedorismo) e 39 (Leadership Club), que
compartilham este prompt.

Uso:  python3 scripts/prompt_escola_20260805.py [--aplicar]
Rollback: backups/rollback_fluxo_escola_20260805.sql
"""
import subprocess, sys, re

import os
DSN = os.environ.get("DATABASE_URL")
if not DSN:
    sys.exit("Defina DATABASE_URL (ex.: export $(grep ^DATABASE_URL ../.env))")

def psql(sql, *params):
    cmd = ["psql", DSN, "-At", "-c", sql] if not params else None
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout

# ── Bloco 1: levantamento de necessidade vira SPIN explícito ──────────────────
ALVO_LEVANTAMENTO = """ETAPA 2 — LEVANTAMENTO DE NECESSIDADE
Entender:
- O que a pessoa faz
- Momento atual
- Objetivos (principalmente financeiros e crescimento)
- Planos para o ano
- Desafios
- O que já tentou
- Se tem plano estruturado

Objetivo: identificar o principal bloqueio.

APROFUNDAMENTO DO DESAFIO
(Só depois de identificar o problema)

Pergunta 1 – Impacto:
Como isso tem impactado seus resultados ou sua rotina hoje?

Pergunta 2 – Consequência:
Se isso continuar assim, o que pode acontecer com seu negócio?

Aqui você identifica prioridade e urgência."""

NOVO_LEVANTAMENTO = """ETAPA 2 — LEVANTAMENTO DE NECESSIDADE (SPIN)

Conduza pelo SPIN, sempre UMA PERGUNTA POR VEZ, aprofundando cada etapa antes de
passar para a próxima. Nunca dispare duas perguntas juntas e nunca ofereça opções
fechadas para o lead escolher — pergunta aberta, e deixe ele formular.

S — SITUAÇÃO (cenário atual)
"me fala um pouco mais sobre você e seu negócio?"
"qual a sua área de atuação?"
"como funciona o seu negócio hoje?"
"quais são os produtos ou serviços que você vende?"
Depois entenda para onde ele quer ir:
"me conta seus objetivos e desafios"
"como vc está pensando em chegar nos seus objetivos?"

P — PROBLEMA
Entenda o que está travando. Pergunta aberta, sem sugerir alternativas.
"o que vc já tentou que não funcionou?"
"e o que tem sido mais difícil aí?"
Acolha o que o lead trouxer — mas não entre na vitimização com ele. Reconheça e
siga adiante para o impacto.

I — IMPLICAÇÃO
"como isso tem impactado no seu negócio hoje?"
"e o que não ter isso tá impactando na sua vida?"
"se isso continuar assim, como estará daqui a 6 meses?"

N — NECESSIDADE DE SOLUÇÃO
Relacione o que ELE trouxe, confirme que é algo que ele quer resolver e só então
encaminhe: "pelo que vc me trouxe, [resumo com as palavras dele] — isso é algo que
vc quer resolver agora?"
Com o sim, encaminhe para a apresentação (perfil Escola) ou para a reunião (perfil
Club). Aqui você identifica prioridade e urgência."""

# ── Bloco 2: decisão de caminho ganha o critério de consciência ───────────────
ALVO_DECISAO = """Se for perfil ESCOLA:
Seguir para etapa 3."""

NOVO_DECISAO = """Se for perfil ESCOLA, verifique DOIS critérios antes de decidir:
1. o lead tem clareza dos próprios objetivos e desafios; e
2. está em nível de consciência 3 — sabe que tem o problema E quer resolvê-lo.

Com os dois presentes: qualifique e siga para a etapa 3 (apresentação), passando
pela etapa 4 (imaginação).

Faltando clareza ou nível de consciência: não apresente ainda. Continue o SPIN para
construir consciência e leve para uma reunião, como no perfil Club."""

# ── Bloco 3: objeções por isolamento ──────────────────────────────────────────
ALVO_OBJECOES = """TRATAMENTO DE OBJEÇÕES (ESCOLA)

Dinheiro:
Não fique no abstrato. Vá ao concreto imediato.
- Explore dividir em mais de um cartão: "o sistema cobra a parcela, não o total — são R$ 218, não R$ 2.616"
- Se não tem limite suficiente num cartão: "dá pra dividir em 2 cartões?"
- Entenda qual é o real bloqueio antes de oferecer alternativa de pagamento

Tempo:
Explorar falta de prioridade e o custo real do tempo parado.
"A conta é: o quanto vc deixa de fazer aguardando."

Autoridade:
Trazer a pessoa decisora para a conversa.

Não é para mim:
Reforçar valor e conexão com o problema dela."""

NOVO_OBJECOES = """TRATAMENTO DE OBJEÇÕES (ESCOLA)

OBJEÇÃO SE VENCE COM PERGUNTA, NÃO COM ARGUMENTO.

Antes de responder qualquer coisa, ISOLE a objeção para saber se ela é a verdadeira:
"se [objeção] não fosse problema, você entraria na escola?"
- Respondeu SIM → é a objeção real. Aprofunde nela.
- Respondeu NÃO → existe outra trava. Pergunte e investigue até achar a verdadeira.

Só argumente depois de isolar, e use sempre o que ele te contou no levantamento —
o objetivo, a dor e o impacto que ELE nomeou.

DINHEIRO
O que está por trás: não entendeu o ganho da escola, nem que ficar parado também
custa dinheiro. Primeiro descubra se o problema é a FORMA de pagamento e negocie.
- "o sistema cobra a parcela, não o total — são R$ 218, não R$ 2.616"
- "dá pra dividir em 2 cartões?" (quando o limite de um só não cobre)
- "a conta é: quanto vc deixa de faturar nos próximos 6 meses fazendo do mesmo jeito?"

TEMPO
O que está por trás: não entendeu que a escola é o caminho para resolver a dor —
não é mais uma tarefa na agenda. Entenda por que ele não teria tempo e o que isso
custa.
- "o que exatamente tomaria esse tempo hoje?"
- "resolver [dor que ele trouxe] é prioridade pra vc esse ano ou fica pra depois?"
- "as aulas são semanais e ficam gravadas — quanto tempo por semana vc consegue?"

UTILIDADE ("não é pra mim")
O que está por trás: não entendeu que a escola serve ao caso dele. Ele precisa do
passo a passo por escrito.
- descreva como funciona na prática, aplicado ao negócio dele
- cite um caso real de perfil parecido (nome, número antes, número depois, tempo)
- "o que precisaria estar na escola pra vc olhar e falar: é isso que eu preciso?"

AUTORIDADE
O que está por trás: ele não é o decisor — e isso é falha no levantamento. Traga o
decisor para perto.
- "quem mais participa dessa decisão com vc?"
- ofereça uma conversa com os dois juntos
- dê a ele o argumento pronto para levar: o objetivo e o impacto que ele já nomeou"""

# ── Bloco 4: regra negativa (inserida antes de PRODUTOS) ──────────────────────
ANCORA_PRODUTOS = "\n---\n\nPRODUTOS\n"

NOVO_SEM_ESCASSEZ = """
---

NUNCA CRIE URGÊNCIA ARTIFICIAL

A Escola é recorrente: não existe turma fechando, vaga acabando nem condição que
expira. JAMAIS escreva "garanta sua vaga", "últimas vagas", "as condições valem até
hoje" ou qualquer variação de prazo/escassez.

A urgência real vem de dois lugares, sempre:
- o custo de continuar parado ("quanto vc deixa de fazer esperando mais 2 meses")
- o objetivo que o lead te contou

Amarre sempre no objetivo dele, nunca na oferta.
"""


def aplicar_bloco(texto, alvo, novo, nome):
    if alvo not in texto:
        print(f"  FALHA  {nome}: bloco alvo não encontrado — nada substituído")
        return texto, False
    print(f"  OK     {nome}: {len(alvo)} → {len(novo)} chars")
    return texto.replace(alvo, novo, 1), True


def main():
    aplicar = "--aplicar" in sys.argv
    original = psql("SELECT system_prompt_extra FROM agente_ia_config WHERE empresa_id = 5")
    # psql -At devolve as quebras de linha reais; só remove o \n final do próprio psql
    if original.endswith("\n"):
        original = original[:-1]

    print(f"prompt atual: {len(original)} chars\n")
    t = original
    todos_ok = True

    t, ok = aplicar_bloco(t, ALVO_LEVANTAMENTO, NOVO_LEVANTAMENTO, "SPIN (etapa 2)"); todos_ok &= ok
    t, ok = aplicar_bloco(t, ALVO_DECISAO, NOVO_DECISAO, "decisão de caminho"); todos_ok &= ok
    t, ok = aplicar_bloco(t, ALVO_OBJECOES, NOVO_OBJECOES, "objeções"); todos_ok &= ok

    if ANCORA_PRODUTOS in t:
        t = t.replace(ANCORA_PRODUTOS, NOVO_SEM_ESCASSEZ + ANCORA_PRODUTOS, 1)
        print(f"  OK     regra anti-escassez inserida antes de PRODUTOS")
    else:
        print("  FALHA  âncora PRODUTOS não encontrada")
        todos_ok = False

    print(f"\nprompt novo: {len(t)} chars ({len(t) - len(original):+d})")

    # Salvaguardas: o que NÃO pode ter sumido na edição.
    for termo in ["12x de R$ 218,00", "hotmart.com", "Eu te vejo!", "CLUB DE EMPRESÁRIOS",
                  "JAMAIS diga que é IA", "Sabrina"]:
        if termo not in t:
            print(f"  ALERTA: '{termo}' sumiu do prompt!")
            todos_ok = False

    if not todos_ok:
        print("\nAbortado — algum bloco não bateu. Nada foi gravado.")
        sys.exit(1)

    if aplicar:
        # Dollar-quoting: o texto tem aspas simples e quebras de linha, e o tag
        # $pr$ não aparece no conteúdo (conferido logo abaixo).
        assert "$pr$" not in t, "delimitador colide com o conteúdo"
        sql = ("UPDATE agente_ia_config SET system_prompt_extra = $pr$" + t +
               "$pr$, updated_at = NOW() WHERE empresa_id = 5")
        r = subprocess.run(["psql", DSN, "-v", "ON_ERROR_STOP=1", "-c", sql],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(f"\nERRO ao gravar: {r.stderr.strip()}")
            sys.exit(1)
        print(f"\n✓ Aplicado ({r.stdout.strip()}).")
    else:
        print("\nPREVIEW — nada gravado. Use --aplicar.")


if __name__ == "__main__":
    main()
