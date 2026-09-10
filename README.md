# Lands of Acordelot

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

### Como a atualização chega no aparelho

PWA instalado é o caso mais chato: o aparelho guarda o que baixou e não
pergunta de novo. A estratégia aqui tem três camadas e **não usa service
worker de propósito** — um SW mal configurado é a causa mais comum de app
travado numa versão velha.

1. **URL carimbada.** `vite.config.ts` gera um `__BUILD_ID__` novo a cada
   build. Todo sprite e o manifesto de arte são pedidos como
   `/assets/…?v=<BUILD_ID>`. O navegador indexa o cache pela URL inteira, então
   uma build nova nunca reaproveita o arquivo antigo.
2. **Cabeçalhos explícitos** (`vercel.json`): `index.html` e
   `manifest.webmanifest` com `max-age=0, must-revalidate`; tudo em `/assets/`
   com `immutable`, porque ou tem hash no nome (bundles) ou tem `?v=` (arte).
3. **Aviso dentro do jogo.** `UpdateWatcher` relê o `index.html` com
   `cache: 'no-store'` a cada 2 minutos e ao voltar para o app, compara o
   bundle publicado com o que está rodando e oferece **Atualizar** — que limpa
   Cache Storage, remove service workers órfãos e recarrega.

A versão em execução aparece no painel **Ajuda**, junto com um botão de
**Forçar atualização** para depurar no aparelho.

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
