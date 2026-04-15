import { useState } from 'react';
import { useGame } from '../context/GameContext';
import type { RoomSettings } from '../types';

export default function OptionsMenu() {
  const { gameState, updateSettings } = useGame();
  const [open, setOpen] = useState(false);

  if (!gameState) return null;
  const s = gameState.settings;

  function set(patch: Partial<RoomSettings>) {
    updateSettings({ ...s, ...patch });
  }

  return (
    <>
      <button
        className="btn-options"
        onClick={() => setOpen(true)}
        title="Options"
      >
        ⚙️
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Game options</h3>

            <div className="option-row">
              <label htmlFor="opt-reveal">Challenge window</label>
              <span />
              <span />
              <div className="option-value">
                <input
                  id="opt-reveal"
                  type="number"
                  min={1}
                  max={60}
                  value={s.revealTimeoutSeconds}
                  onChange={(e) =>
                    set({
                      revealTimeoutSeconds: Math.min(
                        60,
                        Math.max(1, parseInt(e.target.value) || 10)
                      ),
                    })
                  }
                />
                <span>seconds</span>
              </div>
            </div>

            <div className="option-row">
              <label htmlFor="opt-auto">Auto-advance</label>
              <input
                id="opt-auto"
                type="checkbox"
                checked={s.autoAdvanceSeconds !== null}
                onChange={(e) =>
                  set({ autoAdvanceSeconds: e.target.checked ? 5 : null })
                }
              />
              <span className="option-after">
                {s.autoAdvanceSeconds !== null ? 'after' : ''}
              </span>
              <div className="option-value">
                {s.autoAdvanceSeconds !== null && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={s.autoAdvanceSeconds}
                      onChange={(e) =>
                        set({
                          autoAdvanceSeconds: Math.min(
                            120,
                            Math.max(1, parseInt(e.target.value) || 5)
                          ),
                        })
                      }
                    />
                    <span>seconds</span>
                  </>
                )}
              </div>
            </div>

            <div className="option-row">
              <label htmlFor="opt-auto-challenge">
                Auto-advance after challenge
              </label>
              <input
                id="opt-auto-challenge"
                type="checkbox"
                checked={s.autoAdvanceChallengeSeconds !== null}
                onChange={(e) =>
                  set({
                    autoAdvanceChallengeSeconds: e.target.checked ? 10 : null,
                  })
                }
              />
              <span className="option-after">
                {s.autoAdvanceChallengeSeconds !== null ? 'after' : ''}
              </span>
              <div className="option-value">
                {s.autoAdvanceChallengeSeconds !== null && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={s.autoAdvanceChallengeSeconds}
                      onChange={(e) =>
                        set({
                          autoAdvanceChallengeSeconds: Math.min(
                            120,
                            Math.max(1, parseInt(e.target.value) || 10)
                          ),
                        })
                      }
                    />
                    <span>seconds</span>
                  </>
                )}
              </div>
            </div>

            <div className="option-row">
              <label htmlFor="opt-cards">Card target</label>
              <input
                id="opt-cards"
                type="checkbox"
                checked={s.maxCards !== null}
                onChange={(e) =>
                  set({ maxCards: e.target.checked ? 10 : null })
                }
              />
              <span />
              <div className="option-value">
                {s.maxCards !== null && (
                  <>
                    <input
                      type="number"
                      min={2}
                      max={999}
                      value={s.maxCards}
                      onChange={(e) =>
                        set({
                          maxCards: Math.min(
                            999,
                            Math.max(2, parseInt(e.target.value) || 10)
                          ),
                        })
                      }
                    />
                    <span>cards</span>
                  </>
                )}
              </div>
            </div>

            <button className="btn-primary" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
