# Acord Kingdoms

Jogo 2D medieval de **conquista territorial, gerenciamento de reino e progressão de escala**.
Canvas 2D puro para o mundo, React apenas para HUD e painéis. Sem 3D em nenhuma camada.

## Rodar

```bash
npm install
npm run dev
```

## Deploy

O projeto é um app Vite estático. Na Vercel, o preset padrão já serve:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

## Assets

A arte original (PNG grandes, ~115 MB) fica em `AssetsAcordKingdons/` e **não é
versionada** — só o resultado processado em `public/assets/` (~3 MB) entra no
repositório e no deploy. Para regerar os sprites, coloque os PNG originais nessa
pasta e rode o script abaixo; ele recorta, redimensiona e exporta em WebP,
gerando também o `manifest.json` com tamanho e âncora de cada sprite:

```bash
python3 tools/prepare_assets.py
```

Para trocar ou acrescentar arte, edite o dicionário `MAP` em `tools/prepare_assets.py`
e rode de novo. O jogo usa o vetor de fallback sempre que um sprite não existir.

## Arquitetura

```
src/game/
  types.ts            Territory, Kingdom, Building, Deposit, Army, ResourceBag…
  state.ts            monta o estado inicial a partir dos JSONs
  Game.ts             loop, input, ações, tutorial
  config/             balance.ts (todo o balanceamento) e palette.ts
  data/               territories, kingdoms, buildings, units, lore (JSON)
  world/              geração do mundo (ruído → fronteiras, rios, estradas, depósitos)
  managers/           Economy, Building, Army, Territory, Camera, Save
  render/             Renderer + camadas (terreno, fronteira, props, construções, exércitos)
src/ui/               HUD, painel de cidade, minimapa, tutorial, abertura
```

Regras que a arquitetura preserva:

- **Fronteira obrigatória**: só se disputa território vizinho (`TerritoryManager.claimStatus`).
- **Conquista genérica**: `transferOwnership(id, dono, motivo)` aceita MILITARY, DIPLOMATIC,
  ECONOMIC, RELIGIOUS, REBELLION, VASSALIZATION — nada engessado em "venceu batalha".
- **Data-driven**: mapa, construções e unidades vêm de JSON; o mundo pode crescer sem
  reescrever geometria.
- **Simulação central**: um único passo de tempo move economia, obras e treinamento.
  Renderização e simulação são independentes (a aba em segundo plano não perde tempo).
