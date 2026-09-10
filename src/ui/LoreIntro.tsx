import { useEffect, useState } from 'react';
import { LORE } from '../game/data/defs';
import { spriteUrl } from '../game/config/version';
import { assets } from '../game/render/AssetManager';
import { PRELOAD_KEYS } from '../game/render/spriteCatalog';

/**
 * Abertura: lore + pré-carregamento dos sprites.
 * O texto vem de `lore.json` — trocar a história não exige tocar em código.
 */
export function LoreIntro({ onStart, hasSave }: { onStart: () => void; hasSave: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // O manifesto pode ainda não ter chegado quando a tela monta, então o
    // preload é repetido a cada tique — `get()` cria a imagem uma única vez.
    const id = setInterval(() => {
      assets.preload(PRELOAD_KEYS);
      const p = assets.ready ? assets.progress(PRELOAD_KEYS) : 0;
      setProgress(p);
      if (assets.ready && p >= 1) clearInterval(id);
    }, 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="lore">
      <div className="lore-inner">
        <img className="lore-portrait" src={spriteUrl('portraits/king')} alt="" />
        <div className="lore-text">
          <h1>{LORE.title}</h1>
          <div className="chapter">{LORE.chapter}</div>
          {LORE.intro.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <p className="closing">{LORE.closing}</p>

          <div className="lore-bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <div className="actions">
            <button className="btn gold" onClick={onStart} disabled={progress < 0.6}>
              {progress < 0.6 ? 'Preparando o reino…' : hasSave ? 'Continuar reinado' : 'Assumir o trono'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
