# Proposta de Redesign — Dashboard (gestao_financeira)

> Status: **proposta aprovada, não implementada.** Documento de referência.
> Decisões do Diogo (2026-06-13): colapsar cards redundantes · animação **mais expressiva** · usar identidade da marca.
> Ver skill `design-pro-max` e `identidade_visual/identidade_visual.md`.

Tela alvo: `frontend/src/pages/Dashboard.tsx` (+ `components/ui/Card.tsx`, `MetricCard.tsx`).
Escopo: **puramente visual** — nenhuma lógica de dados/query/cálculo muda.

---

## Diagnóstico do estado atual

1. **A marca não aparece.** Dashboard usa cores genéricas do Tailwind (green/red/blue/purple/indigo/teal/orange). Nada de navy/dourado.
2. **A paleta da marca já existe no config** (`tailwind.config.js`: `lp.navy/gold/cream` + fontes `display: The Seasons`, `sans: Poppins`) mas só a landing usa — o Dashboard ignora.
3. **Sobrecarga / sem hierarquia:** 14 cards de KPI (4 big numbers + 4 métricas + 6 filtrados) com peso igual, antes dos gráficos. Redundância ("A Receber" aparece 3×).
4. **Cards chapados:** `shadow-sm` + ícone em círculo pastel (`bg-green-100`). Datado.
5. **Zero movimento.**
6. **Config sujo:** coexistem 3 paletas (`primary` roxo, `brand` laranja antigo, `lp` oficial).

## Conceito

**"Navy domina, dourado pontua, números respiram."** Aplicar o sistema de marca existente, criar hierarquia e dar vida com Motion na linguagem de "peças que se encaixam".

### 1. Hierarquia (3 níveis)

```
┌─────────────────────────────────────────────────────────────┐
│  HERO STRIP  (navy-gradient, borda-esquerda dourada)         │
│   LUCRO DO PERÍODO        ↑ Margem 32%                        │
│   R$ 48.250,00   ◀── count-up animado, em creme/branco       │
│   Faturamento R$ 150k · Despesas R$ 102k  (resumo inline)    │
└─────────────────────────────────────────────────────────────┘
[Faturamento] [Despesas] [Clientes] [Ticket]   ◀── 4 KPIs (stagger reveal)
[Inadimplência] [A Receber] [A Pagar]           ◀── chips menores, 3ª linha
──────  Filtro de período (mantido)  ──────
[ Gráficos 2-col, reveal on scroll ]
```

- **Lucro vira o herói** (número que define o negócio).
- **Os 6 "cards filtrados" redundantes serão removidos** (decisão aprovada) — o filtro já afeta tudo e os dados repetem big numbers/gráficos.

### 2. Cor — semântica de marca

| Papel | Hoje | Proposto |
|-------|------|----------|
| Estrutura/títulos | cinza/preto | **navy `#13264C`** |
| Destaque/herói/CTA | roxo/azul | **dourado `#D2B773`** |
| Fundo da página | branco/cinza | **creme `#E5DDD1`** sutil + cards brancos |
| Receita (positivo) | green-600 | **esmeralda `#10b981`** (cor do app) |
| Despesa (negativo) | red-600 | vermelho contido `#dc2626` |
| Ícones | círculo pastel | navy/dourado, fundo sutil ou sem círculo |

Remover o arco-íris (roxo/índigo/teal/laranja). Fica navy + dourado + esmeralda/vermelho (só semântica financeira).

### 3. Componentes — estilo 21st.dev (React + Tailwind + CVA)

- **MetricCard** repaginado: `rounded-xl`, borda sutil, hover com elevação (`-translate-y-0.5` + shadow), número grande, micro-tendência ↑/↓ semântica, mini-sparkline opcional.
- **Hero card:** `navy-gradient`, número em branco/creme, **borda-esquerda dourada** (eco da assinatura da marca, que usa `border-left:3px solid #D2B773`).
- Introduzir `class-variance-authority` + `tailwind-merge` para variantes.

### 4. Movimento — Motion (`motion/react`) — perfil EXPRESSIVO (aprovado)

- **Reveal de "peças encaixando"** bem visível na entrada do hero + grid (não só fade): elementos entram de direções alternadas e se assentam, ecoando o símbolo do quebra-cabeça.
- **Stagger** acentuado nos KPI cards (`staggerChildren ~0.08–0.1`).
- **Count-up** nos valores financeiros (0 → total) com easing.
- **Hover** com elevação + leve realce dourado na borda.
- **Gráficos:** `whileInView` com slide+scale ao rolar.
- **Transição de rota** (opcional): `AnimatePresence` fade+slide.
- **`prefers-reduced-motion`:** desliga/reduz tudo (obrigatório).

### 5. Limpeza de fundação (fase 2)

- Migrar `lp.*` → tokens oficiais (`#13264C / #D2B773 / #E5DDD1`).
- Remover paletas órfãs `primary` (roxo) e `brand` (laranja antigo).

## Escopo, risco, esforço

- **Visual apenas** — `useQuery`/`useMemo`/formatação intactos.
- **Risco baixo**; app de renda → implementar incremental e revisar antes do `npm run build`.
- **Nova dependência:** `motion` (+ `cva`/`tailwind-merge`) — instalar só com OK do Diogo.
- Fases sugeridas:
  1. Tokens + Hero + KPIs + Motion expressivo (maior impacto).
  2. Gráficos (paleta navy/dourado/esmeralda) + remoção dos cards redundantes.
  3. Limpeza do `tailwind.config.js`.

## Deploy (quando implementar)
```bash
cd /var/www/apps/gestao_financeira/frontend
npm run build
```
(Sem mudança de API → não precisa `pm2 restart`.)
