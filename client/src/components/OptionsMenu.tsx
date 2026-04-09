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
              <div className="option-control">
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
              <div className="option-control">
                <input
                  id="opt-auto"
                  type="checkbox"
                  checked={s.autoAdvanceSeconds !== null}
                  onChange={(e) =>
                    set({ autoAdvanceSeconds: e.target.checked ? 5 : null })
                  }
                />
                {s.autoAdvanceSeconds !== null && (
                  <>
                    <span>after</span>
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
              <label htmlFor="opt-rounds">Round limit</label>
              <div className="option-control">
                <input
                  id="opt-rounds"
                  type="checkbox"
                  checked={s.maxRounds !== null}
                  onChange={(e) =>
                    set({ maxRounds: e.target.checked ? 10 : null })
                  }
                />
                {s.maxRounds !== null && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={s.maxRounds}
                      onChange={(e) =>
                        set({
                          maxRounds: Math.min(
                            999,
                            Math.max(1, parseInt(e.target.value) || 10)
                          ),
                        })
                      }
                    />
                    <span>rounds</span>
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
