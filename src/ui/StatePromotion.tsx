import { useState } from 'react';
import { assetUrl, spriteUrl } from '../game/config/version';
import { CIVIL_POLICIES, WAR_POLICIES } from '../game/config/balance';
import { LORE } from '../game/data/defs';
import type { Game } from '../game/Game';
import { GENERALS, GOVERNORS, type AdvisorDef } from '../game/managers/RealmManager';
import type { CivilPolicy, WarPolicy } from '../game/types';

/** Grade de cartas de conselheiro. Usa a carta ilustrada quando existir. */
function AdvisorGrid({
  list,
  pickedId,
  onPick,
}: {
  list: AdvisorDef[];
  pickedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div className="gov-grid">
        {list.map((a) => (
          <button
            key={a.id}
            className={`gov ${pickedId === a.id ? 'active' : ''}`}
            onClick={() => onPick(a.id)}
          >
            <img src={spriteUrl(a.card ?? a.portrait)} alt="" />
            <span className="gn">{a.name}</span>
            <span className="gt">{a.trait}</span>
          </button>
        ))}
      </div>
      <div className="hint">{list.find((a) => a.id === pickedId)?.hint}</div>
    </>
  );
}

/**
 * Fundação do Estado (§5).
 *
 * Chega quando não sobra bandeira rival no mapa. O jogo para, conta o que
 * aconteceu e pede as três decisões que passam a valer daqui em diante: o nome
 * do que foi construído, quem administra em seu lugar e a ordem que essa
 * pessoa segue quando você não estiver olhando.
 */
export function StatePromotion({ game }: { game: Game }) {
  const promo = LORE.statePromotion;
  const [step, setStep] = useState<'story' | 'name' | 'governor' | 'general'>('story');
  const [name, setName] = useState('Acordelot');
  const [governorId, setGovernorId] = useState(GOVERNORS[0].id);
  const [generalId, setGeneralId] = useState(GENERALS[0].id);
  const [civil, setCivil] = useState<CivilPolicy>('celeiros');
  const [war, setWar] = useState<WarPolicy>('fronteira');

  return (
    <div className="promo">
      <img className="promo-art" src={assetUrl('/brand/keyart.webp')} alt="" />
      <div className="promo-veil" />

      <div className="promo-card">
        {step === 'story' && (
          <>
            <div className="promo-chapter">{promo.chapter}</div>
            <h2 className="gilded">{promo.title}</h2>
            {promo.text.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <p className="promo-closing">{promo.closing}</p>
            <div className="actions">
              <button className="btn gold wide" onClick={() => setStep('name')}>
                Prosseguir
              </button>
            </div>
          </>
        )}

        {step === 'name' && (
          <>
            <div className="promo-chapter">Fundação</div>
            <h2 className="gilded">O nome do Estado</h2>
            <p>
              Cinco reinos, doze terras, um só estandarte. Como os cronistas vão
              chamar isto daqui a cem anos?
            </p>
            <input
              className="promo-input"
              value={name}
              maxLength={28}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do Estado"
              autoFocus
            />
            <div className="actions">
              <button
                className="btn gold wide"
                disabled={!name.trim()}
                onClick={() => setStep('governor')}
              >
                Estado de {name.trim() || '…'}
              </button>
              <button className="btn sm" onClick={() => setStep('story')}>
                Voltar
              </button>
            </div>
          </>
        )}

        {step === 'governor' && (
          <>
            <div className="promo-chapter">Fundação · 1 de 2</div>
            <h2 className="gilded">Quem governa em seu nome</h2>
            <p>
              O governador cuida das cidades: o que sai do solo, quem trabalha,
              quanta gente nasce e o humor com que ela acorda.
            </p>

            <AdvisorGrid list={GOVERNORS} pickedId={governorId} onPick={setGovernorId} />

            <div className="section-title">Ordem ao governador</div>
            <div className="target-row">
              {(Object.keys(CIVIL_POLICIES) as CivilPolicy[]).map((p) => (
                <button
                  key={p}
                  className={`target ${civil === p ? 'active' : ''}`}
                  onClick={() => setCivil(p)}
                >
                  {CIVIL_POLICIES[p].name}
                </button>
              ))}
            </div>
            <div className="hint">{CIVIL_POLICIES[civil].hint}</div>

            <div className="actions">
              <button className="btn gold wide" onClick={() => setStep('general')}>
                Prosseguir ao comando militar
              </button>
              <button className="btn sm" onClick={() => setStep('name')}>
                Voltar
              </button>
            </div>
          </>
        )}

        {step === 'general' && (
          <>
            <div className="promo-chapter">Fundação · 2 de 2</div>
            <h2 className="gilded">Quem comanda os exércitos</h2>
            <p>
              O general cuida da tropa e da fronteira: quem treina, com que
              firmeza marcha e o que acontece quando batem no seu portão.
            </p>

            <AdvisorGrid list={GENERALS} pickedId={generalId} onPick={setGeneralId} />

            <div className="section-title">Ordem ao general</div>
            <div className="target-row">
              {(Object.keys(WAR_POLICIES) as WarPolicy[]).map((p) => (
                <button
                  key={p}
                  className={`target ${war === p ? 'active' : ''}`}
                  onClick={() => setWar(p)}
                >
                  {WAR_POLICIES[p].name}
                </button>
              ))}
            </div>
            <div className="hint">{WAR_POLICIES[war].hint}</div>
            <div className="hint" style={{ borderLeftColor: 'var(--gold)' }}>
              As duas ordens podem ser trocadas quando quiser, no painel do Reino.
            </div>

            <div className="actions">
              <button
                className="btn gold wide"
                onClick={() => game.foundState(name, governorId, generalId, civil, war)}
              >
                Fundar o Estado de {name.trim()}
              </button>
              <button className="btn sm" onClick={() => setStep('governor')}>
                Voltar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
