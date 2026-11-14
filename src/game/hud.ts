import { M1911 } from '../core/weapon';

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

const HIT_MARKER_SECONDS = 0.14;

export function createHud() {
  const rounds = element('rounds');
  const targets = element('targets');
  const hitMarker = element('hit-marker');
  element('weapon-name').textContent = M1911.name;

  let hitTime = 0;
  // Only touch the page when a value changes; this runs every frame.
  let shownRounds = '';
  let shownTargets = '';

  return {
    hit() {
      hitTime = HIT_MARKER_SECONDS;
      hitMarker.hidden = false;
    },

    update(dt: number, state: { rounds: number; reloading: boolean; down: number; total: number }) {
      const roundsText = state.reloading ? 'Reloading' : `${state.rounds} / ${M1911.magazineSize}`;
      if (roundsText !== shownRounds) {
        shownRounds = roundsText;
        rounds.textContent = roundsText;
      }

      const targetsText =
        state.down === state.total ? 'All targets down' : `Targets ${state.down} / ${state.total}`;
      if (targetsText !== shownTargets) {
        shownTargets = targetsText;
        targets.textContent = targetsText;
      }

      if (hitTime > 0) {
        hitTime -= dt;
        if (hitTime <= 0) hitMarker.hidden = true;
      }
    },
  };
}
