import type { GameState } from '../../core/game';
import { activeWeaponSpec, runAccuracyPercent, TARGET } from '../../core/game';
import { PLAYER_TUNING } from '../../core/player';
import type { OpticId, ScopeOverlayKind, WeaponId, WeaponSlot } from '../../core/weapon';
import { getWeaponSpec, OPTICS } from '../../core/weapon';
import type { ScopeOverlayState } from '../view';
import { el, formatRunTime } from './dom';
import { createIcon, createWeaponSilhouette } from './icons';
import { createKeycap } from './keycaps';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HIT_DURATION = 0.2;
const KILL_DURATION = 0.23;
const FEED_LIFETIME = 3.2;
const FEED_MAX_ITEMS = 4;
const TICK_POP_SECONDS = 0.14;
const DRY_FIRE_SECONDS = 0.18;

const FIRE_MODE_SHORT: Record<string, string> = {
  auto: 'AUTO',
  semi: 'SEMI',
  pump: 'PUMP',
  bolt: 'BOLT',
};

export interface HudFrameInput {
  readonly state: GameState;
  readonly aimBlend: number;
  readonly scopeOverlay: ScopeOverlayState;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly showTacticalFeed: boolean;
}

interface FeedEntry {
  readonly element: HTMLElement;
  age: number;
  leaving: boolean;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * Multi-optic magnified scope overlay supporting three authentic real-world reticles:
 *  - `acog`   (Trijicon TA31 3.5×): glowing green tritium chevron apex + BDC drop stadia
 *  - `lpvo`   (Razor HD 2× / 5×): thin bezel, illuminated red-amber horseshoe + 0.5 MOA dot + windage
 *  - `sniper` (PM II 6× / 10× FFP): heavy duplex stadia + Mil-Dot holdover grid + center dot
 */
function buildScopeOverlay(): {
  root: HTMLElement;
  reticleSvg: SVGSVGElement;
  zoomTag: HTMLElement;
  zoomHint: HTMLElement;
  setStyle(style: ScopeOverlayKind): void;
} {
  const root = el('div', 'hud-scope');
  root.dataset.active = 'false';
  root.dataset.style = 'sniper';

  const reticleSvg = document.createElementNS(SVG_NS, 'svg');
  reticleSvg.setAttribute('viewBox', '0 0 1000 1000');
  reticleSvg.setAttribute('class', 'hud-scope__reticle');
  reticleSvg.setAttribute('aria-hidden', 'true');

  // --- 1. ACOG TA31 3.5× (Glowing Green Chevron + BDC Stadia Ladder) ---
  const acogGroup = svgEl('g', { class: 'hud-scope__group' });
  acogGroup.append(
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '454',
      fill: 'none',
      stroke: 'rgba(10, 14, 18, 0.96)',
      'stroke-width': '34',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '437',
      fill: 'none',
      stroke: 'rgba(120, 235, 160, 0.16)',
      'stroke-width': '2',
    }),
    // Outer black horizontal framing stadia bars.
    svgEl('path', {
      d: 'M 75 500 H 335 M 665 500 H 925 M 500 725 V 925',
      stroke: '#0a0e13',
      'stroke-width': '4.2',
    }),
    // Fine vertical BDC spine below the chevron apex (500, 500 is exact point of aim!).
    svgEl('path', {
      d: 'M 500 532 V 725 M 472 560 H 528 M 480 605 H 520 M 485 650 H 515 M 490 695 H 510',
      stroke: 'rgba(12, 16, 22, 0.92)',
      'stroke-width': '2.2',
    }),
    // Fine horizontal windage subtensions.
    svgEl('path', {
      d: 'M 385 492 V 508 M 425 494 V 506 M 575 494 V 506 M 615 492 V 508',
      stroke: 'rgba(12, 16, 22, 0.85)',
      'stroke-width': '2',
    }),
    // Iconic Trijicon glowing green tritium chevron (tip dead-centre at (500, 500)!).
    svgEl('path', {
      d: 'M 476 524 L 500 500 L 524 524',
      fill: 'none',
      stroke: '#4cff72',
      'stroke-width': '5.2',
      'stroke-linejoin': 'miter',
      'stroke-linecap': 'square',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '2.2',
      fill: '#d8ffe2',
    }),
  );

  // --- 2. Razor HD LPVO 2× / 5× (Ultra-thin Bezel + Illuminated Horseshoe & BDC) ---
  const lpvoGroup = svgEl('g', { class: 'hud-scope__group' });
  const lpvoTicks: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const off = i * 48;
    lpvoTicks.push(`M ${500 - off} 493 V 507 M ${500 + off} 493 V 507`);
    lpvoTicks.push(`M ${500 - (14 - i * 2)} ${500 + off} H ${500 + (14 - i * 2)}`);
  }
  lpvoGroup.append(
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '472',
      fill: 'none',
      stroke: 'rgba(10, 12, 16, 0.96)',
      'stroke-width': '16',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '463',
      fill: 'none',
      stroke: 'rgba(235, 185, 110, 0.16)',
      'stroke-width': '1.8',
    }),
    // Slim clean JM-1 / MRAD tactical crosshair.
    svgEl('path', {
      d: 'M 42 500 H 460 M 540 500 H 958 M 500 540 V 958 M 500 180 V 456',
      stroke: 'rgba(12, 16, 22, 0.88)',
      'stroke-width': '2.1',
    }),
    svgEl('path', {
      d: lpvoTicks.join(' '),
      stroke: 'rgba(14, 18, 24, 0.88)',
      'stroke-width': '2',
    }),
    // Illuminated amber-red CQB horseshoe ring (open bottom at 6 o'clock for BDC sightline).
    svgEl('path', {
      d: 'M 476 530 A 38 38 0 1 1 524 530',
      fill: 'none',
      stroke: '#ff4226',
      'stroke-width': '4.4',
      'stroke-linecap': 'round',
    }),
    // Crisp central illuminated micro-dot dead-centre at (500, 500).
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '3.6',
      fill: '#ff4226',
    }),
  );

  // --- 3. PM II Sniper Scope 6× / 10× FFP Mil-Dot ---
  const sniperGroup = svgEl('g', { class: 'hud-scope__group' });
  const sniperTicks: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const off = i * 44;
    const len = i % 2 === 0 ? 11 : 7;
    sniperTicks.push(`M ${500 - off} ${500 - len} V ${500 + len}`);
    sniperTicks.push(`M ${500 + off} ${500 - len} V ${500 + len}`);
    sniperTicks.push(`M ${500 - len} ${500 + off} H ${500 + len}`);
    if (i <= 3) sniperTicks.push(`M ${500 - len} ${500 - off} H ${500 + len}`);
  }
  sniperGroup.append(
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '468',
      fill: 'none',
      stroke: 'rgba(8, 11, 16, 0.94)',
      'stroke-width': '28',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '452',
      fill: 'none',
      stroke: 'rgba(180, 210, 232, 0.14)',
      'stroke-width': '2',
    }),
    svgEl('path', {
      d: 'M 48 500 H 255 M 745 500 H 952 M 500 745 V 952',
      stroke: '#0c0f14',
      'stroke-width': '6.5',
    }),
    svgEl('path', {
      d: 'M 255 500 H 484 M 516 500 H 745 M 500 140 V 484 M 500 516 V 745',
      stroke: 'rgba(12, 16, 22, 0.92)',
      'stroke-width': '1.8',
    }),
    svgEl('path', {
      d: sniperTicks.join(' '),
      stroke: 'rgba(14, 18, 24, 0.9)',
      'stroke-width': '2',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '4.2',
      fill: '#ff3a2c',
    }),
  );

  reticleSvg.append(acogGroup, lpvoGroup, sniperGroup);

  const zoomHud = el('div', 'hud-scope__readout');
  const zoomTag = el('span', 'hud-scope__zoom', '6.0× FFP');
  const zoomHint = el('span', 'hud-scope__hint');
  zoomHint.append(createKeycap('V'), el('span', undefined, 'ZOOM'));
  zoomHint.hidden = true;
  zoomHud.append(zoomTag, zoomHint);

  root.append(reticleSvg, zoomHud);

  let activeStyle: ScopeOverlayKind = 'none';
  function setStyle(style: ScopeOverlayKind) {
    if (style === activeStyle) return;
    activeStyle = style;
    root.dataset.style = style;
    acogGroup.style.display = style === 'acog' ? '' : 'none';
    lpvoGroup.style.display = style === 'lpvo' ? '' : 'none';
    sniperGroup.style.display = style === 'sniper' ? '' : 'none';
  }
  setStyle('sniper');

  return { root, reticleSvg, zoomTag, zoomHint, setStyle };
}

export function createHudView(container: HTMLElement, totalTargets: number) {
  const layer = el('div', 'hud-layer');
  layer.dataset.visible = 'true';

  // 0. Multi-Optic Magnified Scope Overlay (ACOG 3.5× / Razor LPVO 2–5× / PM II 6–10×)
  const scope = buildScopeOverlay();

  // 1. Top Objective Tracker (Targets Down, adaptive N-segment bar, live Run Timer)
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
  segmentBar.style.gridTemplateColumns = `repeat(${Math.max(1, totalTargets)}, 1fr)`;
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

  // 6. Bottom-Right Weapon & Ammo Cluster (Slot Switcher Strip + Dynamic Weapon Plate)
  const weaponCluster = el('div', 'hud-weapon-cluster');

  // Compact [1] Primary / [2] Secondary carry indicator strip
  const slotStrip = el('div', 'hud-slots');
  const makeSlotChip = (num: '1' | '2') => {
    const chip = el('div', 'hud-slot-chip');
    chip.dataset.active = 'false';
    const key = createKeycap(num);
    const name = el('span', 'hud-slot-chip__name', '');
    chip.append(key, name);
    return { chip, name };
  };
  const primaryChip = makeSlotChip('1');
  const secondaryChip = makeSlotChip('2');
  slotStrip.append(primaryChip.chip, secondaryChip.chip);

  const weaponPanel = el('section', 'hud-plate hud-weapon');
  weaponPanel.setAttribute('aria-label', 'Weapon and ammunition');
  weaponPanel.dataset.ammoState = 'normal';
  weaponPanel.dataset.reloading = 'false';

  const weaponMain = el('div', 'hud-weapon__main');
  const weaponCounts = el('div', 'hud-weapon__counts');
  const weaponNumerals = el('div', 'hud-weapon__numerals');
  const roundsCurrent = el('span', 'hud-weapon__rounds', '30');
  const roundsCapacity = el('span', 'hud-weapon__capacity', '/ 30');
  const statusTag = el('span', 'hud-weapon__status-tag');
  statusTag.hidden = true;
  weaponNumerals.append(roundsCurrent, roundsCapacity, statusTag);

  const pipsRow = el('div', 'hud-weapon__pips');
  let pips: HTMLElement[] = [];
  weaponCounts.append(weaponNumerals, pipsRow);

  const weaponDivider = el('div', 'hud-weapon__divider');
  const weaponProfile = el('div', 'hud-weapon__profile');
  const weaponSvgHost = el('div', 'hud-weapon__svg-host');
  const weaponMeta = el('div', 'hud-weapon__meta');
  const weaponMode = el('span', 'hud-weapon__mode', 'AUTO');
  const weaponCaliber = el('span', 'hud-weapon__caliber', '5.56×45mm');
  const weaponName = el('span', 'hud-weapon__name', 'HK416');
  weaponMeta.append(weaponMode, weaponCaliber, weaponName);
  weaponProfile.append(weaponSvgHost, weaponMeta);

  weaponMain.append(weaponCounts, weaponDivider, weaponProfile);

  const reloadWrap = el('div', 'hud-weapon__reload');
  reloadWrap.hidden = true;
  const reloadHeader = el('div', 'hud-weapon__reload-header');
  const reloadLabel = el('span', undefined, 'Reloading');
  const reloadTimeLeft = el('span', 'ui-tabular', '2.2s');
  reloadHeader.append(reloadLabel, reloadTimeLeft);
  const reloadTrack = el('div', 'hud-weapon__reload-track');
  const reloadFill = el('div', 'hud-weapon__reload-fill');
  reloadTrack.append(reloadFill);
  reloadWrap.append(reloadHeader, reloadTrack);

  weaponPanel.append(weaponMain, reloadWrap);
  weaponCluster.append(slotStrip, weaponPanel);

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
    scope.root,
    objective,
    crosshair,
    hitMarker,
    reloadPrompt,
    stanceWrap,
    weaponCluster,
    feedWrap,
    banner,
  );
  container.append(layer);

  // Cached state to avoid unnecessary DOM writes in the 60+ Hz frame loop
  let shownVisible = true;
  let shownWeaponId: WeaponId | null = null;
  let shownOpticId: OpticId | null = null;
  let shownSlotKey = '';
  let shownActiveSlot: WeaponSlot | null = null;
  let shownScopeActive = false;
  let shownScopeOpacity = '';
  let shownScopeCant = '';
  let shownScopeZoom = '';
  let shownScopeVariable = false;
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
  let shownFeedVisible = true;
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

  function syncWeaponPresentation(weaponId: WeaponId, opticId: OpticId) {
    const spec = getWeaponSpec(weaponId);
    const optic = OPTICS[opticId];
    shownWeaponId = weaponId;
    shownOpticId = opticId;
    shownRounds = -1; // Force pip & counter refresh for new magazine size.

    weaponSvgHost.replaceChildren(createWeaponSilhouette(weaponId, 'hud-weapon-svg'));
    weaponName.textContent = spec.name;
    weaponCaliber.textContent = `${spec.caliber} · ${optic.shortName}`;
    weaponMode.textContent = FIRE_MODE_SHORT[spec.fireMode] ?? spec.fireMode.toUpperCase();
    roundsCapacity.textContent = `/ ${spec.magazineSize}`;

    // Compact pip styling for 20-30 round rifle/SMG magazines so pips never wrap awkwardly.
    pipsRow.dataset.density = spec.magazineSize > 12 ? 'compact' : 'standard';
    pipsRow.replaceChildren();
    pips = Array.from({ length: spec.magazineSize }, () => {
      const pip = el('span', 'hud-pip');
      pip.dataset.filled = 'true';
      pipsRow.append(pip);
      return pip;
    });
  }

  function pushFeed(distanceMetres: number, downCount: number) {
    const row = el('div', 'hud-feed__item');
    row.dataset.entering = 'true';
    const label = el('span', 'hud-feed__label', `Target ${downCount}/${totalTargets}`);
    const dist = el('span', 'hud-feed__distance', `${distanceMetres.toFixed(1)} m`);
    row.append(createIcon('target'), label, dist);
    feedWrap.prepend(row);
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
      const { state, aimBlend, scopeOverlay, visible, reducedMotion, showTacticalFeed } = input;
      const spec = activeWeaponSpec(state);

      if (visible !== shownVisible) {
        shownVisible = visible;
        layer.dataset.visible = visible ? 'true' : 'false';
      }

      if (showTacticalFeed !== shownFeedVisible) {
        shownFeedVisible = showTacticalFeed;
        feedWrap.hidden = !showTacticalFeed;
        stanceWrap.hidden = !showTacticalFeed;
      }

      // Multi-optic scope overlay (`acog` 3.5× / `lpvo` 2–5× / `sniper` 6–10×), fully memoized!
      const showScope = scopeOverlay.active && visible && scopeOverlay.style !== 'none';
      if (showScope) {
        scope.setStyle(scopeOverlay.style);
        if (!shownScopeActive) {
          shownScopeActive = true;
          scope.root.dataset.active = 'true';
        }
        const opStr = scopeOverlay.opacity.toFixed(2);
        if (opStr !== shownScopeOpacity) {
          shownScopeOpacity = opStr;
          scope.root.style.opacity = opStr;
        }
        const degStr = ((scopeOverlay.cantRad * 180) / Math.PI).toFixed(1);
        if (degStr !== shownScopeCant) {
          shownScopeCant = degStr;
          scope.reticleSvg.style.transform = `translate(-50%, -50%) rotate(${degStr}deg)`;
        }
        const zoomText = `${scopeOverlay.zoom.toFixed(1)}× · ${scopeOverlay.opticName}`;
        if (zoomText !== shownScopeZoom) {
          shownScopeZoom = zoomText;
          scope.zoomTag.textContent = zoomText;
        }
        if (scopeOverlay.variableZoom !== shownScopeVariable) {
          shownScopeVariable = scopeOverlay.variableZoom;
          scope.zoomHint.hidden = !scopeOverlay.variableZoom;
        }
      } else if (shownScopeActive) {
        shownScopeActive = false;
        shownScopeOpacity = '0';
        scope.root.dataset.active = 'false';
        scope.root.style.opacity = '0';
      }

      // Sync weapon silhouette, name, calibre + mounted optic tag, and adaptive pips when changed.
      if (state.weapon.weaponId !== shownWeaponId || spec.opticId !== shownOpticId) {
        syncWeaponPresentation(state.weapon.weaponId, spec.opticId);
      }

      // Sync Primary [1] / Secondary [2] quick-slot strip.
      const slotKey = `${state.weapon.loadout.primary}|${state.weapon.loadout.secondary}`;
      if (slotKey !== shownSlotKey) {
        shownSlotKey = slotKey;
        primaryChip.name.textContent = getWeaponSpec(state.weapon.loadout.primary).name;
        secondaryChip.name.textContent = getWeaponSpec(state.weapon.loadout.secondary).name;
      }
      if (state.weapon.activeSlot !== shownActiveSlot) {
        shownActiveSlot = state.weapon.activeSlot;
        primaryChip.chip.dataset.active = state.weapon.activeSlot === 'primary' ? 'true' : 'false';
        secondaryChip.chip.dataset.active =
          state.weapon.activeSlot === 'secondary' ? 'true' : 'false';
      }

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

      // Dynamic crosshair spread & ADS fade (widens slightly for shotgun buckshot!)
      const bannerOpen = cleared && state.resetIn > 0;
      const planarSpeed = Math.hypot(state.player.velocity.x, state.player.velocity.z);
      const moveFactor = Math.min(1.5, planarSpeed / PLAYER_TUNING.walkSpeed);
      const airPenalty = state.player.grounded ? 0 : 8.5;
      const recoilPenalty = Math.min(10, state.weapon.recoil * 95);
      const shotgunGap = spec.pellets > 1 ? 8.5 : 0;
      shotKick = Math.max(0, shotKick - dt * 34);
      const targetGap = reducedMotion
        ? 5 + shotgunGap
        : 4.5 + shotgunGap + moveFactor * 6.5 + airPenalty + recoilPenalty + shotKick;
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

      const crosshairOpacity =
        bannerOpen || scopeOverlay.active ? 0 : Math.max(0, Math.min(1, 1 - aimBlend * 1.25));
      const roundedOpacity = Math.round(crosshairOpacity * 100) / 100;
      if (roundedOpacity !== lastCrosshairOpacity) {
        lastCrosshairOpacity = roundedOpacity;
        crosshair.style.opacity = String(roundedOpacity);
      }

      // Weapon & Ammo panel
      const rounds = state.weapon.rounds;
      const reloading = state.weapon.reloadRemaining > 0;
      const lowLimit = Math.max(1, Math.min(8, Math.ceil(spec.magazineSize * 0.25)));

      if (rounds !== shownRounds) {
        shownRounds = rounds;
        roundsCurrent.textContent = String(rounds);
        for (let i = 0; i < pips.length; i++) {
          const pip = pips[i];
          if (pip) pip.dataset.filled = i < rounds ? 'true' : 'false';
        }
      }

      const ammoState = rounds === 0 ? 'empty' : rounds <= lowLimit ? 'low' : 'normal';
      if (ammoState !== shownAmmoState) {
        shownAmmoState = ammoState;
        weaponPanel.dataset.ammoState = ammoState;
      }

      const statusTone = reloading
        ? 'reload'
        : rounds === 0
          ? 'empty'
          : rounds <= lowLimit
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
          for (let i = 0; i < pips.length; i++) {
            const pip = pips[i];
            if (pip) pip.dataset.filled = i < rounds ? 'true' : 'false';
          }
        }
      }

      if (reloading) {
        const progress = Math.max(
          0,
          Math.min(1, 1 - state.weapon.reloadRemaining / spec.reloadTime),
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
        reloading || cleared
          ? 'hidden'
          : rounds === 0
            ? 'empty'
            : rounds <= lowLimit
              ? 'low'
              : 'hidden';
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
