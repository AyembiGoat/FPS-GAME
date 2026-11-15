import type { GameMap, MapId } from '../../core/map';
import { getMapById, MAP_LIST } from '../../core/maps';
import type { GameModeId, GameModeSpec } from '../../core/modes';
import { GAME_MODE_LIST, getGameModeSpec, GUN_GAME_LADDER } from '../../core/modes';
import { getWeaponSpec } from '../../core/weapon';
import type { GameAudio } from '../audio';
import { el } from './dom';
import { createIcon, createWeaponSilhouette } from './icons';
import { createKeyHint } from './keycaps';
import type { ModeStore } from './modeStore';

const SVG_NS = 'http://www.w3.org/2000/svg';

function mkSvg(tag: string, attrs: Record<string, string>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Architectural tactical schematic for `shoot-house` and `cargo-yard`. */
function buildMapSchematicSvg(mapId: MapId, compact = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 340 210');
  svg.setAttribute('class', compact ? 'modes-map-thumb-svg' : 'modes-map-svg');
  svg.setAttribute('aria-hidden', 'true');

  if (mapId === 'shoot-house') {
    svg.append(
      mkSvg('rect', {
        x: '12',
        y: '12',
        width: '316',
        height: '186',
        rx: '2',
        fill: 'rgba(13, 17, 24, 0.88)',
        stroke: 'rgba(229, 169, 60, 0.38)',
        'stroke-width': '1.5',
      }),
      mkSvg('path', {
        d: 'M 96 12 V 198 M 234 12 V 198 M 12 62 H 328 M 12 154 H 328',
        stroke: 'rgba(230, 238, 248, 0.08)',
        'stroke-width': '1',
        'stroke-dasharray': '3 3',
      }),
      mkSvg('rect', {
        x: '32',
        y: '64',
        width: '78',
        height: '84',
        fill: 'rgba(229, 169, 60, 0.14)',
        stroke: 'rgba(229, 169, 60, 0.68)',
        'stroke-width': '1.4',
      }),
      mkSvg('path', {
        d: 'M 32 94 H 82 M 58 122 H 110 M 70 64 V 84 M 70 132 V 148',
        stroke: 'rgba(229, 169, 60, 0.45)',
        'stroke-width': '1.1',
      }),
      mkSvg('rect', {
        x: '136',
        y: '74',
        width: '20',
        height: '32',
        fill: 'rgba(206, 78, 62, 0.36)',
        stroke: 'rgba(232, 112, 94, 0.78)',
        'stroke-width': '1.2',
      }),
      mkSvg('rect', {
        x: '182',
        y: '98',
        width: '20',
        height: '32',
        fill: 'rgba(92, 142, 192, 0.32)',
        stroke: 'rgba(142, 188, 232, 0.72)',
        'stroke-width': '1.2',
      }),
      mkSvg('rect', {
        x: '122',
        y: '22',
        width: '94',
        height: '32',
        fill: 'rgba(230, 238, 248, 0.09)',
        stroke: 'rgba(230, 238, 248, 0.44)',
        'stroke-width': '1.2',
      }),
      mkSvg('path', {
        d: 'M 282 172 V 30',
        stroke: 'rgba(229, 169, 60, 0.74)',
        'stroke-width': '1.5',
        'stroke-dasharray': '5 4',
      }),
      mkSvg('circle', { cx: '170', cy: '182', r: '4.5', fill: '#5bd68a' }),
    );

    if (!compact) {
      for (const [txt, x, y] of [
        ['CQB HOUSE', 71, 111],
        ['BUNKER', 169, 42],
        ['CHICANE', 169, 144],
        ['50M RANGE', 282, 105],
        ['SPAWN', 170, 194],
      ] as const) {
        const t = mkSvg('text', {
          x: String(x),
          y: String(y),
          'text-anchor': 'middle',
          fill: 'rgba(234, 240, 248, 0.82)',
          'font-family': 'Barlow Condensed, sans-serif',
          'font-size': '10',
          'font-weight': '700',
          'letter-spacing': '1.1',
        });
        t.textContent = txt;
        svg.append(t);
      }
    }
  } else {
    svg.append(
      mkSvg('rect', {
        x: '12',
        y: '12',
        width: '316',
        height: '186',
        rx: '2',
        fill: 'rgba(10, 15, 22, 0.92)',
        stroke: 'rgba(132, 178, 224, 0.44)',
        'stroke-width': '1.5',
      }),
      mkSvg('path', {
        d: 'M 98 12 V 198 M 234 12 V 198 M 12 60 H 328 M 12 156 H 328',
        stroke: 'rgba(190, 214, 240, 0.08)',
        'stroke-width': '1',
        'stroke-dasharray': '3 3',
      }),
      mkSvg('rect', {
        x: '28',
        y: '62',
        width: '68',
        height: '88',
        fill: 'rgba(186, 86, 62, 0.18)',
        stroke: 'rgba(222, 114, 88, 0.76)',
        'stroke-width': '1.4',
      }),
      mkSvg('path', {
        d: 'M 28 92 H 68 M 56 122 H 96',
        stroke: 'rgba(222, 114, 88, 0.5)',
        'stroke-width': '1.1',
      }),
      mkSvg('rect', {
        x: '120',
        y: '108',
        width: '20',
        height: '34',
        fill: 'rgba(78, 128, 184, 0.36)',
        stroke: 'rgba(138, 188, 240, 0.8)',
        'stroke-width': '1.3',
      }),
      mkSvg('rect', {
        x: '154',
        y: '88',
        width: '34',
        height: '16',
        fill: 'rgba(78, 128, 184, 0.32)',
        stroke: 'rgba(138, 188, 240, 0.72)',
        'stroke-width': '1.2',
      }),
      mkSvg('rect', {
        x: '196',
        y: '110',
        width: '20',
        height: '32',
        fill: 'rgba(206, 76, 58, 0.38)',
        stroke: 'rgba(238, 112, 92, 0.82)',
        'stroke-width': '1.3',
      }),
      mkSvg('rect', {
        x: '194',
        y: '64',
        width: '20',
        height: '30',
        fill: 'rgba(206, 76, 58, 0.38)',
        stroke: 'rgba(238, 112, 92, 0.82)',
        'stroke-width': '1.3',
      }),
      mkSvg('rect', {
        x: '118',
        y: '64',
        width: '20',
        height: '28',
        fill: 'rgba(78, 128, 184, 0.32)',
        stroke: 'rgba(138, 188, 240, 0.72)',
        'stroke-width': '1.2',
      }),
      mkSvg('rect', {
        x: '118',
        y: '22',
        width: '100',
        height: '30',
        fill: 'rgba(186, 86, 62, 0.16)',
        stroke: 'rgba(222, 114, 88, 0.64)',
        'stroke-width': '1.2',
      }),
      mkSvg('path', {
        d: 'M 246 52 H 316 M 246 98 H 316 M 246 142 H 316',
        stroke: 'rgba(176, 198, 222, 0.55)',
        'stroke-width': '2.4',
      }),
      mkSvg('path', {
        d: 'M 282 174 V 28',
        stroke: 'rgba(229, 169, 60, 0.78)',
        'stroke-width': '1.5',
        'stroke-dasharray': '5 4',
      }),
      mkSvg('circle', { cx: '170', cy: '184', r: '4.5', fill: '#5bd68a' }),
    );

    if (!compact) {
      for (const [txt, x, y] of [
        ['WAREHOUSE', 62, 109],
        ['CUSTOMS', 168, 41],
        ['CONTAINERS', 168, 150],
        ['52M PIER', 282, 122],
        ['SPAWN', 170, 195],
      ] as const) {
        const t = mkSvg('text', {
          x: String(x),
          y: String(y),
          'text-anchor': 'middle',
          fill: 'rgba(234, 240, 248, 0.82)',
          'font-family': 'Barlow Condensed, sans-serif',
          'font-size': '10',
          'font-weight': '700',
          'letter-spacing': '1.1',
        });
        t.textContent = txt;
        svg.append(t);
      }
    }
  }

  return svg;
}

export function createModesScreen(
  container: HTMLElement,
  modeStore: ModeStore,
  audio: GameAudio,
  actions: {
    readonly onBack: () => void;
    readonly onDeploy: (modeId: GameModeId, mapId: MapId) => void;
  },
) {
  const screen = el('section', 'ui-screen modes-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Game Modes and Arena Maps');

  // Header
  const header = el('header', 'ui-screen__header loadout-header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'Mode & Arena Selection'),
    el('h1', 'ui-screen__title', 'Game Modes & Maps'),
  );
  const activeChip = el('div', 'modes-active-chip', 'Gun Game · Shoot House');
  header.append(titleBlock, activeChip);

  const shell = el('div', 'modes-shell');

  // === LEFT COLUMN: CLEAN MODE + MAP CARDS (NO PARAGRAPHS) ===
  const selectorCol = el('div', 'modes-selectors');

  const modeSection = el('div', 'modes-group');
  const modeHead = el('div', 'modes-group__head');
  modeHead.append(
    el('span', 'modes-group__step', '01'),
    el('span', 'modes-group__label', 'Game Mode'),
  );
  const modeGrid = el('div', 'modes-card-grid');
  const modeCards = new Map<GameModeId, HTMLButtonElement>();
  const modeBadges = new Map<GameModeId, HTMLElement>();
  modeSection.append(modeHead, modeGrid);

  const mapSection = el('div', 'modes-group');
  const mapHead = el('div', 'modes-group__head');
  mapHead.append(
    el('span', 'modes-group__step', '02'),
    el('span', 'modes-group__label', 'Arena Map'),
  );
  const mapGrid = el('div', 'modes-map-grid');
  const mapCards = new Map<MapId, HTMLButtonElement>();
  const mapBadges = new Map<MapId, HTMLElement>();
  mapSection.append(mapHead, mapGrid);

  selectorCol.append(modeSection, mapSection);

  // === RIGHT COLUMN: CLEAN GRAPHIC OVERVIEW ===
  const inspector = el('aside', 'modes-inspector');

  const inspTop = el('div', 'modes-inspector__top');
  const inspTitle = el('h2', 'modes-inspector__title', '');
  const actionRow = el('div', 'modes-actions');
  const applyBtn = el('button', 'modes-btn modes-btn--secondary');
  applyBtn.type = 'button';
  const applyBtnLabel = el('span', undefined, 'Active');
  applyBtn.append(createIcon('check'), applyBtnLabel);

  const deployBtn = el('button', 'modes-btn modes-btn--primary');
  deployBtn.type = 'button';
  deployBtn.dataset.action = 'deploy-mode';
  const deployBtnLabel = el('span', undefined, 'Deploy');
  deployBtn.append(createIcon('play'), deployBtnLabel);
  actionRow.append(applyBtn, deployBtn);
  inspTop.append(inspTitle, actionRow);

  // 4-cell KPI strip
  const kpiRow = el('div', 'modes-kpis');
  const kpiModeObj = el('span', 'modes-kpi__val', '');
  const kpiOpposition = el('span', 'modes-kpi__val', '');
  const kpiArenaSize = el('span', 'modes-kpi__val', '');
  const kpiLoadoutRule = el('span', 'modes-kpi__val', '');
  for (const [label, node] of [
    ['Objective', kpiModeObj],
    ['Opposition', kpiOpposition],
    ['Dimensions', kpiArenaSize],
    ['Loadout', kpiLoadoutRule],
  ] as const) {
    const cell = el('div', 'modes-kpi');
    cell.append(el('span', 'modes-kpi__label', label), node);
    kpiRow.append(cell);
  }

  // 8-Tier Weapon Strip
  const ladderBox = el('div', 'modes-ladder-box');
  const ladderHead = el('div', 'modes-ladder-box__head');
  const ladderTitle = el('span', 'modes-rules__heading', 'Gun Game Ladder');
  const ladderNote = el('span', 'modes-ladder-box__note', '1 Kill Per Tier');
  ladderHead.append(ladderTitle, ladderNote);

  const ladderTrack = el('div', 'modes-ladder-track');
  GUN_GAME_LADDER.forEach((weaponId, idx) => {
    const wSpec = getWeaponSpec(weaponId);
    const step = el('div', 'modes-ladder-step');
    step.dataset.final = idx === GUN_GAME_LADDER.length - 1 ? 'true' : 'false';
    const tierTag = el(
      'span',
      'modes-ladder-step__tier',
      idx === GUN_GAME_LADDER.length - 1 ? `T${idx + 1}★` : `T${idx + 1}`,
    );
    const svgWrap = el('div', 'modes-ladder-step__icon');
    svgWrap.append(createWeaponSilhouette(weaponId, 'modes-ladder-svg'));
    const wName = el('span', 'modes-ladder-step__name', wSpec.name);
    step.append(tierTag, svgWrap, wName);
    ladderTrack.append(step);
  });
  ladderBox.append(ladderHead, ladderTrack);

  // Clean Arena Schematic Panel
  const mapBox = el('div', 'modes-map-box');
  const mapBoxHead = el('div', 'modes-ladder-box__head');
  const mapBoxHeading = el('span', 'modes-rules__heading', 'Arena Layout');
  mapBoxHead.append(mapBoxHeading);
  const mapSvgHost = el('div', 'modes-map-svg-host');
  mapBox.append(mapBoxHead, mapSvgHost);

  inspector.append(inspTop, kpiRow, ladderBox, mapBox);
  shell.append(selectorCol, inspector);

  // Footer
  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('1 / 2', 'Mode'),
    createKeyHint('← / →', 'Map'),
    createKeyHint('Enter', 'Deploy'),
    createKeyHint('Esc', 'Back'),
  );
  const backBtn = el('button', 'ui-footer-btn');
  backBtn.type = 'button';
  backBtn.append(createIcon('back'), el('span', undefined, 'Back'));
  backBtn.addEventListener('click', () => {
    audio.start();
    audio.uiBack();
    actions.onBack();
  });
  footer.append(hints, backBtn);

  screen.append(header, shell, footer);
  container.append(screen);

  let isActive = false;
  let selectedModeId: GameModeId = modeStore.get();
  let selectedMapId: MapId = modeStore.getMap();
  let renderedSchematicMapId: MapId | null = null;

  function renderBriefing() {
    const activeSelection = modeStore.getSelection();
    const modeSpec: GameModeSpec = getGameModeSpec(selectedModeId);
    const mapSpec: GameMap = getMapById(selectedMapId);
    const isExactActive =
      activeSelection.mode === selectedModeId && activeSelection.mapId === selectedMapId;

    activeChip.textContent = `${getGameModeSpec(activeSelection.mode).name} · ${getMapById(activeSelection.mapId).name}`;
    inspTitle.textContent = `${modeSpec.name} — ${mapSpec.name}`;

    const widthM = mapSpec.bounds.maxX - mapSpec.bounds.minX;
    const depthM = mapSpec.bounds.maxZ - mapSpec.bounds.minZ;
    kpiModeObj.textContent = modeSpec.usesWeaponLadder ? '8 Tiers' : '16 Targets';
    kpiOpposition.textContent = modeSpec.usesEnemies ? `${modeSpec.enemyLimit} Hostiles` : 'None';
    kpiArenaSize.textContent = `${widthM} × ${depthM} m`;
    kpiLoadoutRule.textContent = modeSpec.usesWeaponLadder ? 'Auto-Swap' : 'Free Armory';

    ladderBox.dataset.mode = selectedModeId;
    if (modeSpec.usesWeaponLadder) {
      ladderTitle.textContent = 'Gun Game Ladder';
      ladderNote.textContent = '1 Kill Per Tier';
    } else {
      ladderTitle.textContent = 'Unlocked Armory';
      ladderNote.textContent = 'All 8 Weapons';
    }

    mapBoxHeading.textContent = `${mapSpec.name} Layout`;
    if (renderedSchematicMapId !== selectedMapId) {
      renderedSchematicMapId = selectedMapId;
      mapSvgHost.replaceChildren(buildMapSchematicSvg(selectedMapId, false));
    }

    applyBtn.dataset.equipped = isExactActive ? 'true' : 'false';
    applyBtnLabel.textContent = isExactActive ? 'Active' : 'Set Active';
    deployBtnLabel.textContent = `Deploy · ${modeSpec.name}`;

    for (const [id, card] of modeCards) {
      const selected = id === selectedModeId;
      const equipped = id === activeSelection.mode;
      card.dataset.inspected = selected ? 'true' : 'false';
      card.dataset.equipped = equipped ? 'true' : 'false';
      const badge = modeBadges.get(id);
      if (badge) {
        badge.textContent = equipped ? 'ACTIVE' : selected ? 'SELECTED' : 'MODE';
        badge.dataset.active = equipped ? 'true' : 'false';
      }
    }

    for (const [id, card] of mapCards) {
      const selected = id === selectedMapId;
      const equipped = id === activeSelection.mapId;
      card.dataset.inspected = selected ? 'true' : 'false';
      card.dataset.equipped = equipped ? 'true' : 'false';
      const badge = mapBadges.get(id);
      if (badge) {
        badge.textContent = equipped ? 'ACTIVE' : selected ? 'SELECTED' : 'MAP';
        badge.dataset.active = equipped ? 'true' : 'false';
      }
    }
  }

  function selectMode(id: GameModeId, commitToStore: boolean, playSound: boolean) {
    if (id !== selectedModeId && playSound) audio.uiSelect();
    selectedModeId = id;
    if (commitToStore) modeStore.set(id);
    renderBriefing();
  }

  function selectMap(id: MapId, commitToStore: boolean, playSound: boolean) {
    if (id !== selectedMapId && playSound) audio.uiSelect();
    selectedMapId = id;
    if (commitToStore) modeStore.setMap(id);
    renderBriefing();
  }

  // Clean Mode Cards — Title + Short Tag ONLY (zero paragraphs)
  for (const spec of GAME_MODE_LIST) {
    const card = el('button', 'modes-card');
    card.type = 'button';
    card.dataset.modeId = spec.id;

    const top = el('div', 'modes-card__top');
    const nameWrap = el('div', 'modes-card__title-wrap');
    nameWrap.append(
      createIcon(spec.usesWeaponLadder ? 'modes' : 'target', 'modes-card__icon'),
      el('span', 'modes-card__name', spec.name),
    );
    const badge = el('span', 'modes-card__badge', 'MODE');
    modeBadges.set(spec.id, badge);
    top.append(nameWrap, badge);
    card.append(top);

    card.addEventListener('pointerenter', () => {
      if (selectedModeId !== spec.id) audio.uiHover();
    });
    card.addEventListener('click', () => {
      audio.start();
      selectMode(spec.id, true, true);
    });

    modeCards.set(spec.id, card);
    modeGrid.append(card);
  }

  // Clean Map Cards — Schematic Thumbnail + Title + Dimensions Tag ONLY (zero paragraphs)
  for (const map of MAP_LIST) {
    const card = el('button', 'modes-map-card');
    card.type = 'button';
    card.dataset.mapId = map.id;

    const thumb = el('div', 'modes-map-card__thumb');
    thumb.append(buildMapSchematicSvg(map.id, true));

    const body = el('div', 'modes-map-card__body');
    const top = el('div', 'modes-card__top');
    const name = el('span', 'modes-card__name', map.name);
    const badge = el('span', 'modes-card__badge', 'MAP');
    mapBadges.set(map.id, badge);
    top.append(name, badge);
    body.append(top);

    card.append(thumb, body);

    card.addEventListener('pointerenter', () => {
      if (selectedMapId !== map.id) audio.uiHover();
    });
    card.addEventListener('click', () => {
      audio.start();
      selectMap(map.id, true, true);
    });

    mapCards.set(map.id, card);
    mapGrid.append(card);
  }

  applyBtn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    modeStore.setSelection(selectedModeId, selectedMapId);
    renderBriefing();
  });

  deployBtn.addEventListener('click', () => {
    audio.start();
    audio.uiConfirm();
    modeStore.setSelection(selectedModeId, selectedMapId);
    actions.onDeploy(selectedModeId, selectedMapId);
  });

  modeStore.subscribe((sel) => {
    selectedModeId = sel.mode;
    selectedMapId = sel.mapId;
    renderBriefing();
  });

  window.addEventListener('keydown', (event) => {
    if (!isActive) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      audio.start();
      audio.uiBack();
      actions.onBack();
      return;
    }
    if (event.key === '1') {
      event.preventDefault();
      audio.start();
      selectMode('gungame', true, true);
      return;
    }
    if (event.key === '2') {
      event.preventDefault();
      audio.start();
      selectMode('practice', true, true);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      audio.start();
      const nextMode: GameModeId = selectedModeId === 'gungame' ? 'practice' : 'gungame';
      selectMode(nextMode, true, true);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      audio.start();
      const nextMap: MapId = selectedMapId === 'shoot-house' ? 'cargo-yard' : 'shoot-house';
      selectMap(nextMap, true, true);
      return;
    }
    if (event.key === 'Enter') {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'BUTTON') return;
      event.preventDefault();
      audio.start();
      audio.uiConfirm();
      modeStore.setSelection(selectedModeId, selectedMapId);
      actions.onDeploy(selectedModeId, selectedMapId);
    }
  });

  renderBriefing();

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      if (active) {
        selectedModeId = modeStore.get();
        selectedMapId = modeStore.getMap();
        renderBriefing();
      }
    },
    inspect(modeId: GameModeId, mapId?: MapId) {
      selectedModeId = modeId;
      if (mapId) selectedMapId = mapId;
      renderBriefing();
    },
    inspectMap(mapId: MapId) {
      selectedMapId = mapId;
      renderBriefing();
    },
  };
}
