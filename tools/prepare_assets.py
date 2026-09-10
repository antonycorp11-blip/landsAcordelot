"""
Prepara os assets originais (PNG 1254px) para uso no jogo.

- recorta o excesso transparente (auto-trim)
- redimensiona para o tamanho que o jogo realmente desenha
- exporta em WebP (bem menor que PNG, suportado por <img>/canvas)
- fatia a folha de elementos de terreno por projeção de alpha
- gera manifest.json com âncora e tamanho de cada sprite

Rodar:  python3 tools/prepare_assets.py
"""

import json
import os
from PIL import Image

SRC = 'AssetsAcordKingdons'
OUT = 'public/assets'

# índice na listagem ordenada -> (categoria, nome, largura alvo, âncora Y)
# âncora Y = fração da altura onde o sprite "toca o chão".
MAP = {
    0:  ('settlements', 'metropolis',        620, 0.88),
    1:  ('settlements', 'citadel',           600, 0.88),
    2:  ('settlements', 'castle_l4',         470, 0.86),
    3:  ('settlements', 'castle_l2',         430, 0.86),
    4:  ('settlements', 'castle_l5',         520, 0.86),
    5:  ('settlements', 'castle_grand',      540, 0.86),
    6:  ('settlements', 'village',           380, 0.86),
    7:  ('settlements', 'walled_city',       560, 0.86),
    8:  ('settlements', 'harbor_town',       460, 0.86),
    51: ('settlements', 'castle_l3',         470, 0.86),
    54: ('settlements', 'ruin',              430, 0.86),
    52: ('settlements', 'castle_besieged',   470, 0.86),

    9:  ('buildings', 'gold_mine',   300, 0.86),
    10: ('buildings', 'sawmill',     300, 0.86),
    11: ('buildings', 'iron_mine',   300, 0.86),
    12: ('buildings', 'quarry',      300, 0.86),
    13: ('buildings', 'farm',        300, 0.86),
    14: ('buildings', 'herbalist',   280, 0.86),
    15: ('buildings', 'weaver',      280, 0.86),
    16: ('buildings', 'shipyard',    340, 0.86),
    33: ('buildings', 'war_camp',    320, 0.86),
    31: ('buildings', 'palisade',    260, 0.90),

    22: ('units', 'militia',   230, 0.95),
    23: ('units', 'spearman',  230, 0.95),
    25: ('units', 'archer',    230, 0.95),
    26: ('units', 'cavalry',   250, 0.95),
    42: ('units', 'swordsman', 230, 0.95),
    29: ('units', 'catapult',  230, 0.95),
    44: ('units', 'guard',     230, 0.95),
    43: ('units', 'knights',   250, 0.95),

    17: ('people', 'gold_miner', 150, 0.95),
    18: ('people', 'miner',      150, 0.95),
    19: ('people', 'lumberjack', 150, 0.95),
    20: ('people', 'farmer',     150, 0.95),
    21: ('people', 'fisher',     150, 0.95),
    36: ('people', 'mason',      150, 0.95),
    37: ('people', 'carpenter',  150, 0.95),
    38: ('people', 'smith',      150, 0.95),
    39: ('people', 'herbalist',  150, 0.95),
    40: ('people', 'weaver',     150, 0.95),

    34: ('props', 'supply_cart',  200, 0.92),
    35: ('props', 'supply_wagon', 220, 0.92),
    41: ('props', 'market_cart',  200, 0.92),
    30: ('props', 'planks',       160, 0.92),
    32: ('props', 'tent',         180, 0.90),
    27: ('props', 'ram',          200, 0.92),
    28: ('props', 'siege_tower',  200, 0.92),
    45: ('props', 'engineers',    220, 0.92),

    56: ('nature', 'tree_big',     150, 0.90),
    61: ('nature', 'tree_oak',     150, 0.90),
    57: ('nature', 'grove_wide',   340, 0.88),
    58: ('nature', 'grove_mixed',  320, 0.88),
    60: ('nature', 'forest_dense', 360, 0.88),

    46: ('portraits', 'prince',   420, 0.5),
    47: ('portraits', 'queen',    420, 0.5),
    48: ('portraits', 'king',     420, 0.5),
    49: ('portraits', 'princess', 420, 0.5),
    50: ('portraits', 'lord',     420, 0.5),
}

# Nomes das peças da folha de terreno (#59), em ordem de leitura.
TERRAIN_SHEET_INDEX = 59
TERRAIN_NAMES = [
    'tree_lone', 'grove_small', 'mountain_snow', 'boulders', 'mountain_rock', 'green_hill',
    'river_bend', 'lake', 'bridge_wood', 'bridge_stone', 'road_dirt', 'road_stone',
    'beach', 'cliff_falls', 'field_plowed', 'riders', 'pack_horse', 'peasants',
    'ship', 'wagon_covered', 'cattle', 'fishing_boat', 'longship', 'wagon_logs',
    'wagon_stone', 'wagon_food',
]

# Larguras específicas para algumas peças de terreno (o resto usa 220).
TERRAIN_WIDTH = {
    'tree_lone': 190, 'grove_small': 260, 'mountain_snow': 300, 'mountain_rock': 300,
    'boulders': 210, 'green_hill': 240, 'bridge_wood': 190, 'bridge_stone': 200,
    'peasants': 150, 'cattle': 170, 'pack_horse': 150, 'riders': 190,
    'wagon_covered': 170, 'wagon_logs': 170, 'wagon_stone': 170, 'wagon_food': 170,
    'ship': 230, 'fishing_boat': 190, 'longship': 230,
}


# Arquivos novos entregues com nome próprio: mapeados por nome, não por posição.
# Basta soltar o PNG em AssetsAcordKingdons/ com um destes nomes.
NAMED_MAP = {
    'lumberjack.png':  ('buildings', 'lumberjack', 300, 0.86),
    'brickworks.png':  ('buildings', 'brickworks', 300, 0.86),
    'foundry.png':     ('buildings', 'foundry',    300, 0.86),
    'mint.png':        ('buildings', 'mint',       300, 0.86),
    'house.png':       ('buildings', 'house',      280, 0.86),
    'warehouse.png':   ('buildings', 'warehouse',  300, 0.86),
    'market.png':      ('buildings', 'market',     300, 0.86),
    'market_b.png':    ('buildings', 'market_b',   300, 0.86),
    'market_c.png':    ('buildings', 'market_c',   300, 0.86),
    'barracks.png':    ('buildings', 'barracks',   320, 0.86),
    # Decoração de chão de Valdória. São decals largos e baixos: ficam por
    # baixo das árvores/prédios e quebram a aparência lisa do terreno.
    'valdoria_meadow.png':     ('nature', 'meadow_lush',        520, 0.90),
    'valdoria_undergrowth.png':('nature', 'forest_undergrowth', 520, 0.90),
    'gov_t1.png': ('advisors', 'gov_t1', 430, 0.5),
    'gov_t2.png': ('advisors', 'gov_t2', 430, 0.5),
    'gov_t3.png': ('advisors', 'gov_t3', 430, 0.5),
    'gov_t4.png': ('advisors', 'gov_t4', 430, 0.5),
    'gov_t5.png': ('advisors', 'gov_t5', 430, 0.5),
    'gen_t1.png': ('advisors', 'gen_t1', 430, 0.5),
    'gen_t2.png': ('advisors', 'gen_t2', 430, 0.5),
    'gen_t3.png': ('advisors', 'gen_t3', 430, 0.5),
    'gen_t4.png': ('advisors', 'gen_t4', 430, 0.5),
    'gen_t5.png': ('advisors', 'gen_t5', 430, 0.5),
    'crest_valdoria.png':  ('crests', 'valdoria',  200, 0.5),
    'crest_karneth.png':   ('crests', 'karneth',   200, 0.5),
    'crest_aurenna.png':   ('crests', 'aurenna',   200, 0.5),
    'crest_silvarden.png': ('crests', 'silvarden', 200, 0.5),
    'crest_morvath.png':   ('crests', 'morvath',   200, 0.5),
}


def trim(im: Image.Image, threshold: int = 10) -> Image.Image:
    alpha = im.getchannel('A')
    bbox = alpha.point(lambda v: 255 if v > threshold else 0).getbbox()
    return im.crop(bbox) if bbox else im


def save(im: Image.Image, category: str, name: str, width: int) -> dict:
    im = trim(im)
    if im.width > width:
        h = max(1, round(im.height * width / im.width))
        im = im.resize((width, h), Image.LANCZOS)
    folder = os.path.join(OUT, category)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{name}.webp')
    im.save(path, 'WEBP', quality=88, method=6)
    return {'w': im.width, 'h': im.height}


def slice_sheet(im: Image.Image, downsample: int = 4, min_area: int = 400):
    """
    Separa as peças da folha por componentes conectados no canal alpha.
    Muito mais confiável que projeção: peças coladas na horizontal ou com
    sombra suave continuam sendo separadas corretamente.
    """
    w, h = im.size
    sw, sh = w // downsample, h // downsample
    small = im.getchannel('A').resize((sw, sh), Image.BILINEAR)
    px = small.load()

    labels = [[0] * sw for _ in range(sh)]
    boxes: list[list[int]] = []
    current = 0

    for y0 in range(sh):
        for x0 in range(sw):
            if px[x0, y0] < 60 or labels[y0][x0]:
                continue
            current += 1
            minx = maxx = x0
            miny = maxy = y0
            area = 0
            stack = [(x0, y0)]
            labels[y0][x0] = current
            while stack:
                x, y = stack.pop()
                area += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < sw and 0 <= ny < sh and not labels[ny][nx] and px[nx, ny] >= 60:
                        labels[ny][nx] = current
                        stack.append((nx, ny))
            if area >= min_area:
                boxes.append([minx, miny, maxx, maxy])

    # Ordena em leitura natural: por faixa horizontal, depois por coluna.
    boxes.sort(key=lambda b: (round(b[1] / 12), b[0]))
    pieces = []
    for (minx, miny, maxx, maxy) in boxes:
        pieces.append(
            im.crop(
                (
                    max(0, minx * downsample - 2),
                    max(0, miny * downsample - 2),
                    min(w, (maxx + 1) * downsample + 2),
                    min(h, (maxy + 1) * downsample + 2),
                )
            )
        )
    return pieces


def main():
    files = sorted(
        f for f in os.listdir(SRC) if f.lower().endswith('.png') and f not in NAMED_MAP
    )
    manifest: dict[str, dict] = {}

    for idx, (category, name, width, anchorY) in MAP.items():
        if idx >= len(files):
            continue
        im = Image.open(os.path.join(SRC, files[idx])).convert('RGBA')
        size = save(im, category, name, width)
        manifest[f'{category}/{name}'] = {**size, 'ay': anchorY}

    # Assets entregues com nome próprio.
    for filename, (category, name, width, anchorY) in NAMED_MAP.items():
        path = os.path.join(SRC, filename)
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGBA')
        size = save(im, category, name, width)
        manifest[f'{category}/{name}'] = {**size, 'ay': anchorY}
        print(f'nomeado: {category}/{name}')

    sheet = Image.open(os.path.join(SRC, files[TERRAIN_SHEET_INDEX])).convert('RGBA')
    pieces = slice_sheet(sheet)
    print(f'terrain sheet: {len(pieces)} peças detectadas')
    for i, piece in enumerate(pieces):
        name = TERRAIN_NAMES[i] if i < len(TERRAIN_NAMES) else f'piece_{i}'
        size = save(piece, 'terrain', name, TERRAIN_WIDTH.get(name, 220))
        manifest[f'terrain/{name}'] = {**size, 'ay': 0.9}

    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f'{len(manifest)} sprites exportados para {OUT}')


if __name__ == '__main__':
    main()
