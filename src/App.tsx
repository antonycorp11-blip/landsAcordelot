import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMERA } from './game/config/balance';
import { assetUrl, BUILD_ID } from './game/config/version';
import { Game, type GameSnapshot } from './game/Game';
import { assets } from './game/render/AssetManager';
import { CampaignPanel } from './ui/CampaignPanel';
import { BuildingPanel } from './ui/BuildingPanel';
import { CityPanel } from './ui/CityPanel';
import { DebugPanel } from './ui/DebugPanel';
import { EconomyPanel } from './ui/EconomyPanel';
import { IconBug } from './ui/icons';
import { KingdomPanel } from './ui/KingdomPanel';
import { LoreIntro } from './ui/LoreIntro';
import { Minimap } from './ui/Minimap';
import { SaveTools } from './ui/SavePanel';
import { Tutorial } from './ui/Tutorial';
import { TopBar } from './ui/TopBar';
import { safeAreaReport, watchSafeArea } from './ui/safeArea';
import { UpdateWatcher } from './ui/UpdateWatcher';

type Rail = 'kingdom' | 'campaigns' | 'help' | 'debug' | null;

/**
 * Trilho lateral no formato do conceito: medalhão dourado + rótulo curto.
 * Cada item ou abre um painel ou leva a câmera a algum lugar útil.
 */
const RAIL_ITEMS: {
  id: string;
  medal: string;
  label: string;
  title: string;
  run: (
    game: Game,
    rail: Rail,
    setRail: (r: Rail) => void,
    openCapital: () => void,
    snap: GameSnapshot,
  ) => void;
}[] = [
  {
    id: 'kingdom',
    medal: 'reino',
    label: 'Reino',
    title: 'Visão do reino',
    run: (_g, rail, setRail) => setRail(rail === 'kingdom' ? null : 'kingdom'),
  },
  {
    id: 'mundo',
    medal: 'mundo',
    label: 'Mundo',
    title: 'Voltar à capital',
    run: (_g, _r, _s, openCapital) => openCapital(),
  },
  {
    id: 'stalled',
    medal: 'tecnologia',
    label: 'Produção',
    title: 'Ir para a produção parada',
    run: (game, _r, _s, openCapital, snap) => {
      const stalled = game
        .ownedTerritories()
        .find((t) =>
          t.buildingIds.some((id) => {
            const b = snap.state.buildings[id];
            return b && b.construction === 0 && b.workers === 0;
          }),
        );
      if (!stalled) {
        game.notify('Nenhuma construção parada.', 2);
        openCapital();
        return;
      }
      const parada = stalled.buildingIds.find((id) => {
        const b = snap.state.buildings[id];
        return b && b.construction === 0 && b.workers === 0;
      });
      if (parada) game.selectBuilding(parada);
    },
  },
  {
    id: 'campaigns',
    medal: 'exercitos',
    label: 'Exércitos',
    title: 'Campanhas e batalhas',
    run: (_g, rail, setRail) => setRail(rail === 'campaigns' ? null : 'campaigns'),
  },
  {
    id: 'save',
    medal: 'diplomacia',
    label: 'Salvar',
    title: 'Salvar o reino agora',
    run: (game) => game.saveNow(),
  },
  {
    id: 'help',
    medal: 'relatorios',
    label: 'Ajuda',
    title: 'Como jogar',
    run: (_g, rail, setRail) => setRail(rail === 'help' ? null : 'help'),
  },
];

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [rail, setRail] = useState<Rail>(null);
  const [dragging, setDragging] = useState(false);
  const [economyOpen, setEconomyOpen] = useState(false);
  // O trilho é só atalho: quem já sabe onde tudo fica prefere a tela limpa.
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem('acordelot:rail') !== 'min';
    } catch {
      return true;
    }
  });
  const toggleRail = () => {
    setRailOpen((v) => {
      try {
        localStorage.setItem('acordelot:rail', v ? 'min' : 'open');
      } catch {
        /* sem storage: a preferência vale só para esta sessão */
      }
      return !v;
    });
  };
  const [started, setStarted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const isDev = import.meta.env.DEV;

  // Mede o recorte da tela antes de qualquer coisa aparecer.
  useEffect(() => watchSafeArea(), []);

  // Cria o jogo e carrega o manifesto de sprites (o mundo é gerado uma vez).
  useEffect(() => {
    let alive = true;
    const g = new Game();
    // O save vive em IndexedDB: a leitura é assíncrona e precisa terminar antes
    // de o jogo aparecer, senão começaríamos do zero por cima do progresso.
    void Promise.all([g.boot(), assets.load()]).then(() => {
      if (!alive) return;
      setHasSave(g.saves.hasSave());
      setGame(g);
    });
    return () => {
      alive = false;
      g.detach();
    };
  }, []);

  // Liga o canvas ao loop assim que o jogador entra.
  useEffect(() => {
    if (!game || !started || !canvasRef.current) return;
    game.attach(canvasRef.current);
    const unsub = game.subscribe(setSnap);
    // O iOS dispara o evento antes de terminar a rotação: medimos de novo depois.
    let settle: number | undefined;
    const onResize = () => {
      game.resize();
      window.clearTimeout(settle);
      settle = window.setTimeout(() => game.resize(), 350);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      unsub();
      game.detach();
    };
  }, [game, started]);

  // Teclado.
  useEffect(() => {
    if (!game || !started) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          game.camera.panBy(120, 0);
          break;
        case 'ArrowRight':
        case 'd':
          game.camera.panBy(-120, 0);
          break;
        case 'ArrowUp':
        case 'w':
          game.camera.panBy(0, 120);
          break;
        case 'ArrowDown':
        case 's':
          game.camera.panBy(0, -120);
          break;
        case '+':
        case '=':
          game.zoomBy(CAMERA.zoomStep);
          break;
        case '-':
          game.zoomBy(1 / CAMERA.zoomStep);
          break;
        case ' ':
          e.preventDefault();
          game.setSpeed(game.state.time.speed === 0 ? 1 : 0);
          break;
        case 'Escape':
          game.select(null);
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, started]);

  // Ponteiro: arrastar move, clique seleciona, roda/pinça dá zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!game || !started || !canvas) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinchDist = 0;

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = 0;
      if (pointers.size === 1) setDragging(true);
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') game.hoverAt(p.x, p.y);
        return;
      }
      pointers.set(e.pointerId, p);

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && dist > 0) {
          game.camera.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinchDist);
        }
        pinchDist = dist;
        moved += 10;
        return;
      }

      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      game.camera.panBy(dx, dy);
    };

    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) setDragging(false);
      if (p && moved < 8) game.selectAt(p.x, p.y);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? CAMERA.zoomStep : 1 / CAMERA.zoomStep;
      game.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [game, started]);

  const selected = useMemo(() => {
    if (!snap?.selectedId) return null;
    return snap.state.territories[snap.selectedId] ?? null;
  }, [snap]);

  // Construção aberta tem tela própria e toma o lugar do painel do território.
  const openBuilding = useMemo(() => {
    if (!game || !snap?.selectedBuildingId) return null;
    return snap.state.buildings[snap.selectedBuildingId] ?? null;
  }, [game, snap]);

  const idleWarnings = useMemo(() => {
    if (!game || !snap) return 0;
    let n = 0;
    for (const t of game.ownedTerritories()) {
      for (const id of t.buildingIds) {
        const b = snap.state.buildings[id];
        if (b && b.construction === 0 && b.workers === 0) n++;
      }
    }
    return n;
  }, [game, snap]);

  // Quantas colunas e batalhas estão em campo agora (badge do trilho).
  const inField = useMemo(() => {
    if (!game || !snap) return 0;
    return game.playerCampaigns().length + game.activeBattles().length;
  }, [game, snap]);

  const openCapital = () => {
    if (!game) return;
    const c = game.playerCapital();
    if (!c) return;
    game.select(c.id);
    game.focusTerritory(c.id, 0.95);
  };

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className={`map ${dragging ? 'dragging' : ''}`} />

      {!started && <LoreIntro onStart={() => setStarted(true)} hasSave={hasSave} />}

      {started && (!game || !snap) && (
        <div className="loading">
          <div className="t">Forjando o reino…</div>
        </div>
      )}

      {started && game && snap && (
        <div
          className={`hud ${selected || rail || openBuilding ? 'panel-open' : ''} ${
            railOpen ? '' : 'rail-min'
          }`}
        >
          <TopBar
            game={game}
            state={snap.state}
            economyOpen={economyOpen}
            onToggleEconomy={() => setEconomyOpen((v) => !v)}
          />

          {economyOpen && (
            <EconomyPanel game={game} state={snap.state} onClose={() => setEconomyOpen(false)} />
          )}

          <button
            className="rail-toggle"
            onClick={toggleRail}
            title={railOpen ? 'Recolher atalhos' : 'Mostrar atalhos'}
            style={railOpen ? { left: 'calc(var(--rail) + 8px + var(--safe-l))' } : undefined}
          >
            {railOpen ? '‹' : '›'}
          </button>

          <div className="rail">
            {RAIL_ITEMS.map((item) => {
              const badge =
                item.id === 'campaigns' ? inField : item.id === 'stalled' ? idleWarnings : 0;
              return (
                <button
                  key={item.id}
                  className={rail === item.id ? 'active' : ''}
                  title={item.title}
                  onClick={() => item.run(game, rail, setRail, openCapital, snap)}
                >
                  <img className="medal" src={assetUrl(`/ui/rail_${item.medal}.webp`)} alt="" />
                  <span className="tag">{item.label}</span>
                  {badge > 0 && <span className="badge">{badge}</span>}
                </button>
              );
            })}
            {isDev && (
              <button
                className={rail === 'debug' ? 'active' : ''}
                title="Debug"
                onClick={() => setRail(rail === 'debug' ? null : 'debug')}
              >
                <IconBug size={26} />
                <span className="tag">Debug</span>
              </button>
            )}
          </div>

          {rail !== 'kingdom' && rail !== 'help' && <Tutorial game={game} state={snap.state} />}

          {rail === 'kingdom' && (
            <KingdomPanel game={game} state={snap.state} onClose={() => setRail(null)} />
          )}

          {rail === 'campaigns' && (
            <CampaignPanel game={game} state={snap.state} onClose={() => setRail(null)} />
          )}

          {rail === 'help' && (
            <div className="panel left">
              <div className="panel-head">
                <div className="grow">
                  <div className="title">Como jogar</div>
                  <div className="sub">Controles e regras</div>
                </div>
                <button className="close" onClick={() => setRail(null)}>
                  ×
                </button>
              </div>
              <div className="panel-body">
                <div className="hint" style={{ marginTop: 0 }}>
                  <strong>Arrastar</strong> move o mapa · <strong>roda / pinça</strong> dá zoom ·{' '}
                  <strong>clique</strong> seleciona um território · <strong>Esc</strong> cancela ·{' '}
                  <strong>Espaço</strong> pausa · <strong>WASD</strong> move a câmera.
                </div>
                <div className="hint">
                  <strong>Cadeia produtiva:</strong> madeira → tábuas (serraria); pedra → tijolos
                  (olaria); minério → ferro (fundição); minério de ouro → moedas (casa da moeda).
                  Construções e tropas consomem os refinados.
                </div>
                <div className="hint">
                  <strong>Trabalhadores:</strong> um prédio vazio não produz. Contrate na aba
                  Trabalho e aloque em cada construção. Cada trabalhador custa salário por minuto.
                </div>
                <div className="hint">
                  <strong>Fronteiras:</strong> só se disputa território vizinho ao seu domínio.
                  Neutros aceitam negociação; reinos rivais exigem campanha militar.
                </div>
                <div className="hint">
                  <strong>Guerra:</strong> monte a expedição na aba Militar, veja a prévia de
                  perdas e marche. A coluna leva comida para a viagem — sem suprimento, a moral cai
                  e o exército debanda.
                </div>
                <div className="section-title">Seu progresso</div>
                <SaveTools game={game} />
                <div className="hint">
                  Recorte da tela: <strong>{safeAreaReport.top}</strong> topo ·{' '}
                  <strong>{safeAreaReport.right}</strong> dir ·{' '}
                  <strong>{safeAreaReport.bottom}</strong> base ·{' '}
                  <strong>{safeAreaReport.left}</strong> esq
                  {safeAreaReport.standalone ? ' · app instalado' : ' · no navegador'}
                  {safeAreaReport.fallback ? ' · usando folga de segurança' : ''}
                </div>
                <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>
                    Versão <strong>{BUILD_ID}</strong>
                  </span>
                  <button
                    className="btn sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                      void (async () => {
                        try {
                          if ('caches' in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map((k) => caches.delete(k)));
                          }
                        } catch {
                          /* segue mesmo assim */
                        }
                        window.location.replace(`${window.location.pathname}?r=${Date.now()}`);
                      })();
                    }}
                  >
                    Forçar atualização
                  </button>
                </div>
              </div>
            </div>
          )}

          {openBuilding ? (
            <BuildingPanel
              game={game}
              state={snap.state}
              building={openBuilding}
              onClose={() => game.selectBuilding(null)}
            />
          ) : (
            selected && (
              <CityPanel
                game={game}
                state={snap.state}
                territory={selected}
                onClose={() => game.select(null)}
              />
            )
          )}

          <Minimap game={game} version={snap.revision} />

          {isDev && rail === 'debug' && <DebugPanel game={game} fps={snap.fps} />}

          {snap.message && <div className="toast">{snap.message}</div>}
        </div>
      )}

      <UpdateWatcher />

      <div className="rotate-hint">
        <div>
          <span className="icon">📱</span>
          <div className="t">Gire o aparelho</div>
          <div className="s">Acord Kingdoms foi feito para a tela na horizontal.</div>
        </div>
      </div>
    </div>
  );
}
