import type { GameState } from '../../core/game';
import { runAccuracyPercent, TARGET, WEAPON } from '../../core/game';
import { PLAYER_TUNING } from '../../core/player';
import { el, formatRunTime } from './dom';
import { createIcon, createM1911Silhouette } from './icons';
import { createKeycap } from './keycaps';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HIT_DURATION = 0.2;
const KILL_DURATION = 0.23;
const FEED_LIFETIME = 3.2;
const FEED_MAX_ITEMS = 4;
const TICK_POP_SECONDS = 0.14;
const DRY_FIRE_SECONDS = 0.18;

export interface HudFrameInput {
  readonly state: GameState;
  readonly aimBlend: number;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
}

interface FeedEntry {
  readonly element: HTMLElement;
  age: number;
  leaving: boolean;
}

export function createHudView(container: HTMLElement, totalTargets: number) {
  const layer = el('div', 'hud-layer');
  layer.dataset.visible = 'true';

  // 1. Top Objective Tracker (Targets Down, 10-segment bar, live Run Timer)
  const objective = el('section', 'hud-plate hud-objective');
  objective.setAttribute('aria-label', 'Course progress');
  const objectiveTop = el('div', 'hud-objective__top');

  const targetGroup = el('div', 'hud-objective__group');
  const targetLabel = el('span', 'hud-objective__label', 'Targets');
  const targetCountWrap = el('span', 'hud-objective__count');
  const targetDownNum = el('span', undefined, '0');
  const targetSep = el('span', 'hud-objective__count-sep', ' / ');
  const targetTotalNum = el('span', 'hud-objective__count-total', String(totalTargets));
  targetCountWrap.append(targetDownNum, targetSep, targetTotalNum);
  targetGroup.append(targetLabel, targetCountWrap);

  const timerGroup = el('div', 'hud-objective__group');
  const timerLabel = el('span', 'hud-objective__label', 'Time');
  const timerValue = el('span', 'hud-objective__timer', '00:00.00');
  timerGroup.append(timerLabel, timerValue);

  objectiveTop.append(targetGroup, timerGroup);

  const segmentBar = el('div', 'hud-objective__segments');
  const segments = Array.from({ length: totalTargets }, () => {
    const seg = el('span', 'hud-segment');
    seg.dataset.down = 'false';
    segmentBar.append(seg);
    return seg;
  });
  objective.append(objectiveTop, segmentBar);

  // 2. Dynamic Crosshair (center dot + 4 dynamic arms)
  const crosshair = el('div', 'hud-crosshair');
  const crosshairDot = el('span', 'hud-crosshair__dot');
  const armTop = el('span', 'hud-crosshair__arm hud-crosshair__arm--top');
  const armBottom = el('span', 'hud-crosshair__arm hud-crosshair__arm--bottom');
  const armLeft = el('span', 'hud-crosshair__arm hud-crosshair__arm--left');
  const armRight = el('span', 'hud-crosshair__arm hud-crosshair__arm--right');
  crosshair.append(crosshairDot, armTop, armBottom, armLeft, armRight);

  // 3. Sharp Hit / Target-Down Marker (<230ms)
  const hitMarker = document.createElementNS(SVG_NS, 'svg');
  hitMarker.setAttribute('viewBox', '0 0 34 34');
  hitMarker.setAttribute('class', 'hud-hit-marker');
  hitMarker.setAttribute('aria-hidden', 'true');
  const hitBase = document.createElementNS(SVG_NS, 'path');
  hitBase.setAttribute('d', 'M6 6L12.5 12.5M28 6L21.5 12.5M6 28L12.5 21.5M28 28L21.5 21.5');
  hitBase.setAttribute('class', 'hud-hit-marker__base');
  const hitKill = document.createElementNS(SVG_NS, 'path');
  hitKill.setAttribute('d', 'M3.5 3.5L8 8M30.5 3.5L26 8M3.5 30.5L8 26M30.5 30.5L26 26');
  hitKill.setAttribute('class', 'hud-hit-marker__kill');
  hitMarker.append(hitBase, hitKill);

  // 4. Contextual Reload Prompt ([R] Reload)
  const reloadPrompt = el('div', 'hud-reload-prompt');
  reloadPrompt.dataset.state = 'hidden';
  const reloadPromptKey = createKeycap('R');
  const reloadPromptText = el('span', 'hud-reload-prompt__text', 'Reload');
  reloadPrompt.append(reloadPromptKey, reloadPromptText);

  // 5. Quiet Stance Indicators (Lean Left, Lean Right, Sprint)
  const stanceWrap = el('div', 'hud-stance');
  const leanLeftPill = el('div', 'hud-stance__pill');
  leanLeftPill.append(createIcon('leanLeft'), el('span', undefined, 'Lean L'));
  const leanRightPill = el('div', 'hud-stance__pill');
  leanRightPill.append(createIcon('leanRight'), el('span', undefined, 'Lean R'));
  const sprintPill = el('div', 'hud-stance__pill');
  sprintPill.append(createIcon('sprint'), el('span', undefined, 'Sprint'));
  stanceWrap.append(leanLeftPill, leanRightPill, sprintPill);

  // 6. Bottom-Right Weapon & Ammo Panel
  const weaponPanel = el('section', 'hud-plate hud-weapon');
  weaponPanel.setAttribute('aria-label', 'Weapon and ammunition');
  weaponPanel.dataset.ammoState = 'normal';
  weaponPanel.dataset.reloading = 'false';

  const weaponMain = el('div', 'hud-weapon__main');
  const weaponCounts = el('div', 'hud-weapon__counts');
  const weaponNumerals = el('div', 'hud-weapon__numerals');
  const roundsCurrent = el('span', 'hud-weapon__rounds', String(WEAPON.magazineSize));
  const roundsCapacity = el('span', 'hud-weapon__capacity', `/ ${WEAPON.magazineSize}`);
  const statusTag = el('span', 'hud-weapon__status-tag');
  statusTag.hidden = true;
  weaponNumerals.append(roundsCurrent, roundsCapacity, statusTag);

  const pipsRow = el('div', 'hud-weapon__pips');
  const pips = Array.from({ length: WEAPON.magazineSize }, () => {
    const pip = el('span', 'hud-pip');
    pip.dataset.filled = 'true';
    pipsRow.append(pip);
    return pip;
  });
  weaponCounts.append(weaponNumerals, pipsRow);

  const weaponDivider = el('div', 'hud-weapon__divider');
  const weaponProfile = el('div', 'hud-weapon__profile');
  const weaponSvg = createM1911Silhouette();
  const weaponMeta = el('div', 'hud-weapon__meta');
  const weaponCaliber = el('span', 'hud-weapon__caliber', '.45 ACP');
  const weaponName = el('span', 'hud-weapon__name', WEAPON.name);
  weaponMeta.append(weaponCaliber, weaponName);
  weaponProfile.append(weaponSvg, weaponMeta);

  weaponMain.append(weaponCounts, weaponDivider, weaponProfile);

  const reloadWrap = el('div', 'hud-weapon__reload');
  reloadWrap.hidden = true;
  const reloadHeader = el('div', 'hud-weapon__reload-header');
  const reloadLabel = el('span', undefined, 'Reloading');
  const reloadTimeLeft = el('span', 'ui-tabular', '2.1s');
  reloadHeader.append(reloadLabel, reloadTimeLeft);
  const reloadTrack = el('div', 'hud-weapon__reload-track');
  const reloadFill = el('div', 'hud-weapon__reload-fill');
  reloadTrack.append(reloadFill);
  reloadWrap.append(reloadHeader, reloadTrack);

  weaponPanel.append(weaponMain, reloadWrap);

  // 7. Stacked Event Feed (Target Down + Distance)
  const feedWrap = el('div', 'hud-feed');

  // 8. Run Complete Sweep Banner
  const banner = el('section', 'hud-banner');
  banner.dataset.open = 'false';
  const ruleTop = el('div', 'hud-banner__rule hud-banner__rule--top');
  const ruleBottom = el('div', 'hud-banner__rule hud-banner__rule--bottom');
  const bannerEyebrow = el('div', 'hud-banner__eyebrow', 'Shoot House · All Targets Down');
  const bannerTitle = el('h2', 'hud-banner__title', 'Course Cleared');

  const bannerStats = el('div', 'hud-banner__stats');
  const statTimeVal = el('span', 'hud-banner__stat-value', '00:00.00');
  const statShotsVal = el('span', 'hud-banner__stat-value', '0');
  const statAccVal = el('span', 'hud-banner__stat-value', '0%');
  for (const [label, valueEl] of [
    ['Clear Time', statTimeVal],
    ['Shots Fired', statShotsVal],
    ['Accuracy', statAccVal],
  ] as const) {
    const cell = el('div', 'hud-banner__stat');
    cell.append(el('span', 'hud-banner__stat-label', label), valueEl);
    bannerStats.append(cell);
  }

  const bannerReset = el('div', 'hud-banner__reset');
  const bannerResetRow = el('div', 'hud-banner__reset-row');
  const bannerResetLabel = el('span', undefined, 'Targets Resetting');
  const bannerResetValue = el('span', undefined, '3.0s');
  bannerResetRow.append(bannerResetLabel, bannerResetValue);
  const bannerResetTrack = el('div', 'hud-banner__reset-track');
  const bannerResetFill = el('div', 'hud-banner__reset-fill');
  bannerResetTrack.append(bannerResetFill);
  bannerReset.append(bannerResetRow, bannerResetTrack);

  banner.append(ruleTop, bannerEyebrow, bannerTitle, bannerStats, bannerReset, ruleBottom);

  layer.append(
    objective,
    crosshair,
    hitMarker,
    reloadPrompt,
    stanceWrap,
    weaponPanel,
    feedWrap,
    banner,
  );
  container.append(layer);

  // Cached state to avoid unnecessary DOM writes in the 60+ Hz frame loop
  let shownVisible = true;
  let shownDown = -1;
  let shownCleared = false;
  let shownTimer = '';
  let shownTimerActive = false;
  let shownRounds = -1;
  let shownAmmoState = 'normal';
  let shownStatusTone = 'none';
  let shownReloading = false;
  let shownReloadSec = '';
  let shownPromptState = 'hidden';
  let shownLeanL = false;
  let shownLeanR = false;
  let shownSprint = false;
  let shownBannerOpen = false;
  let shownBannerStatsKey = '';
  let shownResetText = '';
  let lastGapPx = -1;
  let lastCrosshairOpacity = -1;

  let spreadGap = 5;
  let shotKick = 0;
  let hitTimer = 0;
  let hitDuration = HIT_DURATION;
  let tickPopTimer = 0;
  let dryFireTimer = 0;
  const feedItems: FeedEntry[] = [];

  function pushFeed(distanceMetres: number, downCount: number) {
    const row = el('div', 'hud-feed__item');
    row.dataset.entering = 'true';
    const label = el('span', 'hud-feed__label', `Target ${downCount}/${totalTargets}`);
    const dist = el('span', 'hud-feed__distance', `${distanceMetres.toFixed(1)} m`);
    row.append(createIcon('target'), label, dist);
    feedWrap.prepend(row);
    // Trigger slide-in on the next frame without forcing layout synchronous reflow.
    requestAnimationFrame(() => {
      row.dataset.entering = 'false';
    });

    feedItems.unshift({ element: row, age: 0, leaving: false });
    while (feedItems.length > FEED_MAX_ITEMS) {
      const oldest = feedItems.pop();
      oldest?.element.remove();
    }
  }

  return {
    onShot(hitWorldSurface = false) {
      shotKick = Math.min(14, shotKick + 6.5);
      tickPopTimer = TICK_POP_SECONDS;
      roundsCurrent.dataset.tick = 'true';
      if (hitWorldSurface && hitTimer <= 0) {
        hitDuration = HIT_DURATION;
        hitTimer = HIT_DURATION;
        hitMarker.dataset.kind = 'hit';
      }
    },

    onTargetDown(distanceMetres: number, downCount: number) {
      hitDuration = KILL_DURATION;
      hitTimer = KILL_DURATION;
      hitMarker.dataset.kind = 'kill';
      pushFeed(distanceMetres, downCount);
    },

    onDryFire() {
      dryFireTimer = DRY_FIRE_SECONDS;
      weaponPanel.dataset.dryFire = 'true';
    },

    clearFeed() {
      hitTimer = 0;
      hitMarker.style.opacity = '0';
      while (feedItems.length > 0) {
        feedItems.pop()?.element.remove();
      }
    },

    update(dt: number, input: HudFrameInput) {
      const { state, aimBlend, visible, reducedMotion } = input;

      if (visible !== shownVisible) {
        shownVisible = visible;
        layer.dataset.visible = visible ? 'true' : 'false';
      }

      // Advance transient timers even if fading
      if (tickPopTimer > 0) {
        tickPopTimer = Math.max(0, tickPopTimer - dt);
        if (tickPopTimer === 0) delete roundsCurrent.dataset.tick;
      }

      if (dryFireTimer > 0) {
        dryFireTimer = Math.max(0, dryFireTimer - dt);
        if (dryFireTimer === 0) delete weaponPanel.dataset.dryFire;
      }

      // Hit marker snap + fade
      if (hitTimer > 0) {
        hitTimer = Math.max(0, hitTimer - dt);
        const progress = 1 - hitTimer / hitDuration;
        const opacity = progress < 0.25 ? 1 : Math.max(0, 1 - (progress - 0.25) / 0.75);
        const scale = reducedMotion
          ? 1
          : progress < 0.22
            ? 0.82 + (progress / 0.22) * 0.28
            : 1.1 - ((progress - 0.22) / 0.78) * 0.12;
        hitMarker.style.opacity = opacity.toFixed(3);
        hitMarker.style.transform = `scale(${scale.toFixed(3)})`;
      } else if (hitMarker.style.opacity !== '0') {
        hitMarker.style.opacity = '0';
      }

      // Event feed lifetimes
      for (let i = feedItems.length - 1; i >= 0; i--) {
        const entry = feedItems[i];
        if (!entry) continue;
        entry.age += dt;
        if (!entry.leaving && entry.age >= FEED_LIFETIME - 0.26) {
          entry.leaving = true;
          entry.element.dataset.leaving = 'true';
        }
        if (entry.age >= FEED_LIFETIME) {
          entry.element.remove();
          feedItems.splice(i, 1);
        }
      }

      // Objective tracker & segments
      let downCount = 0;
      for (let i = 0; i < state.targetsDown.length; i++) {
        const isDown = Boolean(state.targetsDown[i]);
        if (isDown) downCount++;
        const seg = segments[i];
        if (seg) {
          const wanted = isDown ? 'true' : 'false';
          if (seg.dataset.down !== wanted) seg.dataset.down = wanted;
        }
      }
      if (downCount !== shownDown) {
        shownDown = downCount;
        targetDownNum.textContent = String(downCount);
      }
      const cleared = downCount === totalTargets && totalTargets > 0;
      if (cleared !== shownCleared) {
        shownCleared = cleared;
        objective.dataset.cleared = cleared ? 'true' : 'false';
      }

      const timerText = formatRunTime(state.run.elapsed);
      if (timerText !== shownTimer) {
        shownTimer = timerText;
        timerValue.textContent = timerText;
      }
      if (state.run.active !== shownTimerActive) {
        shownTimerActive = state.run.active;
        timerValue.dataset.active = state.run.active ? 'true' : 'false';
      }

      // Dynamic crosshair spread & ADS fade (also hides cleanly during Course Cleared banner)
      const bannerOpen = cleared && state.resetIn > 0;
      const planarSpeed = Math.hypot(state.player.velocity.x, state.player.velocity.z);
      const moveFactor = Math.min(1.5, planarSpeed / PLAYER_TUNING.walkSpeed);
      const airPenalty = state.player.grounded ? 0 : 8.5;
      const recoilPenalty = Math.min(10, state.weapon.recoil * 95);
      shotKick = Math.max(0, shotKick - dt * 34);
      const targetGap = reducedMotion
        ? 5
        : 4.5 + moveFactor * 6.5 + airPenalty + recoilPenalty + shotKick;
      const blend = 1 - Math.exp(-18 * Math.max(dt, 0.001));
      spreadGap += (targetGap - spreadGap) * blend;

      const roundedGap = Math.round(spreadGap * 2) / 2;
      if (roundedGap !== lastGapPx) {
        lastGapPx = roundedGap;
        armTop.style.transform = `translate3d(0, ${-roundedGap}px, 0)`;
        armBottom.style.transform = `translate3d(0, ${roundedGap}px, 0)`;
        armLeft.style.transform = `translate3d(${-roundedGap}px, 0, 0)`;
        armRight.style.transform = `translate3d(${roundedGap}px, 0, 0)`;
      }

      const crosshairOpacity = bannerOpen ? 0 : Math.max(0, Math.min(1, 1 - aimBlend * 1.25));
      const roundedOpacity = Math.round(crosshairOpacity * 100) / 100;
      if (roundedOpacity !== lastCrosshairOpacity) {
        lastCrosshairOpacity = roundedOpacity;
        crosshair.style.opacity = String(roundedOpacity);
      }

      // Weapon & Ammo panel
      const rounds = state.weapon.rounds;
      const reloading = state.weapon.reloadRemaining > 0;

      if (rounds !== shownRounds) {
        shownRounds = rounds;
        roundsCurrent.textContent = String(rounds);
        for (let i = 0; i < pips.length; i++) {
          const pip = pips[i];
          if (pip) pip.dataset.filled = i < rounds ? 'true' : 'false';
        }
      }

      const ammoState = rounds === 0 ? 'empty' : rounds <= 2 ? 'low' : 'normal';
      if (ammoState !== shownAmmoState) {
        shownAmmoState = ammoState;
        weaponPanel.dataset.ammoState = ammoState;
      }

      const statusTone = reloading
        ? 'reload'
        : rounds === 0
          ? 'empty'
          : rounds <= 2
            ? 'low'
            : 'none';
      if (statusTone !== shownStatusTone) {
        shownStatusTone = statusTone;
        if (statusTone === 'none') {
          statusTag.hidden = true;
        } else {
          statusTag.hidden = false;
          statusTag.dataset.tone = statusTone;
          statusTag.textContent =
            statusTone === 'reload' ? 'RLD' : statusTone === 'empty' ? 'Empty' : 'Low';
        }
      }

      if (reloading !== shownReloading) {
        shownReloading = reloading;
        weaponPanel.dataset.reloading = reloading ? 'true' : 'false';
        reloadWrap.hidden = !reloading;
        if (!reloading) {
          // Snap pips cleanly back to current full count on reload completion
          for (let i = 0; i < pips.length; i++) {
            const pip = pips[i];
            if (pip) pip.dataset.filled = i < rounds ? 'true' : 'false';
          }
        }
      }

      if (reloading) {
        const progress = Math.max(
          0,
          Math.min(1, 1 - state.weapon.reloadRemaining / WEAPON.reloadTime),
        );
        reloadFill.style.transform = `scaleX(${progress.toFixed(3)})`;
        const secText = `${Math.max(0, state.weapon.reloadRemaining).toFixed(1)}s`;
        if (secText !== shownReloadSec) {
          shownReloadSec = secText;
          reloadTimeLeft.textContent = secText;
        }
      }

      // Contextual Reload Prompt
      const promptState =
        reloading || cleared ? 'hidden' : rounds === 0 ? 'empty' : rounds <= 2 ? 'low' : 'hidden';
      if (promptState !== shownPromptState) {
        shownPromptState = promptState;
        reloadPrompt.dataset.state = promptState;
        reloadPromptText.textContent = promptState === 'empty' ? 'Reload · Empty' : 'Reload';
      }

      // Stance Indicators
      const leanNorm = state.player.lean / PLAYER_TUNING.leanDistance;
      const leanL = leanNorm < -0.14;
      const leanR = leanNorm > 0.14;
      const sprinting = state.player.grounded && planarSpeed > PLAYER_TUNING.walkSpeed * 1.12;

      if (leanL !== shownLeanL) {
        shownLeanL = leanL;
        leanLeftPill.dataset.active = leanL ? 'true' : 'false';
      }
      if (leanR !== shownLeanR) {
        shownLeanR = leanR;
        leanRightPill.dataset.active = leanR ? 'true' : 'false';
      }
      if (sprinting !== shownSprint) {
        shownSprint = sprinting;
        sprintPill.dataset.active = sprinting ? 'true' : 'false';
      }

      // Run Complete Sweep Banner
      if (bannerOpen !== shownBannerOpen) {
        shownBannerOpen = bannerOpen;
        banner.dataset.open = bannerOpen ? 'true' : 'false';
      }

      if (bannerOpen) {
        const accuracy = runAccuracyPercent(state.run);
        const statsKey = `${timerText}|${state.run.shotsFired}|${accuracy}`;
        if (statsKey !== shownBannerStatsKey) {
          shownBannerStatsKey = statsKey;
          statTimeVal.textContent = timerText;
          statShotsVal.textContent = String(state.run.shotsFired);
          statAccVal.textContent = `${accuracy}%`;
        }
        const resetFrac = Math.max(0, Math.min(1, state.resetIn / TARGET.resetDelay));
        bannerResetFill.style.transform = `scaleX(${resetFrac.toFixed(3)})`;
        const resetText = `${state.resetIn.toFixed(1)}s`;
        if (resetText !== shownResetText) {
          shownResetText = resetText;
          bannerResetValue.textContent = resetText;
        }
      }
    },
  };
}
