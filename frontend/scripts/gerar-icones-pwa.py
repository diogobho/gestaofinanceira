#!/usr/bin/env python3
"""
Gera os ícones do PWA a partir de public/logo.png.

O logo original é 1920x1080 (16:9) com o símbolo centralizado e muita margem
branca. O manifest declarava esse mesmo arquivo como 192x192 e 512x512: o Android
acreditava na declaração e esticava a imagem — daí o ícone achatado no splash e
cortado na home.

Aqui o símbolo é recortado pelo seu bounding box real e recomposto em canvas
QUADRADO, em duas variantes:

  any       — símbolo ocupando ~88% do canvas, fundo transparente.
              Usado onde o sistema não recorta nada.
  maskable  — símbolo em ~60% do canvas sobre fundo branco.
              O Android recorta a máscara (círculo, squircle...) e pode comer até
              20% de cada borda; os 40% de respiro garantem que nada do símbolo
              seja cortado. É o que resolve o logo "sangrando" na home.

O fundo é BRANCO, não o navy da marca: o azul do símbolo é #023b64 e contra o navy
#13264C o contraste fica em 1.29:1 — metade do logo simplesmente some. Contra branco
são 11.59:1 (e o laranja mantém 2.92:1, suficiente para forma sólida grande).

Uso: python3 scripts/gerar-icones-pwa.py
"""
from PIL import Image
import os

ORIGEM = 'public/logo.png'
SAIDA = 'public/icons'
FUNDO = (255, 255, 255, 255)

# Fração do canvas ocupada pelo símbolo em cada variante.
OCUPACAO_ANY = 0.88
OCUPACAO_MASKABLE = 0.60  # safe zone de 40% exigida por ícone maskable


def recortar_simbolo(img: Image.Image) -> Image.Image:
    """Devolve só o símbolo, sem a margem em volta (transparente ou branca)."""
    img = img.convert('RGBA')
    caixa = img.getbbox()  # ignora bordas totalmente transparentes

    # Se o fundo for branco opaco em vez de transparente, getbbox() devolve a
    # imagem inteira — nesse caso achamos a caixa pelos pixels não-brancos.
    if caixa == (0, 0, *img.size):
        pixels = img.load()
        w, h = img.size
        x0, y0, x1, y1 = w, h, 0, 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if a > 10 and not (r > 245 and g > 245 and b > 245):
                    x0, y0 = min(x0, x), min(y0, y)
                    x1, y1 = max(x1, x), max(y1, y)
        caixa = (x0, y0, x1 + 1, y1 + 1)

    return img.crop(caixa)


def montar(simbolo: Image.Image, lado: int, ocupacao: float, fundo) -> Image.Image:
    """Centraliza o símbolo num canvas quadrado, preservando a proporção dele."""
    canvas = Image.new('RGBA', (lado, lado), fundo)
    alvo = int(lado * ocupacao)

    # escala pelo maior lado → nunca distorce
    escala = alvo / max(simbolo.size)
    novo = (max(1, round(simbolo.width * escala)), max(1, round(simbolo.height * escala)))
    redimensionado = simbolo.resize(novo, Image.LANCZOS)

    canvas.paste(redimensionado,
                 ((lado - novo[0]) // 2, (lado - novo[1]) // 2),
                 redimensionado)
    return canvas


def main():
    original = Image.open(ORIGEM)
    print(f'origem: {original.size} {original.mode}')

    simbolo = recortar_simbolo(original)
    print(f'símbolo recortado: {simbolo.size}  (proporção {simbolo.width / simbolo.height:.2f})')

    os.makedirs(SAIDA, exist_ok=True)
    transparente = (0, 0, 0, 0)

    saidas = [
        ('icon-192.png', 192, OCUPACAO_ANY, transparente),
        ('icon-512.png', 512, OCUPACAO_ANY, transparente),
        ('icon-maskable-192.png', 192, OCUPACAO_MASKABLE, FUNDO),
        ('icon-maskable-512.png', 512, OCUPACAO_MASKABLE, FUNDO),
        # apple-touch-icon não suporta transparência: precisa de fundo sólido.
        ('apple-touch-icon.png', 180, 0.80, FUNDO),
    ]

    for nome, lado, ocupacao, fundo in saidas:
        img = montar(simbolo, lado, ocupacao, fundo)
        caminho = os.path.join(SAIDA, nome)
        img.save(caminho, 'PNG', optimize=True)
        print(f'  ✓ {nome:26} {lado}x{lado}  {os.path.getsize(caminho) // 1024}KB')

    print('\nPronto. Atualize o manifest para apontar para public/icons/.')


if __name__ == '__main__':
    main()
