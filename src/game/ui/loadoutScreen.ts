import type { WeaponCategory, WeaponId, WeaponSpec } from '../../core/weapon';
import { getWeaponSpec, WEAPONS, weaponRpm } from '../../core/weapon';
import type { GameAudio } from '../audio';
import { createWeaponTurntable } from '../weapons/turntable';
import { el } from './dom';
import { createIcon, createWeaponSilhouette } from './icons';
import { createKeycap, createKeyHint } from './keycaps';
import type { LoadoutStore } from './loadout';

type CategoryTabId = 'all' | WeaponCategory;

const CATEGORY_TABS: readonly { readonly id: CategoryTabId; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'assault', label: 'Assault' },
  { id: 'smg', label: 'SMG' },
  { id: 'shotgun', label: 'Shotgun' },
  { id: 'sniper', label: 'Sniper' },
  { id: 'pistol', label: 'Pistols' },
];

const WEAPON_ROLES: Readonly<Record<WeaponId, string>> = {
  hk416:
    'Balanced 5.56mm tactical carbine fitted with an EOTech holographic sight for rapid target transitions across the yard.',
  ak47: 'Hard-hitting 7.62×39mm rifle with laminate furniture, open tangent iron sights, and stout controllable bursts.',
  'scar-h':
    'Heavy 7.62×51mm battle rifle in Flat Dark Earth with a 1.8× combat reflex optic for authoritative mid-to-long lanes.',
  mp5: 'Ultra-nimble 9×19mm roller-delayed submachine gun with hooded diopter irons and rapid handling inside the breach house.',
  'remington-870':
    '12-gauge pump-action tactical shotgun firing an 8-pellet buckshot pattern tailored for close-quarters breaching.',
  awm: 'Long-range .338 Lapua Magnum bolt-action precision rifle with a 6× mil-dot telescopic scope built for the 38 m lane.',
  m1911:
    'Classic .45 ACP Government Model sidearm — crisp iron sights, fast draw speed, and dependable close-range backup.',
  'desert-eagle':
    'Brushed stainless .50 AE magnum sidearm delivering massive report, long reach, and high-visibility 3-dot combat sights.',
};

const OPTIC_LABEL: Readonly<Record<WeaponSpec['scopeStyle'], string>> = {
  irons: 'Iron Sights',
  holo: 'EOTech Holo',
  reflex: 'Reflex Sight',
  telescopic: '6× Telescopic Scope',
};

const FIRE_MODE_LABEL: Readonly<Record<WeaponSpec['fireMode'], string>> = {
  auto: 'Full-Auto',
  semi: 'Semi-Auto',
  pump: 'Pump-Action',
  bolt: 'Bolt-Action',
};

interface StatDef {
  readonly label: string;
  readonly format: (spec: WeaponSpec) => string;
  /** 0..1 normalized fill where higher is stronger/better. */
  readonly score: (spec: WeaponSpec) => number;
}

const STAT_DEFS: readonly StatDef[] = [
  {
    label: 'Fire Rate',
    format: (s) => `${weaponRpm(s)} RPM`,
    score: (s) => Math.min(1, weaponRpm(s) / 900),
  },
  {
    label: 'Magazine',
    format: (s) => (s.pellets > 1 ? `${s.magazineSize} shells` : `${s.magazineSize} rds`),
    score: (s) => Math.min(1, s.magazineSize / 30),
  },
  {
    label: 'Reload Speed',
    format: (s) => `${s.reloadTime.toFixed(2)}s`,
    score: (s) => Math.max(0.15, Math.min(1, (3.4 - s.reloadTime) / 1.6)),
  },
  {
    label: 'ADS Handling',
    format: (s) => `${Math.round(s.aimTime * 1000)} ms`,
    score: (s) => Math.max(0.15, Math.min(1, (0.42 - s.aimTime) / 0.28)),
  },
  {
    label: 'Recoil Control',
    format: (s) => `${Math.round(Math.max(10, 100 - s.recoilKick * s.aimRecoilFactor * 1250))}`,
    score: (s) => Math.max(0.12, Math.min(1, 1 - s.recoilKick * s.aimRecoilFactor * 12.5)),
  },
  {
    label: 'Effective Range',
    format: (s) => `${s.range} m`,
    score: (s) => Math.min(1, Math.log10(s.range / 30) / Math.log10(500 / 30)),
  },
  {
    label: 'Optic Zoom',
    format: (s) => `${s.aimZoom.toFixed(s.aimZoom >= 2 ? 1 : 2).replace(/\.00$/, '')}×`,
    score: (s) => Math.min(1, (s.aimZoom - 1) / 5 + 0.14),
  },
];

export function createLoadoutScreen(
  container: HTMLElement,
  store: LoadoutStore,
  audio: GameAudio,
  actions: {
    readonly onBack: () => void;
    readonly onDeploy: (weaponId: WeaponId) => void;
  },
) {
  const screen = el('section', 'ui-screen loadout-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Loadout Armory');

  // Header + Active Carry Slots ([1] Primary & [2] Secondary)
  const header = el('header', 'ui-screen__header loadout-header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'Tactical Armory · 8 Weapons Ready'),
    el('h1', 'ui-screen__title', 'Loadout'),
  );

  const carryStrip = el('div', 'loadout-carry');
  const makeSlotBadge = (slotNum: '1' | '2', slotTitle: string) => {
    const btn = el('button', 'loadout-carry__slot');
    btn.type = 'button';
    const top = el('div', 'loadout-carry__top');
    top.append(createKeycap(slotNum), el('span', 'loadout-carry__slot-label', slotTitle));
    const name = el('span', 'loadout-carry__weapon', '');
    const cal = el('span', 'loadout-carry__caliber', '');
    btn.append(top, name, cal);
    return { btn, name, cal };
  };
  const primarySlotUi = makeSlotBadge('1', 'Primary');
  const secondarySlotUi = makeSlotBadge('2', 'Secondary');
  carryStrip.append(primarySlotUi.btn, secondarySlotUi.btn);
  header.append(titleBlock, carryStrip);

  // Main Framed Armory Shell
  const frame = el('div', 'subscreen__frame loadout-frame');

  // Category Tabs with [Q] / [E] hints
  const tabBar = el('div', 'settings-tabs loadout-tabs');
  tabBar.setAttribute('role', 'tablist');
  const tabButtons = new Map<CategoryTabId, HTMLButtonElement>();
  const qCap = createKeycap('Q');
  const eCap = createKeycap('E');
  qCap.classList.add('tabs-key-hint');
  eCap.classList.add('tabs-key-hint');
  tabBar.append(qCap);

  for (const tab of CATEGORY_TABS) {
    const btn = el('button', 'settings-tab');
    btn.type = 'button';
    btn.role = 'tab';
    btn.dataset.category = tab.id;
    const count =
      tab.id === 'all' ? WEAPONS.length : WEAPONS.filter((w) => w.category === tab.id).length;
    btn.append(el('span', undefined, tab.label), el('span', 'loadout-tab__count', String(count)));
    btn.addEventListener('pointerenter', () => {
      audio.uiHover();
    });
    btn.addEventListener('click', () => {
      audio.start();
      audio.uiSelect();
      setCategory(tab.id);
    });
    tabButtons.set(tab.id, btn);
    tabBar.append(btn);
  }
  tabBar.append(eCap);

  // 3-Column Armory Workspace: Weapon Rail | 3D Hero Stage | Real Stat Comparison Inspector
  const workspace = el('div', 'loadout-workspace');

  // Column 1: Weapon Selector Cards
  const listRail = el('div', 'loadout-list');

  // Column 2: 3D Turntable Preview Stage + Equip CTA
  const stagePanel = el('div', 'loadout-stage');
  const stageHeader = el('div', 'loadout-stage__header');
  const stageMeta = el('div', 'loadout-stage__meta');
  const stageSlotTag = el('span', 'loadout-stage__slot-tag', 'Primary Slot [1]');
  const stageName = el('h2', 'loadout-stage__name', 'HK416');
  const stageChips = el('div', 'loadout-stage__chips');
  const chipCaliber = el('span', 'loadout-chip');
  const chipMode = el('span', 'loadout-chip');
  const chipOptic = el('span', 'loadout-chip');
  stageChips.append(chipCaliber, chipMode, chipOptic);
  stageMeta.append(stageSlotTag, stageName, stageChips);
  stageHeader.append(stageMeta);

  const stageViewport = el('div', 'loadout-stage__viewport');
  const stageHint = el('span', 'loadout-stage__drag-hint', 'Drag to Orbit 360°');
  stageViewport.append(stageHint);
  const turntable = createWeaponTurntable(stageViewport);

  const stageFooter = el('div', 'loadout-stage__footer');
  const stageRole = el('p', 'loadout-stage__role', '');
  const stageActions = el('div', 'loadout-stage__actions');
  const equipBtn = el('button', 'loadout-equip-btn');
  equipBtn.type = 'button';
  const deployBtn = el('button', 'loadout-deploy-btn');
  deployBtn.type = 'button';
  deployBtn.append(createIcon('play'), el('span', undefined, 'Deploy'));
  stageActions.append(equipBtn, deployBtn);
  stageFooter.append(stageRole, stageActions);

  stagePanel.append(stageHeader, stageViewport, stageFooter);

  // Column 3: Real WeaponSpec Telemetry & Comparison Bars
  const statsPanel = el('aside', 'loadout-stats');
  const statsHeader = el('div', 'loadout-stats__header');
  const statsEyebrow = el('span', 'loadout-stats__eyebrow', 'Ballistic Profile');
  const statsCompare = el('span', 'loadout-stats__compare', 'vs Equipped Primary');
  statsHeader.append(statsEyebrow, statsCompare);

  const statsList = el('div', 'loadout-stats__list');
  const statRows = STAT_DEFS.map((def) => {
    const row = el('div', 'loadout-stat');
    const top = el('div', 'loadout-stat__top');
    const label = el('span', 'loadout-stat__label', def.label);
    const valWrap = el('div', 'loadout-stat__values');
    const value = el('span', 'loadout-stat__value', '');
    const delta = el('span', 'loadout-stat__delta', '');
    valWrap.append(value, delta);
    top.append(label, valWrap);

    const track = el('div', 'loadout-stat__track');
    const baseFill = el('div', 'loadout-stat__bar loadout-stat__bar--base');
    const diffFill = el('div', 'loadout-stat__bar loadout-stat__bar--diff');
    track.append(baseFill, diffFill);

    row.append(top, track);
    statsList.append(row);
    return { def, value, delta, baseFill, diffFill };
  });

  const payloadRow = el('div', 'loadout-stats__payload');
  const payloadLabel = el('span', 'loadout-stats__payload-label', 'Projectile Payload');
  const payloadValue = el('span', 'loadout-stats__payload-value', '1 Round');
  payloadRow.append(payloadLabel, payloadValue);

  statsPanel.append(statsHeader, statsList, payloadRow);

  workspace.append(listRail, stagePanel, statsPanel);
  frame.append(tabBar, workspace);

  // Footer
  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('Q / E', 'Category'),
    createKeyHint('↑ / ↓', 'Browse'),
    createKeyHint('Enter', 'Equip'),
    createKeyHint('Esc', 'Back'),
  );
  const backBtn = el('button', 'ui-footer-btn');
  backBtn.type = 'button';
  backBtn.append(createIcon('back'), el('span', undefined, 'Back'));
  backBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  backBtn.addEventListener('click', () => {
    audio.start();
    audio.uiBack();
    actions.onBack();
  });
  footer.append(hints, backBtn);

  screen.append(header, frame, footer);
  container.append(screen);

  // Screen state
  let isActive = false;
  let activeCategory: CategoryTabId = 'all';
  let inspectedId: WeaponId = store.get().primary;
  let visibleWeapons: readonly WeaponSpec[] = WEAPONS;
  const cardButtons = new Map<WeaponId, HTMLButtonElement>();

  function syncCarryStrip() {
    const loadout = store.get();
    const pri = getWeaponSpec(loadout.primary);
    const sec = getWeaponSpec(loadout.secondary);
    primarySlotUi.name.textContent = pri.name;
    primarySlotUi.cal.textContent = pri.caliber;
    primarySlotUi.btn.dataset.selected = inspectedId === pri.id ? 'true' : 'false';
    secondarySlotUi.name.textContent = sec.name;
    secondarySlotUi.cal.textContent = sec.caliber;
    secondarySlotUi.btn.dataset.selected = inspectedId === sec.id ? 'true' : 'false';
  }

  function renderWeaponList() {
    visibleWeapons =
      activeCategory === 'all' ? WEAPONS : WEAPONS.filter((w) => w.category === activeCategory);

    if (!visibleWeapons.some((w) => w.id === inspectedId)) {
      inspectedId = visibleWeapons[0]?.id ?? 'hk416';
    }

    listRail.replaceChildren();
    cardButtons.clear();
    const loadout = store.get();

    for (const spec of visibleWeapons) {
      const card = el('button', 'loadout-card');
      card.type = 'button';
      card.dataset.weaponId = spec.id;
      const isEquipped =
        (spec.slot === 'primary' && loadout.primary === spec.id) ||
        (spec.slot === 'secondary' && loadout.secondary === spec.id);
      card.dataset.equipped = isEquipped ? 'true' : 'false';
      card.dataset.selected = spec.id === inspectedId ? 'true' : 'false';

      const head = el('div', 'loadout-card__head');
      const titleGroup = el('div', 'loadout-card__titles');
      titleGroup.append(
        el('span', 'loadout-card__name', spec.name),
        el('span', 'loadout-card__caliber', spec.caliber),
      );
      const badge = el(
        'span',
        'loadout-card__badge',
        isEquipped ? `Equipped [${spec.slot === 'primary' ? '1' : '2'}]` : spec.slot.toUpperCase(),
      );
      head.append(titleGroup, badge);

      const sil = createWeaponSilhouette(spec.id, 'loadout-card__svg');
      const foot = el('div', 'loadout-card__foot');
      foot.append(
        el('span', undefined, FIRE_MODE_LABEL[spec.fireMode]),
        el('span', undefined, `${spec.magazineSize} ${spec.pellets > 1 ? 'SHL' : 'RDS'}`),
      );

      card.append(head, sil, foot);
      card.addEventListener('pointerenter', () => {
        audio.uiHover();
      });
      card.addEventListener('click', () => {
        audio.start();
        if (inspectedId === spec.id) {
          equipCurrent();
        } else {
          audio.uiSelect();
          inspectWeapon(spec.id);
        }
      });

      cardButtons.set(spec.id, card);
      listRail.append(card);
    }
  }

  function syncInspector() {
    const spec = getWeaponSpec(inspectedId);
    const loadout = store.get();
    const equippedId = spec.slot === 'primary' ? loadout.primary : loadout.secondary;
    const equippedSpec = getWeaponSpec(equippedId);
    const isEquipped = equippedId === spec.id;

    stageSlotTag.textContent = spec.slot === 'primary' ? 'Primary Slot [1]' : 'Secondary Slot [2]';
    stageName.textContent = spec.name;
    chipCaliber.textContent = spec.caliber;
    chipMode.textContent = FIRE_MODE_LABEL[spec.fireMode];
    chipOptic.textContent = OPTIC_LABEL[spec.scopeStyle];
    stageRole.textContent = WEAPON_ROLES[spec.id];

    equipBtn.replaceChildren();
    equipBtn.dataset.equipped = isEquipped ? 'true' : 'false';
    if (isEquipped) {
      equipBtn.append(
        createIcon('check'),
        el('span', undefined, `Equipped · Slot ${spec.slot === 'primary' ? '1' : '2'}`),
      );
    } else {
      equipBtn.append(
        el(
          'span',
          undefined,
          `Equip as ${spec.slot === 'primary' ? 'Primary [1]' : 'Secondary [2]'}`,
        ),
      );
    }

    statsCompare.textContent = isEquipped
      ? 'Currently Equipped'
      : `vs ${equippedSpec.name} (${spec.slot === 'primary' ? 'Slot 1' : 'Slot 2'})`;

    for (const row of statRows) {
      const valScore = row.def.score(spec);
      const refScore = row.def.score(equippedSpec);
      const diff = valScore - refScore;
      row.value.textContent = row.def.format(spec);

      if (isEquipped || Math.abs(diff) < 0.015) {
        row.delta.textContent = '';
        row.delta.dataset.tone = 'even';
        row.baseFill.style.width = `${(valScore * 100).toFixed(1)}%`;
        row.diffFill.style.width = '0%';
      } else if (diff > 0) {
        row.delta.textContent = '▲';
        row.delta.dataset.tone = 'up';
        row.baseFill.style.width = `${(refScore * 100).toFixed(1)}%`;
        row.diffFill.style.left = `${(refScore * 100).toFixed(1)}%`;
        row.diffFill.style.width = `${(diff * 100).toFixed(1)}%`;
        row.diffFill.dataset.tone = 'up';
      } else {
        row.delta.textContent = '▼';
        row.delta.dataset.tone = 'down';
        row.baseFill.style.width = `${(valScore * 100).toFixed(1)}%`;
        row.diffFill.style.left = `${(valScore * 100).toFixed(1)}%`;
        row.diffFill.style.width = `${(-diff * 100).toFixed(1)}%`;
        row.diffFill.dataset.tone = 'down';
      }
    }

    payloadValue.textContent =
      spec.pellets > 1
        ? `${spec.pellets} Pellets · 00 Buckshot`
        : `Single Projectile · ${spec.caliber}`;

    for (const [id, btn] of cardButtons) {
      btn.dataset.selected = id === inspectedId ? 'true' : 'false';
      const wSpec = getWeaponSpec(id);
      const eq =
        (wSpec.slot === 'primary' && loadout.primary === id) ||
        (wSpec.slot === 'secondary' && loadout.secondary === id);
      btn.dataset.equipped = eq ? 'true' : 'false';
      if (id === inspectedId) {
        btn.scrollIntoView({ block: 'nearest' });
      }
    }

    syncCarryStrip();
    turntable.setWeapon(inspectedId);
  }

  function inspectWeapon(id: WeaponId) {
    inspectedId = id;
    syncInspector();
  }

  function equipCurrent() {
    store.equip(inspectedId);
    audio.uiConfirm();
    renderWeaponList();
    syncInspector();
  }

  function setCategory(cat: CategoryTabId) {
    activeCategory = cat;
    for (const [id, btn] of tabButtons) {
      const selected = id === cat;
      btn.dataset.selected = selected ? 'true' : 'false';
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    renderWeaponList();
    syncInspector();
  }

  primarySlotUi.btn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    setCategory('all');
    inspectWeapon(store.get().primary);
  });
  secondarySlotUi.btn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    setCategory('pistol');
    inspectWeapon(store.get().secondary);
  });
  equipBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  equipBtn.addEventListener('click', () => {
    audio.start();
    equipCurrent();
  });
  deployBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  deployBtn.addEventListener('click', () => {
    audio.start();
    store.equip(inspectedId);
    audio.uiConfirm();
    actions.onDeploy(inspectedId);
  });

  store.subscribe(() => {
    if (isActive) {
      renderWeaponList();
      syncInspector();
    } else {
      syncCarryStrip();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!isActive) return;
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      audio.uiBack();
      actions.onBack();
      return;
    }
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault();
      const idx = CATEGORY_TABS.findIndex((t) => t.id === activeCategory);
      const step = event.code === 'KeyE' ? 1 : -1;
      const next = CATEGORY_TABS[(idx + step + CATEGORY_TABS.length) % CATEGORY_TABS.length];
      if (next) {
        audio.uiSelect();
        setCategory(next.id);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const idx = visibleWeapons.findIndex((w) => w.id === inspectedId);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = visibleWeapons[(idx + step + visibleWeapons.length) % visibleWeapons.length];
      if (next) {
        audio.uiHover();
        inspectWeapon(next.id);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      equipCurrent();
    }
  });

  setCategory('all');

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      turntable.setActive(active);
      if (active) {
        renderWeaponList();
        syncInspector();
        turntable.renderNow();
      }
    },
    inspect(id: WeaponId) {
      activeCategory = 'all';
      setCategory('all');
      inspectWeapon(id);
      if (isActive) turntable.renderNow();
    },
  };
}
