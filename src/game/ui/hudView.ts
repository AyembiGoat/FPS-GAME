import { BOOST_TUNING, CONSUMABLE_ORDER, CONSUMABLES } from '../../core/consumables';
import type { ConsumableId } from '../../core/consumables';
import { ARMOUR_TUNING } from '../../core/damage';
import type { GameState } from '../../core/game';
import { activeWeaponSpec, runAccuracyPercent, TARGET } from '../../core/game';
import { getMapById } from '../../core/maps';
import { getGameModeSpec, GUN_GAME_LADDER } from '../../core/modes';
import { PLAYER_TUNING } from '../../core/player';
import type { OpticId, ScopeOverlayKind, WeaponId, WeaponSlot } from '../../core/weapon';
import { getWeaponSpec, OPTICS } from '../../core/weapon';
import type { ScopeOverlayState } from '../view';
import { el, formatRunTime } from './dom';
import { createIcon, createWeaponSilhouette } from './icons';
import { createKeycap } from './keycaps';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HIT_DURATION = 0.2;
const KILL_DURATION = 0.24;
const FEED_LIFETIME = 3.2;
const FEED_MAX_ITEMS = 4;
const TICK_POP_SECONDS = 0.14;
const DRY_FIRE_SECONDS = 0.18;
const DIR_ARC_SECONDS = 0.72;

/** Keys printed on the item tray; they match `CONSUMABLE_KEYS` in `input.ts`. */
const CONSUMABLE_KEY_LABEL: Readonly<Record<ConsumableId, string>> = {
  'med-kit': '7',
  'first-aid': '8',
  bandage: '9',
  'energy-drink': '0',
  painkiller: '-',
};
const ARMOUR_LEVEL_LABEL = ['—', 'L1', 'L2', 'L3'] as const;

const FIRE_MODE_SHORT: Record<string, string> = {
  auto: 'AUTO',
  burst: 'BURST',
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

export interface HudActions {
  readonly onRestartRun: () => void;
  readonly onQuitToTitle: () => void;
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

  // --- 1. ACOG TA31 3.5× ---
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
    svgEl('path', {
      d: 'M 75 500 H 335 M 665 500 H 925 M 500 725 V 925',
      stroke: '#0a0e13',
      'stroke-width': '4.2',
    }),
    svgEl('path', {
      d: 'M 500 532 V 725 M 472 560 H 528 M 480 605 H 520 M 485 650 H 515 M 490 695 H 510',
      stroke: 'rgba(12, 16, 22, 0.92)',
      'stroke-width': '2.2',
    }),
    svgEl('path', {
      d: 'M 385 492 V 508 M 425 494 V 506 M 575 494 V 506 M 615 492 V 508',
      stroke: 'rgba(12, 16, 22, 0.85)',
      'stroke-width': '2',
    }),
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

  // --- 2. Razor HD LPVO 2× / 5× ---
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
    svgEl('path', {
      d: 'M 476 530 A 38 38 0 1 1 524 530',
      fill: 'none',
      stroke: '#ff4226',
      'stroke-width': '4.4',
      'stroke-linecap': 'round',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '3.6',
      fill: '#ff4226',
    }),
  );

  // --- 3. PM II Sniper Scope 6× / 10× FFP ---
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

  // --- 4. PSO-1 4× ---
  // Centre chevron with three hold-over chevrons below it, a windage scale ticked every
  // mil out to ten, and the stadiametric rangefinder curve in the lower left quadrant.
  const psoGroup = svgEl('g', { class: 'hud-scope__group' });
  const psoMil = 17;
  const psoTicks: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const len = i % 5 === 0 ? 13 : 7;
    psoTicks.push(`M ${500 - i * psoMil} ${500 - len} V 500`);
    psoTicks.push(`M ${500 + i * psoMil} ${500 - len} V 500`);
  }
  const psoChevrons = [44, 88, 132]
    .map((drop) => `M 490 ${500 + drop + 11} L 500 ${500 + drop} L 510 ${500 + drop + 11}`)
    .join(' ');
  psoGroup.append(
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '462',
      fill: 'none',
      stroke: 'rgba(9, 12, 14, 0.96)',
      'stroke-width': '30',
    }),
    svgEl('circle', {
      cx: '500',
      cy: '500',
      r: '446',
      fill: 'none',
      stroke: 'rgba(214, 196, 132, 0.15)',
      'stroke-width': '2',
    }),
    svgEl('path', {
      d: `M ${500 - 10 * psoMil} 500 H 486 M 514 500 H ${500 + 10 * psoMil}`,
      stroke: 'rgba(12, 16, 22, 0.92)',
      'stroke-width': '1.9',
    }),
    svgEl('path', {
      d: psoTicks.join(' '),
      stroke: 'rgba(12, 16, 22, 0.9)',
      'stroke-width': '2.4',
    }),
    svgEl('path', {
      d: `M 488 513 L 500 500 L 512 513 ${psoChevrons}`,
      fill: 'none',
      stroke: 'rgba(10, 14, 18, 0.95)',
      'stroke-width': '3.4',
      'stroke-linejoin': 'miter',
    }),
    svgEl('path', {
      // Rangefinder: a flat base line and the curve a 1.7 m figure is fitted under.
      d: 'M 300 660 H 452 M 300 598 C 340 632, 400 648, 452 652',
      fill: 'none',
      stroke: 'rgba(12, 16, 22, 0.88)',
      'stroke-width': '1.9',
    }),
    svgEl('path', {
      d: 'M 300 660 V 667 M 338 660 V 667 M 376 660 V 667 M 414 660 V 667 M 452 660 V 667',
      stroke: 'rgba(12, 16, 22, 0.88)',
      'stroke-width': '1.9',
    }),
  );
  for (const [x, label] of [
    [300, '2'],
    [338, '4'],
    [376, '6'],
    [414, '8'],
    [452, '10'],
  ] as const) {
    const text = svgEl('text', {
      x: String(x),
      y: '686',
      'text-anchor': 'middle',
      'font-size': '15',
      'font-family': 'sans-serif',
      fill: 'rgba(12, 16, 22, 0.88)',
    });
    text.textContent = label;
    psoGroup.append(text);
  }
  for (const side of [-1, 1]) {
    const text = svgEl('text', {
      x: String(500 + side * 10 * psoMil),
      y: '478',
      'text-anchor': 'middle',
      'font-size': '15',
      'font-family': 'sans-serif',
      fill: 'rgba(12, 16, 22, 0.88)',
    });
    text.textContent = '10';
    psoGroup.append(text);
  }

  reticleSvg.append(acogGroup, lpvoGroup, sniperGroup, psoGroup);

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
    psoGroup.style.display = style === 'pso' ? '' : 'none';
  }
  setStyle('sniper');

  return { root, reticleSvg, zoomTag, zoomHint, setStyle };
}

export function createHudView(container: HTMLElement, initialTargets: number, actions: HudActions) {
  const layer = el('div', 'hud-layer');
  layer.dataset.visible = 'true';

  // 0. Incoming Damage Vignette + Directional Hit Arc
  const damageVignette = el('div', 'hud-damage-vignette');
  const damageArc = document.createElementNS(SVG_NS, 'svg');
  damageArc.setAttribute('viewBox', '0 0 240 240');
  damageArc.setAttribute('class', 'hud-damage-arc');
  damageArc.setAttribute('aria-hidden', 'true');
  damageArc.append(
    svgEl('path', {
      d: 'M 84 26 A 98 98 0 0 1 156 26',
      fill: 'none',
      stroke: '#e5534b',
      'stroke-width': '5.5',
      'stroke-linecap': 'round',
    }),
    svgEl('path', {
      d: 'M 120 12 L 112 24 H 128 Z',
      fill: '#ff7a70',
    }),
  );

  const scope = buildScopeOverlay();

  // 1. Top Objective Tracker (Dynamic Hostiles or Targets Down, adaptive N-segment bar, live Run Timer)
  const objective = el('section', 'hud-plate hud-objective');
  objective.setAttribute('aria-label', 'Mission progress');
  const objectiveTop = el('div', 'hud-objective__top');

  const targetGroup = el('div', 'hud-objective__group');
  const targetLabel = el('span', 'hud-objective__label', 'Hostiles');
  const targetCountWrap = el('span', 'hud-objective__count');
  const targetDownNum = el('span', undefined, '0');
  const targetSep = el('span', 'hud-objective__count-sep', ' / ');
  const targetTotalNum = el('span', 'hud-objective__count-total', String(initialTargets));
  targetCountWrap.append(targetDownNum, targetSep, targetTotalNum);
  targetGroup.append(targetLabel, targetCountWrap);

  const timerGroup = el('div', 'hud-objective__group');
  const timerLabel = el('span', 'hud-objective__label', 'Time');
  const timerValue = el('span', 'hud-objective__timer', '00:00.00');
  timerGroup.append(timerLabel, timerValue);

  objectiveTop.append(targetGroup, timerGroup);

  const segmentBar = el('div', 'hud-objective__segments');
  let segments: HTMLElement[] = [];

  function rebuildSegments(count: number) {
    const safeCount = Math.max(1, count);
    segmentBar.style.gridTemplateColumns = `repeat(${safeCount}, 1fr)`;
    segmentBar.replaceChildren();
    segments = Array.from({ length: safeCount }, () => {
      const seg = el('span', 'hud-segment');
      seg.dataset.down = 'false';
      segmentBar.append(seg);
      return seg;
    });
    targetTotalNum.textContent = String(count);
  }
  rebuildSegments(initialTargets);
  const nextGunRow = el('div', 'hud-objective__next');
  nextGunRow.hidden = true;
  objective.append(objectiveTop, segmentBar, nextGunRow);

  // 2. Bottom-Left Operator Vitals Card (Active in Combat Modes)
  const vitalsPanel = el('section', 'hud-plate hud-vitals');
  vitalsPanel.setAttribute('aria-label', 'Operator health');
  vitalsPanel.dataset.state = 'healthy';
  const vitalsTop = el('div', 'hud-vitals__top');
  const vitalsLeft = el('div', 'hud-vitals__title');
  vitalsLeft.append(createIcon('shield', 'hud-vitals__icon'), el('span', undefined, 'Operator HP'));
  const vitalsNumWrap = el('div', 'hud-vitals__num-wrap');
  const vitalsCurrent = el('span', 'hud-vitals__num', '100');
  const vitalsMax = el('span', 'hud-vitals__max', '/ 100');
  vitalsNumWrap.append(vitalsCurrent, vitalsMax);
  vitalsTop.append(vitalsLeft, vitalsNumWrap);

  const vitalsBar = el('div', 'hud-vitals__bar');
  const VITALS_SEGS = 10;
  const vitalsSegs = Array.from({ length: VITALS_SEGS }, () => {
    const s = el('span', 'hud-vitals__seg');
    s.dataset.filled = 'true';
    vitalsBar.append(s);
    return s;
  });

  // Boost meter: one thin track under the health bar, notched where each healing rate starts.
  const boostTrack = el('div', 'hud-boost');
  boostTrack.setAttribute('aria-label', 'Boost');
  const boostFill = el('div', 'hud-boost__fill');
  boostTrack.append(boostFill);
  for (const tier of BOOST_TUNING.tiers) {
    const notch = el('div', 'hud-boost__notch');
    notch.style.left = `${((tier.threshold / BOOST_TUNING.max) * 100).toFixed(1)}%`;
    boostTrack.append(notch);
  }

  // Armour: helmet and vest, each with its level and remaining durability.
  const armourRow = el('div', 'hud-armour');
  const makeArmourCell = (label: string) => {
    const cell = el('div', 'hud-armour__cell');
    cell.dataset.state = 'none';
    const name = el('span', 'hud-armour__name', label);
    const level = el('span', 'hud-armour__level', '—');
    const track = el('div', 'hud-armour__track');
    const fill = el('div', 'hud-armour__fill');
    track.append(fill);
    cell.append(name, level, track);
    armourRow.append(cell);
    return { cell, level, fill };
  };
  const helmetCell = makeArmourCell('Helmet');
  const vestCell = makeArmourCell('Vest');

  // Item tray: five fixed slots with their key and how many are carried.
  const itemTray = el('div', 'hud-items');
  const itemChips = CONSUMABLE_ORDER.map((id) => {
    const chip = el('div', 'hud-item');
    chip.dataset.kind = CONSUMABLES[id].kind;
    chip.dataset.empty = 'true';
    chip.dataset.using = 'false';
    chip.title = CONSUMABLES[id].description;
    const key = createKeycap(CONSUMABLE_KEY_LABEL[id]);
    const name = el('span', 'hud-item__name', CONSUMABLES[id].shortName);
    const count = el('span', 'hud-item__count', '0');
    chip.append(key, name, count);
    itemTray.append(chip);
    return { id, chip, count };
  });

  vitalsPanel.append(vitalsTop, vitalsBar, boostTrack, armourRow, itemTray);

  // 2b. Item-in-use progress, under the crosshair.
  const usePanel = el('div', 'hud-use');
  usePanel.dataset.open = 'false';
  const useHeader = el('div', 'hud-use__header');
  const useLabel = el('span', 'hud-use__label', 'Using');
  const useTime = el('span', 'hud-use__time ui-tabular', '0.0s');
  useHeader.append(useLabel, useTime);
  const useTrack = el('div', 'hud-use__track');
  const useFill = el('div', 'hud-use__fill');
  useTrack.append(useFill);
  const useHint = el('div', 'hud-use__hint', 'Firing, switching weapon or being hit cancels');
  usePanel.append(useHeader, useTrack, useHint);

  // 2c. Health of the hurt target under the sights, above the crosshair.
  const targetPanel = el('div', 'hud-target-health');
  targetPanel.dataset.open = 'false';
  const targetHealthLabel = el('span', 'hud-target-health__label', 'Target');
  const targetHealthNum = el('span', 'hud-target-health__num ui-tabular', '100');
  const targetHealthTrack = el('div', 'hud-target-health__track');
  const targetHealthFill = el('div', 'hud-target-health__fill');
  targetHealthTrack.append(targetHealthFill);
  targetPanel.append(targetHealthLabel, targetHealthTrack, targetHealthNum);

  // 3. Dynamic Crosshair
  const crosshair = el('div', 'hud-crosshair');
  const crosshairDot = el('span', 'hud-crosshair__dot');
  const armTop = el('span', 'hud-crosshair__arm hud-crosshair__arm--top');
  const armBottom = el('span', 'hud-crosshair__arm hud-crosshair__arm--bottom');
  const armLeft = el('span', 'hud-crosshair__arm hud-crosshair__arm--left');
  const armRight = el('span', 'hud-crosshair__arm hud-crosshair__arm--right');
  crosshair.append(crosshairDot, armTop, armBottom, armLeft, armRight);

  // 4. Sharp Hit / Neutralized Marker
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

  // 5. Contextual Reload Prompt
  const reloadPrompt = el('div', 'hud-reload-prompt');
  reloadPrompt.dataset.state = 'hidden';
  const reloadPromptKey = createKeycap('R');
  const reloadPromptText = el('span', 'hud-reload-prompt__text', 'Reload');
  reloadPrompt.append(reloadPromptKey, reloadPromptText);

  // 6. Quiet Stance Indicators
  const stanceWrap = el('div', 'hud-stance');
  const leanLeftPill = el('div', 'hud-stance__pill');
  leanLeftPill.append(createIcon('leanLeft'), el('span', undefined, 'Lean L'));
  const leanRightPill = el('div', 'hud-stance__pill');
  leanRightPill.append(createIcon('leanRight'), el('span', undefined, 'Lean R'));
  const sprintPill = el('div', 'hud-stance__pill');
  sprintPill.append(createIcon('sprint'), el('span', undefined, 'Sprint'));
  stanceWrap.append(leanLeftPill, leanRightPill, sprintPill);

  // 7. Bottom-Right Weapon & Ammo Cluster
  const weaponCluster = el('div', 'hud-weapon-cluster');
  const slotStrip = el('div', 'hud-slots');
  const gunGameNextBadge = el('div', 'hud-gg-next');
  gunGameNextBadge.hidden = true;
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
  weaponCluster.append(slotStrip, gunGameNextBadge, weaponPanel);

  // 8. Stacked Event Feed
  const feedWrap = el('div', 'hud-feed');

  // 9. Outcome / Course Cleared Sweep Banner (supports Range auto-reset AND Combat Victory/Defeat CTAs!)
  const banner = el('section', 'hud-banner');
  banner.dataset.open = 'false';
  banner.dataset.tone = 'victory';
  const ruleTop = el('div', 'hud-banner__rule hud-banner__rule--top');
  const ruleBottom = el('div', 'hud-banner__rule hud-banner__rule--bottom');
  const bannerEyebrow = el('div', 'hud-banner__eyebrow', 'Shoot House · Sector Secured');
  const bannerTitle = el('h2', 'hud-banner__title', 'Sector Secured');

  const bannerStats = el('div', 'hud-banner__stats');
  const stat1Lbl = el('span', 'hud-banner__stat-label', 'Elapsed');
  const stat1Val = el('span', 'hud-banner__stat-value', '00:00.00');
  const stat2Lbl = el('span', 'hud-banner__stat-label', 'Hostiles');
  const stat2Val = el('span', 'hud-banner__stat-value', '10 / 10');
  const stat3Lbl = el('span', 'hud-banner__stat-label', 'Accuracy');
  const stat3Val = el('span', 'hud-banner__stat-value', '0%');
  const stat4Lbl = el('span', 'hud-banner__stat-label', 'Vitals');
  const stat4Val = el('span', 'hud-banner__stat-value', '100 HP');
  const stat4Cell = el('div', 'hud-banner__stat');

  for (const [lbl, val, cellOverride] of [
    [stat1Lbl, stat1Val, null],
    [stat2Lbl, stat2Val, null],
    [stat3Lbl, stat3Val, null],
    [stat4Lbl, stat4Val, stat4Cell],
  ] as const) {
    const cell = cellOverride ?? el('div', 'hud-banner__stat');
    cell.append(lbl, val);
    bannerStats.append(cell);
  }

  // Range mode reset countdown bar
  const bannerReset = el('div', 'hud-banner__reset');
  const bannerResetRow = el('div', 'hud-banner__reset-row');
  const bannerResetLabel = el('span', undefined, 'Targets Resetting');
  const bannerResetValue = el('span', undefined, '3.0s');
  bannerResetRow.append(bannerResetLabel, bannerResetValue);
  const bannerResetTrack = el('div', 'hud-banner__reset-track');
  const bannerResetFill = el('div', 'hud-banner__reset-fill');
  bannerResetTrack.append(bannerResetFill);
  bannerReset.append(bannerResetRow, bannerResetTrack);

  // Combat modes interactive outcome actions (Deploy Again / Return to Title)
  const bannerActions = el('div', 'hud-banner__actions');
  const restartBtn = el('button', 'hud-banner__btn hud-banner__btn--primary');
  restartBtn.type = 'button';
  restartBtn.dataset.action = 'outcome-restart';
  restartBtn.append(
    createIcon('restart'),
    el('span', undefined, 'Deploy Again'),
    createKeycap('Enter'),
  );
  restartBtn.addEventListener('click', () => {
    actions.onRestartRun();
  });

  const titleBtn = el('button', 'hud-banner__btn');
  titleBtn.type = 'button';
  titleBtn.dataset.action = 'outcome-title';
  titleBtn.append(createIcon('quit'), el('span', undefined, 'Main Menu'));
  titleBtn.addEventListener('click', () => {
    actions.onQuitToTitle();
  });
  bannerActions.append(restartBtn, titleBtn);

  banner.append(
    ruleTop,
    bannerEyebrow,
    bannerTitle,
    bannerStats,
    bannerReset,
    bannerActions,
    ruleBottom,
  );

  layer.append(
    damageVignette,
    damageArc,
    scope.root,
    objective,
    vitalsPanel,
    usePanel,
    targetPanel,
    crosshair,
    hitMarker,
    reloadPrompt,
    stanceWrap,
    weaponCluster,
    feedWrap,
    banner,
  );
  container.append(layer);

  // Cached state
  let shownVisible = true;
  let shownMode = '';
  let shownObjectiveTotal = initialTargets;
  let shownWeaponId: WeaponId | null = null;
  let shownOpticId: OpticId | null = null;
  let shownMagazineSize = -1;
  let shownSlotKey = '';
  let shownActiveSlot: WeaponSlot | null = null;
  let shownScopeActive = false;
  let shownScopeOpacity = '';
  let shownScopeCant = '';
  let shownScopeZoom = '';
  let shownScopeVariable = false;
  let shownDown = -1;
  let shownGunGameTier = -2;
  let shownCleared = false;
  let shownTimer = '';
  let shownTimerActive = false;
  let shownHealth = -1;
  let shownVitalsState = '';
  let shownBoost = '';
  let shownBoostHealing = false;
  let shownArmourKey = '';
  let shownItemsKey = '';
  let shownUseId: ConsumableId | null = null;
  let shownUseTime = '';
  let shownTargetKey = '';
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
  let shownBannerTone = '';
  let shownBannerStatsKey = '';
  let shownResetText = '';
  let lastGapPx = -1;
  let lastCrosshairOpacity = -1;
  let lastVignetteOpacity = '';

  let spreadGap = 5;
  let shotKick = 0;
  let hitTimer = 0;
  let hitDuration = HIT_DURATION;
  let tickPopTimer = 0;
  let dryFireTimer = 0;
  let dirArcTimer = 0;
  let dirArcWorldVec: { x: number; z: number } | null = null;
  const feedItems: FeedEntry[] = [];

  function syncWeaponPresentation(
    weaponId: WeaponId,
    opticId: OpticId,
    spec: {
      readonly name: string;
      readonly caliber: string;
      readonly fireMode: string;
      readonly magazineSize: number;
    },
  ) {
    const optic = OPTICS[opticId];
    shownWeaponId = weaponId;
    shownOpticId = opticId;
    shownMagazineSize = spec.magazineSize;
    shownRounds = -1;

    weaponSvgHost.replaceChildren(createWeaponSilhouette(weaponId, 'hud-weapon-svg'));
    weaponName.textContent = spec.name;
    weaponCaliber.textContent = `${spec.caliber} · ${optic.shortName}`;
    weaponMode.textContent = FIRE_MODE_SHORT[spec.fireMode] ?? spec.fireMode.toUpperCase();
    roundsCapacity.textContent = `/ ${spec.magazineSize}`;

    pipsRow.dataset.density = spec.magazineSize > 12 ? 'compact' : 'standard';
    pipsRow.replaceChildren();
    pips = Array.from({ length: spec.magazineSize }, () => {
      const pip = el('span', 'hud-pip');
      pip.dataset.filled = 'true';
      pipsRow.append(pip);
      return pip;
    });
  }

  function pushFeed(text: string, rightTag: string, accentHeadshot = false) {
    const row = el('div', 'hud-feed__item');
    if (accentHeadshot) row.dataset.headshot = 'true';
    row.dataset.entering = 'true';
    const label = el('span', 'hud-feed__label', text);
    const dist = el('span', 'hud-feed__distance', rightTag);
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

    onEnemyHit(headshot: boolean) {
      hitDuration = headshot ? KILL_DURATION : HIT_DURATION;
      hitTimer = hitDuration;
      hitMarker.dataset.kind = headshot ? 'kill' : 'enemy';
    },

    onEnemyDown(
      distanceMetres: number,
      downCount: number,
      totalEnemies: number,
      headshot: boolean,
    ) {
      hitDuration = KILL_DURATION;
      hitTimer = KILL_DURATION;
      hitMarker.dataset.kind = 'kill';
      const prefix = headshot ? 'Headshot' : 'Hostile Down';
      pushFeed(
        `${prefix} ${downCount}/${totalEnemies}`,
        `${distanceMetres.toFixed(1)} m`,
        headshot,
      );
    },

    onTierAdvance(tierIndex: number, totalTiers: number, weaponId: WeaponId) {
      const wName = getWeaponSpec(weaponId).name;
      pushFeed(`Tier ${tierIndex + 1}/${totalTiers} · ${wName}`, 'PROMOTED', true);
    },

    onPlayerHit(fromDir: { readonly x: number; readonly z: number }) {
      dirArcTimer = DIR_ARC_SECONDS;
      dirArcWorldVec = { x: fromDir.x, z: fromDir.z };
    },

    onTargetDown(distanceMetres: number, downCount: number, totalCount: number) {
      hitDuration = KILL_DURATION;
      hitTimer = KILL_DURATION;
      hitMarker.dataset.kind = 'kill';
      pushFeed(`Target ${downCount}/${totalCount}`, `${distanceMetres.toFixed(1)} m`);
    },

    onArmourBroken(piece: 'vest' | 'helmet', mine: boolean) {
      const what = piece === 'vest' ? 'Vest' : 'Helmet';
      pushFeed(mine ? `Your ${what} Broke` : `Hostile ${what} Broken`, 'ARMOUR', !mine);
    },

    onConsumableCancelled(id: ConsumableId) {
      pushFeed(`${CONSUMABLES[id].shortName} Interrupted`, 'CANCELLED');
    },

    onDryFire() {
      dryFireTimer = DRY_FIRE_SECONDS;
      weaponPanel.dataset.dryFire = 'true';
    },

    clearFeed() {
      hitTimer = 0;
      dirArcTimer = 0;
      damageArc.style.opacity = '0';
      hitMarker.style.opacity = '0';
      while (feedItems.length > 0) {
        feedItems.pop()?.element.remove();
      }
    },

    update(dt: number, input: HudFrameInput) {
      const { state, aimBlend, scopeOverlay, visible, reducedMotion, showTacticalFeed } = input;
      const spec = activeWeaponSpec(state);
      const modeSpec = getGameModeSpec(state.mode);

      if (visible !== shownVisible) {
        shownVisible = visible;
        layer.dataset.visible = visible ? 'true' : 'false';
      }

      if (showTacticalFeed !== shownFeedVisible) {
        shownFeedVisible = showTacticalFeed;
        feedWrap.hidden = !showTacticalFeed;
        stanceWrap.hidden = !showTacticalFeed;
      }

      // Mode switch sync (Gun Game 8-Weapon Ladder vs Practice 16 Steel Targets)
      const wantedTotal = modeSpec.usesWeaponLadder
        ? GUN_GAME_LADDER.length
        : modeSpec.usesEnemies
          ? state.enemies.length
          : state.targetsDown.length;
      if (state.mode !== shownMode || wantedTotal !== shownObjectiveTotal) {
        shownMode = state.mode;
        shownObjectiveTotal = wantedTotal;
        shownDown = -1;
        shownGunGameTier = -2;
        targetLabel.textContent = modeSpec.objectiveLabel;
        vitalsPanel.hidden = !modeSpec.usesEnemies;
        layer.dataset.survival = modeSpec.usesEnemies ? 'true' : 'false';
        slotStrip.hidden = modeSpec.usesWeaponLadder;
        gunGameNextBadge.hidden = !modeSpec.usesWeaponLadder;
        nextGunRow.hidden = !modeSpec.usesWeaponLadder;
        rebuildSegments(wantedTotal);
      }

      // Incoming damage vignette + directional arc
      const lowHpRatio = modeSpec.usesEnemies
        ? Math.max(0, (35 - state.playerHealth) / 35) * 0.28
        : 0;
      const vigAlpha = Math.min(0.85, state.damagePulse * 0.65 + lowHpRatio);
      const vigStr = vigAlpha.toFixed(2);
      if (vigStr !== lastVignetteOpacity) {
        lastVignetteOpacity = vigStr;
        damageVignette.style.opacity = vigStr;
      }

      if (dirArcTimer > 0 && dirArcWorldVec) {
        dirArcTimer = Math.max(0, dirArcTimer - dt);
        // Player forward in XZ is `(-sin(yaw), -cos(yaw))`, right is `(cos(yaw), -sin(yaw))`.
        const yaw = state.player.yaw;
        const fwdDot = dirArcWorldVec.x * -Math.sin(yaw) + dirArcWorldVec.z * -Math.cos(yaw);
        const rightDot = dirArcWorldVec.x * Math.cos(yaw) + dirArcWorldVec.z * -Math.sin(yaw);
        const angleDeg = (Math.atan2(rightDot, fwdDot) * 180) / Math.PI;
        const arcOpacity = Math.min(1, (dirArcTimer / DIR_ARC_SECONDS) * 1.15);
        damageArc.style.opacity = arcOpacity.toFixed(2);
        damageArc.style.transform = `translate(-50%, -50%) rotate(${angleDeg.toFixed(1)}deg)`;
      } else if (damageArc.style.opacity !== '0') {
        damageArc.style.opacity = '0';
      }

      // Operator Vitals Card
      if (modeSpec.usesEnemies) {
        const hp = Math.ceil(state.playerHealth);
        if (hp !== shownHealth) {
          shownHealth = hp;
          vitalsCurrent.textContent = String(hp);
          vitalsMax.textContent = `/ ${state.playerMaxHealth}`;
          const filledSegs = Math.ceil((hp / Math.max(1, state.playerMaxHealth)) * VITALS_SEGS);
          for (let i = 0; i < VITALS_SEGS; i++) {
            const seg = vitalsSegs[i];
            if (seg) seg.dataset.filled = i < filledSegs ? 'true' : 'false';
          }
        }
        const vState = hp <= 30 ? 'critical' : hp <= 55 ? 'warning' : 'healthy';
        if (vState !== shownVitalsState) {
          shownVitalsState = vState;
          vitalsPanel.dataset.state = vState;
        }

        const boostText = ((state.playerBoost / BOOST_TUNING.max) * 100).toFixed(0);
        if (boostText !== shownBoost) {
          shownBoost = boostText;
          boostFill.style.width = `${boostText}%`;
        }
        const boostHealing = BOOST_TUNING.tiers.some((tier) => state.playerBoost > tier.threshold);
        if (boostHealing !== shownBoostHealing) {
          shownBoostHealing = boostHealing;
          boostTrack.dataset.healing = boostHealing ? 'true' : 'false';
        }

        const armour = state.playerArmour;
        const armourKey = `${armour.helmet}:${Math.ceil(armour.helmetDurability)}|${armour.vest}:${Math.ceil(armour.vestDurability)}`;
        if (armourKey !== shownArmourKey) {
          shownArmourKey = armourKey;
          const paint = (
            cell: { cell: HTMLElement; level: HTMLElement; fill: HTMLElement },
            level: 0 | 1 | 2 | 3,
            durability: number,
            pool: number,
          ) => {
            const share = pool > 0 ? Math.max(0, Math.min(1, durability / pool)) : 0;
            cell.level.textContent = ARMOUR_LEVEL_LABEL[level];
            cell.fill.style.width = `${(share * 100).toFixed(0)}%`;
            cell.cell.dataset.state =
              level === 0 ? 'none' : share <= 0 ? 'broken' : share < 0.3 ? 'worn' : 'sound';
          };
          paint(
            helmetCell,
            armour.helmet,
            armour.helmetDurability,
            ARMOUR_TUNING.helmetDurability[armour.helmet],
          );
          paint(
            vestCell,
            armour.vest,
            armour.vestDurability,
            ARMOUR_TUNING.vestDurability[armour.vest],
          );
        }

        const usingId = state.consumableUse?.id ?? null;
        const itemsKey = `${CONSUMABLE_ORDER.map((id) => state.consumables[id]).join(',')}|${usingId ?? ''}`;
        if (itemsKey !== shownItemsKey) {
          shownItemsKey = itemsKey;
          for (const item of itemChips) {
            const carried = state.consumables[item.id];
            item.count.textContent = String(carried);
            item.chip.dataset.empty = carried > 0 ? 'false' : 'true';
            item.chip.dataset.using = item.id === usingId ? 'true' : 'false';
          }
        }
      }

      // Item-in-use progress
      const use = state.consumableUse;
      if (use) {
        if (use.id !== shownUseId) {
          shownUseId = use.id;
          usePanel.dataset.open = 'true';
          usePanel.dataset.kind = CONSUMABLES[use.id].kind;
          useLabel.textContent = `Using ${CONSUMABLES[use.id].name}`;
        }
        const left = `${use.remaining.toFixed(1)}s`;
        if (left !== shownUseTime) {
          shownUseTime = left;
          useTime.textContent = left;
          const done = use.duration > 0 ? 1 - use.remaining / use.duration : 1;
          useFill.style.transform = `scaleX(${Math.max(0, Math.min(1, done)).toFixed(3)})`;
        }
      } else if (shownUseId !== null) {
        shownUseId = null;
        shownUseTime = '';
        usePanel.dataset.open = 'false';
      }

      // Aimed-target health readout
      const aimed = state.aimedTarget;
      const targetKey = aimed ? `${Math.ceil(aimed.health)}/${aimed.maxHealth}` : '';
      if (targetKey !== shownTargetKey) {
        shownTargetKey = targetKey;
        if (aimed) {
          const share = Math.max(0, Math.min(1, aimed.health / Math.max(1, aimed.maxHealth)));
          targetPanel.dataset.open = 'true';
          targetPanel.dataset.state = share <= 0.3 ? 'critical' : share <= 0.6 ? 'hurt' : 'sound';
          targetHealthLabel.textContent = aimed.entity.kind === 'dummy' ? 'Dummy' : 'Hostile';
          targetHealthNum.textContent = String(Math.ceil(aimed.health));
          targetHealthFill.style.width = `${(share * 100).toFixed(0)}%`;
        } else {
          targetPanel.dataset.open = 'false';
        }
      }

      // Multi-optic scope overlay
      const outcomeOpen =
        state.outcome === 'victory' ||
        state.outcome === 'defeat' ||
        (!modeSpec.usesEnemies &&
          state.targetsDown.length > 0 &&
          state.targetsDown.every(Boolean) &&
          state.resetIn > 0);

      const showScope =
        !outcomeOpen && scopeOverlay.active && visible && scopeOverlay.style !== 'none';
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

      // The spec here already includes fitted attachments, so an extended magazine shows.
      if (
        state.weapon.weaponId !== shownWeaponId ||
        spec.opticId !== shownOpticId ||
        spec.magazineSize !== shownMagazineSize
      ) {
        syncWeaponPresentation(state.weapon.weaponId, spec.opticId, spec);
      }

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
      if (modeSpec.usesWeaponLadder) {
        const completedTiers =
          state.outcome === 'victory' ? GUN_GAME_LADDER.length : state.gunGameTier;
        const displayTier = Math.min(GUN_GAME_LADDER.length, state.gunGameTier + 1);
        downCount = displayTier;
        for (let i = 0; i < GUN_GAME_LADDER.length; i++) {
          const seg = segments[i];
          if (!seg) continue;
          const isCleared = i < completedTiers;
          const isActiveTier = state.outcome !== 'victory' && i === state.gunGameTier;
          const wantedDown = isCleared ? 'true' : 'false';
          const wantedActive = isActiveTier ? 'true' : 'false';
          if (seg.dataset.down !== wantedDown) seg.dataset.down = wantedDown;
          if (seg.dataset.current !== wantedActive) seg.dataset.current = wantedActive;
        }

        const tierKey = state.outcome === 'victory' ? 999 : state.gunGameTier;
        if (tierKey !== shownGunGameTier) {
          shownGunGameTier = tierKey;
          const curWeaponId = GUN_GAME_LADDER[state.gunGameTier] ?? state.weapon.weaponId;
          const curName = getWeaponSpec(curWeaponId).name;
          const nextWeaponId = GUN_GAME_LADDER[state.gunGameTier + 1];
          if (state.outcome === 'victory') {
            nextGunRow.textContent = 'ALL 8 WEAPON TIERS CLEARED';
            gunGameNextBadge.textContent = 'LADDER COMPLETE';
          } else if (nextWeaponId) {
            const nextName = getWeaponSpec(nextWeaponId).name;
            nextGunRow.textContent = `${curName}  →  NEXT: ${nextName}`;
            gunGameNextBadge.textContent = `TIER ${displayTier}/${GUN_GAME_LADDER.length} · NEXT: ${nextName}`;
          } else {
            nextGunRow.textContent = `${curName}  ·  FINAL TIER — 1 KILL TO WIN`;
            gunGameNextBadge.textContent = `FINAL TIER ${displayTier}/${GUN_GAME_LADDER.length} · ${curName}`;
          }
        }
      } else if (modeSpec.usesEnemies) {
        for (let i = 0; i < state.enemies.length; i++) {
          const isDown = state.enemies[i]?.alive === false;
          if (isDown) downCount++;
          const seg = segments[i];
          if (seg) {
            const wanted = isDown ? 'true' : 'false';
            if (seg.dataset.down !== wanted) seg.dataset.down = wanted;
            delete seg.dataset.current;
          }
        }
      } else {
        for (let i = 0; i < state.targetsDown.length; i++) {
          const isDown = Boolean(state.targetsDown[i]);
          if (isDown) downCount++;
          const seg = segments[i];
          if (seg) {
            const wanted = isDown ? 'true' : 'false';
            if (seg.dataset.down !== wanted) seg.dataset.down = wanted;
            delete seg.dataset.current;
          }
        }
      }

      if (downCount !== shownDown) {
        shownDown = downCount;
        targetDownNum.textContent = String(downCount);
      }
      const cleared = modeSpec.usesWeaponLadder
        ? state.outcome === 'victory'
        : wantedTotal > 0 && downCount === wantedTotal;
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

      // Crosshair spread & ADS fade
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
        outcomeOpen || scopeOverlay.active ? 0 : Math.max(0, Math.min(1, 1 - aimBlend * 1.25));
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

      const promptState =
        reloading || outcomeOpen
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

      // Outcome / Course Cleared Banner
      if (outcomeOpen !== shownBannerOpen) {
        shownBannerOpen = outcomeOpen;
        banner.dataset.open = outcomeOpen ? 'true' : 'false';
      }

      if (outcomeOpen) {
        const tone = state.outcome === 'defeat' ? 'defeat' : 'victory';
        if (tone !== shownBannerTone) {
          shownBannerTone = tone;
          banner.dataset.tone = tone;
        }

        const accuracy = runAccuracyPercent(state.run);
        const mapName = getMapById(state.mapId).name;
        if (modeSpec.usesEnemies) {
          bannerReset.hidden = true;
          bannerActions.hidden = false;
          stat4Cell.hidden = false;
          bannerStats.dataset.columns = '4';

          if (state.outcome === 'victory') {
            bannerEyebrow.textContent = `${mapName} · ${modeSpec.name} Complete`;
            bannerTitle.textContent = modeSpec.usesWeaponLadder
              ? 'Arsenal Mastered'
              : 'Sector Secured';
          } else {
            bannerEyebrow.textContent = `${mapName} · ${modeSpec.name} — KIA`;
            bannerTitle.textContent = 'Operator Down';
          }

          const tierStat = modeSpec.usesWeaponLadder
            ? `${state.outcome === 'victory' ? GUN_GAME_LADDER.length : state.gunGameTier + 1} / ${GUN_GAME_LADDER.length}`
            : `${downCount} / ${wantedTotal}`;
          const statsKey = `combat|${mapName}|${timerText}|${tierStat}|${accuracy}|${Math.ceil(state.playerHealth)}`;
          if (statsKey !== shownBannerStatsKey) {
            shownBannerStatsKey = statsKey;
            stat1Lbl.textContent = 'Elapsed';
            stat1Val.textContent = timerText;
            stat2Lbl.textContent = modeSpec.usesWeaponLadder ? 'Weapon Tier' : 'Hostiles';
            stat2Val.textContent = tierStat;
            stat3Lbl.textContent = 'Accuracy';
            stat3Val.textContent = `${accuracy}%`;
            stat4Lbl.textContent = 'Vitals';
            stat4Val.textContent = `${Math.ceil(state.playerHealth)} HP`;
          }
        } else {
          bannerReset.hidden = false;
          bannerActions.hidden = true;
          stat4Cell.hidden = true;
          bannerStats.dataset.columns = '3';
          bannerEyebrow.textContent = `${mapName} · All Practice Targets Down`;
          bannerTitle.textContent = 'Course Cleared';

          const statsKey = `range|${timerText}|${state.run.shotsFired}|${accuracy}`;
          if (statsKey !== shownBannerStatsKey) {
            shownBannerStatsKey = statsKey;
            stat1Lbl.textContent = 'Clear Time';
            stat1Val.textContent = timerText;
            stat2Lbl.textContent = 'Shots Fired';
            stat2Val.textContent = String(state.run.shotsFired);
            stat3Lbl.textContent = 'Accuracy';
            stat3Val.textContent = `${accuracy}%`;
          }

          const resetFrac = Math.max(0, Math.min(1, state.resetIn / TARGET.resetDelay));
          bannerResetFill.style.transform = `scaleX(${resetFrac.toFixed(3)})`;
          const resetText = `${state.resetIn.toFixed(1)}s`;
          if (resetText !== shownResetText) {
            shownResetText = resetText;
            bannerResetValue.textContent = resetText;
          }
        }
      }
    },
  };
}
