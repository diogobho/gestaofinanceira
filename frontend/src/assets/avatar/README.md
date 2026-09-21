# duo-face.svg — asset derivado

Recorte do rosto do Duo, para uso **inline** (`?raw`) em `components/avatar/DuoFace.tsx`.

Origem: `/var/www/apps/instituto_ser/duofuturo/avatar/propostas/v3/avatar-2-duo-v3.svg`
(o **estático** — o `-anim.svg` traz um `<style>` que, inline, vazaria
`prefers-reduced-motion` para o app inteiro).

O que muda em relação ao original:

| Mudança | Por quê |
|---|---|
| `viewBox="92 180 216 210"` | O Duo inteiro (pernas, sombra, braço da peça) some num botão de 56px. A altura para no pé do corpo (y=390): mais um fio e aparecia o toco das pernas. Com folga em cima para o pulo do hover não decepar a cabeça. |
| sem `width`/`height` | Quem dá tamanho é a caixa do wrapper. |
| sem `role`/`aria-label`/`<title>` | A acessibilidade fica no wrapper React, que sabe se aquela instância é decorativa. |
| `<g id="d3-brows">` nas sobrancelhas | O original não agrupa; sem isso não dá para levantar só a sobrancelha no hover. |

Para o corpo inteiro animado (chat vazio, telas grandes) use
`/gestao/avatar/duo-anim.svg` via `<img>` — ali o `<style>` interno fica preso ao
documento do SVG e o aceno já vem pronto.

Regerar depois de mexer na arte de origem: refazer o recorte e reaplicar as
quatro linhas da tabela.
