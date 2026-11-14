import type { GameAudio } from '../audio';
import { el } from './dom';
import type { IconName } from './icons';
import { createIcon } from './icons';
import { createKeycap, createKeyHint } from './keycaps';
import type { CrosshairColorId, GameSettings, SettingsStore } from './settings';
import { CROSSHAIR_COLORS, CROSSHAIR_SIZES } from './settings';

type TabId = 'controls' | 'gameplay' | 'audio' | 'interface';
type DiagramKind = 'sensitivity' | 'stance' | 'switch' | 'fov' | 'audio' | 'crosshair' | 'hud';

interface SettingDescriptor {
  readonly key: keyof GameSettings;
  readonly tab: TabId;
  readonly section: string;
  readonly label: string;
  readonly description: string;
  readonly diagram: DiagramKind;
}

const SETTING_SPECS: readonly SettingDescriptor[] = [
  {
    key: 'mouseSensitivity',
    tab: 'controls',
    section: 'Mouse & Aiming',
    label: 'Mouse Sensitivity',
    description:
      'Scales horizontal and vertical turn speed during hipfire movement across all weapons.',
    diagram: 'sensitivity',
  },
  {
    key: 'adsSensitivity',
    tab: 'controls',
    section: 'Mouse & Aiming',
    label: 'ADS Sensitivity Multiplier',
    description:
      'Fine-tunes aim speed relative to optical magnification while aiming down sights or through the 6× sniper scope.',
    diagram: 'sensitivity',
  },
  {
    key: 'aimMode',
    tab: 'controls',
    section: 'Stance & Switching',
    label: 'Aim Down Sights Mode',
    description:
      'Choose whether Right Click holds your sights up continuously or toggles ADS on and off with each click.',
    diagram: 'stance',
  },
  {
    key: 'leanMode',
    tab: 'controls',
    section: 'Stance & Switching',
    label: 'Tactical Lean Mode',
    description:
      'Choose whether Q and E hold a corner peek or toggle lean on until pressed again or swapped to the opposite side.',
    diagram: 'stance',
  },
  {
    key: 'scrollWeaponSwitch',
    tab: 'controls',
    section: 'Stance & Switching',
    label: 'Mouse Wheel Weapon Switch',
    description:
      'Allows scrolling the mouse wheel to toggle quickly between your Primary [1] and Secondary [2] firearms.',
    diagram: 'switch',
  },
  {
    key: 'fov',
    tab: 'gameplay',
    section: 'Camera & Vision',
    label: 'Field of View',
    description:
      'Controls vertical-derived horizontal field of view across Shoot House. Wider angles reveal more peripheral cover.',
    diagram: 'fov',
  },
  {
    key: 'reducedMotion',
    tab: 'gameplay',
    section: 'Accessibility & Comfort',
    label: 'Reduced Motion',
    description:
      'Dampens interface slide transitions, hipfire crosshair kick, and title backdrop drift.',
    diagram: 'hud',
  },
  {
    key: 'showTacticalFeed',
    tab: 'gameplay',
    section: 'Accessibility & Comfort',
    label: 'Tactical Event Feed & Stance',
    description:
      'Displays live target-down distance callouts and bottom-left Lean / Sprint stance pills during a run.',
    diagram: 'hud',
  },
  {
    key: 'masterVolume',
    tab: 'audio',
    section: 'Output Mix',
    label: 'Master Volume',
    description:
      'Scales overall output across weapon reports, steel target rings, shell casings, footsteps, and range ambience.',
    diagram: 'audio',
  },
  {
    key: 'uiAudioCues',
    tab: 'audio',
    section: 'Interface Audio',
    label: 'Menu & Telemetry Cues',
    description:
      'Enables subtle mechanical hover clicks, confirmation tones, and course-clear chimes in menus and HUD.',
    diagram: 'audio',
  },
  {
    key: 'crosshairColor',
    tab: 'interface',
    section: 'Hipfire Reticle',
    label: 'Crosshair Colour',
    description:
      'Selects high-contrast reticle tint tuned for sunlit concrete, weathered plywood, and shaded breach rooms.',
    diagram: 'crosshair',
  },
  {
    key: 'crosshairSize',
    tab: 'interface',
    section: 'Hipfire Reticle',
    label: 'Crosshair Size',
    description:
      'Scales the centre precision dot and dynamic spread arms of the hipfire crosshair.',
    diagram: 'crosshair',
  },
  {
    key: 'hudScale',
    tab: 'interface',
    section: 'HUD Layout',
    label: 'HUD Scale',
    description:
      'Scales top objective progress, bottom-right firearm readout, reload prompts, and event feed cards.',
    diagram: 'hud',
  },
];

const TABS: readonly { readonly id: TabId; readonly label: string; readonly icon: IconName }[] = [
  { id: 'controls', label: 'Controls', icon: 'controls' },
  { id: 'gameplay', label: 'Gameplay', icon: 'gameplay' },
  { id: 'audio', label: 'Audio', icon: 'audio' },
  { id: 'interface', label: 'Interface', icon: 'interface' },
];

function formatSettingValue(key: keyof GameSettings, settings: GameSettings): string {
  switch (key) {
    case 'mouseSensitivity':
      return `${settings.mouseSensitivity.toFixed(2)}×`;
    case 'adsSensitivity':
      return `${settings.adsSensitivity.toFixed(2)}×`;
    case 'aimMode':
      return settings.aimMode === 'toggle' ? 'Toggle' : 'Hold';
    case 'leanMode':
      return settings.leanMode === 'toggle' ? 'Toggle' : 'Hold';
    case 'scrollWeaponSwitch':
      return settings.scrollWeaponSwitch ? 'On' : 'Off';
    case 'fov':
      return `${Math.round(settings.fov)}°`;
    case 'reducedMotion':
      return settings.reducedMotion ? 'On' : 'Off';
    case 'showTacticalFeed':
      return settings.showTacticalFeed ? 'Visible' : 'Minimal';
    case 'masterVolume':
      return `${Math.round(settings.masterVolume * 100)}%`;
    case 'uiAudioCues':
      return settings.uiAudioCues ? 'On' : 'Off';
    case 'crosshairColor':
      return CROSSHAIR_COLORS[settings.crosshairColor].label;
    case 'crosshairSize':
      return CROSSHAIR_SIZES[settings.crosshairSize].label;
    case 'hudScale':
      return `${Math.round(settings.hudScale * 100)}%`;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(viewBox: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

export function createSettingsScreen(
  container: HTMLElement,
  store: SettingsStore,
  audio: GameAudio,
  onBack: () => void,
) {
  const screen = el('section', 'ui-screen settings-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Settings');

  // Header with global modified indicator
  const header = el('header', 'ui-screen__header settings-header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'System Configuration · Live Sync'),
    el('h1', 'ui-screen__title', 'Settings'),
  );
  const modifiedSummary = el('div', 'settings-modified-pill', 'Default Profile');
  header.append(titleBlock, modifiedSummary);

  // Framed architectural settings shell (eliminates floating empty-canvas feel)
  const frame = el('div', 'subscreen__frame settings-shell');

  // Top Tab Bar with [Q] / [E] hints, icons, and modified badges
  const tabBar = el('div', 'settings-tabs');
  tabBar.setAttribute('role', 'tablist');
  const qHint = createKeycap('Q');
  const eHint = createKeycap('E');
  qHint.classList.add('tabs-key-hint');
  eHint.classList.add('tabs-key-hint');
  tabBar.append(qHint);

  const tabButtons = new Map<TabId, { btn: HTMLButtonElement; dot: HTMLElement }>();
  for (const tab of TABS) {
    const btn = el('button', 'settings-tab');
    btn.type = 'button';
    btn.role = 'tab';
    btn.dataset.tab = tab.id;
    const dot = el('span', 'settings-tab__mod');
    dot.hidden = true;
    btn.append(createIcon(tab.icon), el('span', undefined, tab.label), dot);
    btn.addEventListener('pointerenter', () => {
      audio.uiHover();
    });
    btn.addEventListener('click', () => {
      audio.start();
      audio.uiSelect();
      setActiveTab(tab.id);
    });
    tabButtons.set(tab.id, { btn, dot });
    tabBar.append(btn);
  }
  tabBar.append(eHint);

  // Split Workspace: Left Control Panel + Right Contextual Telemetry Inspector
  const workspace = el('div', 'settings-workspace');
  const panelHost = el('div', 'settings-panel-host');

  // Right Inspector Panel
  const inspector = el('aside', 'settings-inspector');
  const inspectorHead = el('div', 'settings-inspector__head');
  const inspectorEyebrow = el('span', 'settings-inspector__eyebrow', 'Controls · Mouse & Aiming');
  const inspectorModTag = el('span', 'settings-inspector__badge', 'Modified');
  inspectorModTag.hidden = true;
  inspectorHead.append(inspectorEyebrow, inspectorModTag);

  const inspectorTitle = el('h2', 'settings-inspector__title', 'Mouse Sensitivity');
  const inspectorDesc = el('p', 'settings-inspector__desc', '');

  // Rich Contextual Visual Preview Box (tailored SVG/UI preview per setting!)
  const visualStage = el('div', 'settings-visual');
  const visualCanvas = el('div', 'settings-visual__canvas');
  const visualCaption = el('span', 'settings-visual__caption', 'Live Preview');
  visualStage.append(visualCanvas, visualCaption);

  const inspectorFoot = el('div', 'settings-inspector__foot');
  const inspectorMeta = el('div', 'settings-inspector__meta');
  const inspectorDefault = el('span', undefined, 'Default: 1.00×');
  const inspectorCurrent = el('span', undefined, 'Current: 1.00×');
  inspectorMeta.append(inspectorDefault, inspectorCurrent);

  const resetFocusedBtn = el('button', 'settings-inspector__reset');
  resetFocusedBtn.type = 'button';
  resetFocusedBtn.append(createIcon('reset'), el('span', undefined, 'Restore Default'));
  resetFocusedBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  resetFocusedBtn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    store.resetKey(focusedKey);
  });
  inspectorFoot.append(inspectorMeta, resetFocusedBtn);

  inspector.append(inspectorHead, inspectorTitle, visualStage, inspectorDesc, inspectorFoot);
  workspace.append(panelHost, inspector);
  frame.append(tabBar, workspace);

  // Footer
  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(createKeyHint('Q / E', 'Switch Tab'), createKeyHint('Esc', 'Back'));
  const footerActions = el('div', 'settings-footer-actions');

  const resetTabBtn = el('button', 'ui-footer-btn');
  resetTabBtn.type = 'button';
  resetTabBtn.append(createIcon('reset'), el('span', undefined, 'Reset Tab'));
  resetTabBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  resetTabBtn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    const tabKeys = SETTING_SPECS.filter((s) => s.tab === activeTab).map((s) => s.key);
    store.resetKeys(tabKeys);
  });

  const resetAllBtn = el('button', 'ui-footer-btn');
  resetAllBtn.type = 'button';
  resetAllBtn.append(createIcon('reset'), el('span', undefined, 'Reset All'));
  resetAllBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  resetAllBtn.addEventListener('click', () => {
    audio.start();
    audio.uiSelect();
    store.resetAll();
  });

  const backBtn = el('button', 'ui-footer-btn ui-footer-btn--primary');
  backBtn.type = 'button';
  backBtn.append(createIcon('back'), el('span', undefined, 'Back'));
  backBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  backBtn.addEventListener('click', () => {
    audio.start();
    audio.uiBack();
    onBack();
  });

  footerActions.append(resetTabBtn, resetAllBtn, backBtn);
  footer.append(hints, footerActions);

  screen.append(header, frame, footer);
  container.append(screen);

  // Render contextual live visual diagram inside the right-hand inspector!
  function renderInspectorDiagram(spec: SettingDescriptor, s: GameSettings) {
    visualCanvas.replaceChildren();

    switch (spec.diagram) {
      case 'fov': {
        visualCaption.textContent = `Horizontal Frustum · ${Math.round(s.fov)}° Cone`;
        const svg = makeSvg('0 0 260 132', 'settings-diagram-svg');
        const halfRad = ((s.fov / 2) * Math.PI) / 180;
        const ox = 130;
        const oy = 114;
        const r = 92;
        const lx = ox - Math.sin(halfRad) * r;
        const ly = oy - Math.cos(halfRad) * r;
        const rx = ox + Math.sin(halfRad) * r;
        const ry = oy - Math.cos(halfRad) * r;
        // Subtle reference grid arcs
        for (const gr of [36, 64, 92]) {
          const arc = document.createElementNS(SVG_NS, 'path');
          arc.setAttribute('d', `M ${ox - gr} ${oy} A ${gr} ${gr} 0 0 1 ${ox + gr} ${oy}`);
          arc.setAttribute('fill', 'none');
          arc.setAttribute('stroke', 'rgba(230,238,248,0.12)');
          arc.setAttribute('stroke-width', '1');
          svg.append(arc);
        }
        // Live FOV wedge
        const wedge = document.createElementNS(SVG_NS, 'path');
        wedge.setAttribute('d', `M ${ox} ${oy} L ${lx} ${ly} A ${r} ${r} 0 0 1 ${rx} ${ry} Z`);
        wedge.setAttribute('fill', 'rgba(229,169,60,0.22)');
        wedge.setAttribute('stroke', '#e5a93c');
        wedge.setAttribute('stroke-width', '2');
        svg.append(wedge);
        // Camera point
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(ox));
        dot.setAttribute('cy', String(oy));
        dot.setAttribute('r', '4.5');
        dot.setAttribute('fill', '#f4f7fb');
        svg.append(dot);
        // Angle readout text
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', String(ox));
        txt.setAttribute('y', '42');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#f4f7fb');
        txt.setAttribute('font-family', '"Barlow Condensed", sans-serif');
        txt.setAttribute('font-size', '20');
        txt.setAttribute('font-weight', '700');
        txt.textContent = `${Math.round(s.fov)}°`;
        svg.append(txt);
        visualCanvas.append(svg);
        break;
      }

      case 'sensitivity': {
        const hipDeg = Math.round(s.mouseSensitivity * 180);
        const adsDeg = Math.round(s.mouseSensitivity * s.adsSensitivity * 180);
        visualCaption.textContent = `Turn Arc · Hip ${s.mouseSensitivity.toFixed(2)}× / ADS ${s.adsSensitivity.toFixed(2)}×`;
        const wrap = el('div', 'diagram-bars');
        for (const [lbl, val, max, highlight] of [
          ['Hipfire Turn Rate', hipDeg, 540, spec.key === 'mouseSensitivity'],
          ['ADS Fine Turn Rate', adsDeg, 540, spec.key === 'adsSensitivity'],
        ] as const) {
          const item = el('div', 'diagram-bar-item');
          const top = el('div', 'diagram-bar-item__top');
          top.append(el('span', undefined, lbl), el('span', 'ui-tabular', `${val}°/pad`));
          const track = el('div', 'diagram-bar-item__track');
          const fill = el('div', 'diagram-bar-item__fill');
          fill.style.width = `${Math.min(100, (val / max) * 100).toFixed(1)}%`;
          fill.dataset.active = highlight ? 'true' : 'false';
          track.append(fill);
          item.append(top, track);
          wrap.append(item);
        }
        visualCanvas.append(wrap);
        break;
      }

      case 'stance': {
        const isAim = spec.key === 'aimMode';
        const modeVal = isAim ? s.aimMode : s.leanMode;
        visualCaption.textContent = isAim
          ? `Right Click · ${modeVal === 'hold' ? 'Hold to Aim' : 'Tap to Toggle ADS'}`
          : `Q / E Corner Peek · ${modeVal === 'hold' ? 'Hold to Lean' : 'Tap to Toggle Lean'}`;
        const diag = el('div', 'diagram-pills');
        const keys = isAim ? ['RMB'] : ['Q', 'E'];
        for (const k of keys) diag.append(createKeycap(k));
        const arrow = el('span', 'diagram-pills__arrow', '→');
        const stateBadge = el(
          'span',
          'diagram-pills__badge',
          modeVal === 'hold' ? 'Active While Held' : 'Latches Until Pressed Again',
        );
        diag.append(arrow, stateBadge);
        visualCanvas.append(diag);
        break;
      }

      case 'switch': {
        visualCaption.textContent = s.scrollWeaponSwitch
          ? 'Scroll Wheel Active · Swaps Primary ⇄ Secondary'
          : 'Scroll Wheel Disabled · Use Keys [1] & [2]';
        const diag = el('div', 'diagram-pills');
        diag.append(
          createKeycap('1'),
          el('span', 'diagram-pills__badge', s.scrollWeaponSwitch ? '⇄ Scroll ⇄' : 'Direct Keys'),
          createKeycap('2'),
        );
        visualCanvas.append(diag);
        break;
      }

      case 'audio': {
        const pct = Math.round(s.masterVolume * 100);
        visualCaption.textContent = `Master Output ${pct}% · UI Cues ${s.uiAudioCues ? 'Active' : 'Muted'}`;
        const eq = el('div', 'diagram-meter');
        const bands = [
          ['Gunfire', 1.0, s.masterVolume],
          ['Steel Hits', 0.62, s.masterVolume],
          ['Handling', 0.36, s.masterVolume],
          ['Menu Cues', 0.28, s.uiAudioCues ? s.masterVolume : 0],
        ] as const;
        for (const [label, ratio, mult] of bands) {
          const col = el('div', 'diagram-meter__col');
          const track = el('div', 'diagram-meter__track');
          const bar = el('div', 'diagram-meter__fill');
          bar.style.height = `${Math.round(ratio * mult * 100)}%`;
          track.append(bar);
          col.append(track, el('span', 'diagram-meter__label', label));
          eq.append(col);
        }
        visualCanvas.append(eq);
        break;
      }

      case 'crosshair': {
        visualCaption.textContent = `${CROSSHAIR_COLORS[s.crosshairColor].label} · ${CROSSHAIR_SIZES[s.crosshairSize].label} Reticle`;
        // Split range background (sunlit plywood vs shaded concrete) to test contrast live!
        const split = el('div', 'diagram-reticle-stage');
        const reticle = el('div', 'settings-preview__reticle');
        reticle.style.setProperty('--ui-crosshair-color', CROSSHAIR_COLORS[s.crosshairColor].hex);
        reticle.style.setProperty(
          '--ui-crosshair-scale',
          String(CROSSHAIR_SIZES[s.crosshairSize].scale),
        );
        const dot = el('span', 'hud-crosshair__dot');
        const top = el('span', 'hud-crosshair__arm hud-crosshair__arm--top');
        const bottom = el('span', 'hud-crosshair__arm hud-crosshair__arm--bottom');
        const left = el('span', 'hud-crosshair__arm hud-crosshair__arm--left');
        const right = el('span', 'hud-crosshair__arm hud-crosshair__arm--right');
        top.style.transform = 'translateY(-6px)';
        bottom.style.transform = 'translateY(6px)';
        left.style.transform = 'translateX(-6px)';
        right.style.transform = 'translateX(6px)';
        reticle.append(dot, top, bottom, left, right);
        split.append(reticle);
        visualCanvas.append(split);
        break;
      }

      case 'hud': {
        visualCaption.textContent = `HUD Scale ${Math.round(s.hudScale * 100)}% · Feed ${s.showTacticalFeed ? 'On' : 'Off'}`;
        const mini = el('div', 'diagram-hud-mini');
        const topBar = el('span', 'diagram-hud-mini__top');
        topBar.style.transform = `translateX(-50%) scale(${s.hudScale})`;
        const weaponBox = el('span', 'diagram-hud-mini__weapon');
        weaponBox.style.transform = `scale(${s.hudScale})`;
        const feedBox = el('span', 'diagram-hud-mini__feed');
        feedBox.hidden = !s.showTacticalFeed;
        const stanceBox = el('span', 'diagram-hud-mini__stance');
        stanceBox.hidden = !s.showTacticalFeed;
        mini.append(topBar, feedBox, stanceBox, weaponBox);
        visualCanvas.append(mini);
        break;
      }
    }
  }

  // Row updaters so live store changes refresh all sliders, toggles, dots, and inspector
  const updaters: Array<(settings: GameSettings) => void> = [];
  const rowElements = new Map<keyof GameSettings, HTMLElement>();
  const rowModDots = new Map<keyof GameSettings, HTMLElement>();
  const rowResetBtns = new Map<keyof GameSettings, HTMLButtonElement>();

  let isActive = false;
  let activeTab: TabId = 'controls';
  let focusedKey: keyof GameSettings = 'mouseSensitivity';

  function setFocused(key: keyof GameSettings) {
    focusedKey = key;
    const spec = SETTING_SPECS.find((s) => s.key === key) ?? SETTING_SPECS[0];
    if (!spec) return;
    const current = store.get();
    const defaults = store.defaults();
    const isMod = current[key] !== defaults[key];

    const tabLabel = TABS.find((t) => t.id === spec.tab)?.label ?? spec.tab;
    inspectorEyebrow.textContent = `${tabLabel} · ${spec.section}`;
    inspectorTitle.textContent = spec.label;
    inspectorDesc.textContent = spec.description;
    inspectorModTag.hidden = !isMod;
    inspectorDefault.textContent = `Default: ${formatSettingValue(key, defaults)}`;
    inspectorCurrent.textContent = `Current: ${formatSettingValue(key, current)}`;
    resetFocusedBtn.disabled = !isMod;

    for (const [k, row] of rowElements) {
      row.dataset.focused = k === key ? 'true' : 'false';
    }
    renderInspectorDiagram(spec, current);
  }

  function makeRowShell(spec: SettingDescriptor, controlEl: HTMLElement): HTMLElement {
    const row = el('div', 'setting-row');
    row.dataset.setting = spec.key;

    const labelWrap = el('div', 'setting-row__info');
    const modDot = el('span', 'setting-row__mod-dot');
    modDot.hidden = true;
    const title = el('span', 'setting-row__label', spec.label);
    labelWrap.append(modDot, title);

    const rightWrap = el('div', 'setting-row__right');
    const rowReset = el('button', 'setting-row__reset');
    rowReset.type = 'button';
    rowReset.title = `Reset ${spec.label} to default`;
    rowReset.append(createIcon('reset'));
    rowReset.hidden = true;
    rowReset.addEventListener('pointerenter', () => {
      audio.uiHover();
    });
    rowReset.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.start();
      audio.uiSelect();
      store.resetKey(spec.key);
    });
    rightWrap.append(controlEl, rowReset);

    row.append(labelWrap, rightWrap);
    row.addEventListener('pointerenter', () => {
      if (focusedKey !== spec.key) {
        audio.uiHover();
        setFocused(spec.key);
      }
    });
    row.addEventListener('focusin', () => {
      setFocused(spec.key);
    });

    rowElements.set(spec.key, row);
    rowModDots.set(spec.key, modDot);
    rowResetBtns.set(spec.key, rowReset);
    return row;
  }

  function buildSliderControl(
    key: 'mouseSensitivity' | 'adsSensitivity' | 'fov' | 'masterVolume' | 'hudScale',
    min: number,
    max: number,
    step: number,
    defaultVal: number,
  ): HTMLElement {
    const wrap = el('div', 'setting-slider');
    const trackWrap = el('div', 'setting-slider__track-wrap');
    const track = el('div', 'setting-slider__track');
    const fill = el('div', 'setting-slider__fill');
    const notch = el('span', 'setting-slider__default-notch');
    notch.style.left = `${(((defaultVal - min) / (max - min)) * 100).toFixed(1)}%`;
    track.append(fill, notch);

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'setting-slider__input';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);

    const readout = el('span', 'setting-slider__value ui-tabular', '');
    trackWrap.append(track, input);
    wrap.append(trackWrap, readout);

    input.addEventListener('input', () => {
      audio.start();
      store.update({ [key]: Number(input.value) });
    });
    input.addEventListener('change', () => {
      audio.uiSelect();
    });

    updaters.push((settings) => {
      const val = settings[key];
      input.value = String(val);
      const frac = (val - min) / (max - min);
      fill.style.width = `${(frac * 100).toFixed(1)}%`;
      readout.textContent = formatSettingValue(key, settings);
    });
    return wrap;
  }

  function buildSegmentedControl<K extends keyof GameSettings>(
    key: K,
    options: readonly { readonly value: GameSettings[K]; readonly label: string }[],
  ): HTMLElement {
    const group = el('div', 'setting-segmented');
    const buttons = options.map((opt) => {
      const btn = el('button', 'setting-segmented__btn', opt.label);
      btn.type = 'button';
      btn.addEventListener('pointerenter', () => {
        audio.uiHover();
      });
      btn.addEventListener('click', () => {
        audio.start();
        audio.uiSelect();
        store.update({ [key]: opt.value });
      });
      group.append(btn);
      return { value: opt.value, btn };
    });

    updaters.push((settings) => {
      for (const item of buttons) {
        const active = settings[key] === item.value;
        item.btn.dataset.active = active ? 'true' : 'false';
        item.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
    return group;
  }

  function buildColorSwatches(): HTMLElement {
    const group = el('div', 'setting-swatches');
    const ids = Object.keys(CROSSHAIR_COLORS) as CrosshairColorId[];
    const buttons = ids.map((id) => {
      const info = CROSSHAIR_COLORS[id];
      const btn = el('button', 'setting-swatch');
      btn.type = 'button';
      btn.title = info.label;
      btn.setAttribute('aria-label', info.label);
      const chip = el('span', 'setting-swatch__chip');
      chip.style.background = info.hex;
      btn.append(chip);
      btn.addEventListener('pointerenter', () => {
        audio.uiHover();
      });
      btn.addEventListener('click', () => {
        audio.start();
        audio.uiSelect();
        store.update({ crosshairColor: id });
      });
      group.append(btn);
      return { id, btn };
    });

    updaters.push((settings) => {
      for (const item of buttons) {
        const active = settings.crosshairColor === item.id;
        item.btn.dataset.active = active ? 'true' : 'false';
        item.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
    return group;
  }

  // Build panels grouped by Tab -> Section
  const defaults = store.defaults();
  const panels = new Map<TabId, HTMLElement>();

  function buildControlFor(spec: SettingDescriptor): HTMLElement {
    switch (spec.key) {
      case 'mouseSensitivity':
        return buildSliderControl('mouseSensitivity', 0.2, 3, 0.05, defaults.mouseSensitivity);
      case 'adsSensitivity':
        return buildSliderControl('adsSensitivity', 0.25, 2, 0.05, defaults.adsSensitivity);
      case 'aimMode':
        return buildSegmentedControl('aimMode', [
          { value: 'hold', label: 'Hold' },
          { value: 'toggle', label: 'Toggle' },
        ]);
      case 'leanMode':
        return buildSegmentedControl('leanMode', [
          { value: 'hold', label: 'Hold' },
          { value: 'toggle', label: 'Toggle' },
        ]);
      case 'scrollWeaponSwitch':
        return buildSegmentedControl('scrollWeaponSwitch', [
          { value: false, label: 'Off' },
          { value: true, label: 'On' },
        ]);
      case 'fov':
        return buildSliderControl('fov', 65, 105, 1, defaults.fov);
      case 'reducedMotion':
        return buildSegmentedControl('reducedMotion', [
          { value: false, label: 'Off' },
          { value: true, label: 'On' },
        ]);
      case 'showTacticalFeed':
        return buildSegmentedControl('showTacticalFeed', [
          { value: false, label: 'Minimal' },
          { value: true, label: 'Full' },
        ]);
      case 'masterVolume':
        return buildSliderControl('masterVolume', 0, 1, 0.05, defaults.masterVolume);
      case 'uiAudioCues':
        return buildSegmentedControl('uiAudioCues', [
          { value: false, label: 'Muted' },
          { value: true, label: 'Active' },
        ]);
      case 'crosshairColor':
        return buildColorSwatches();
      case 'crosshairSize':
        return buildSegmentedControl('crosshairSize', [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ]);
      case 'hudScale':
        return buildSliderControl('hudScale', 0.85, 1.2, 0.05, defaults.hudScale);
    }
  }

  for (const tab of TABS) {
    const panel = el('div', 'settings-panel');
    panel.dataset.tab = tab.id;
    panel.hidden = true;

    const specs = SETTING_SPECS.filter((s) => s.tab === tab.id);
    const sections = new Map<string, HTMLElement>();
    for (const spec of specs) {
      let card = sections.get(spec.section);
      if (!card) {
        card = el('section', 'settings-section');
        card.append(el('h3', 'settings-section__title', spec.section));
        sections.set(spec.section, card);
        panel.append(card);
      }
      card.append(makeRowShell(spec, buildControlFor(spec)));
    }

    panels.set(tab.id, panel);
    panelHost.append(panel);
  }

  function setActiveTab(tab: TabId) {
    activeTab = tab;
    for (const [id, entry] of tabButtons) {
      const selected = id === tab;
      entry.btn.dataset.selected = selected ? 'true' : 'false';
      entry.btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    for (const [id, panel] of panels) {
      panel.hidden = id !== tab;
    }
    const first = SETTING_SPECS.find((s) => s.tab === tab);
    if (first) setFocused(first.key);
  }

  store.subscribe((current) => {
    for (const update of updaters) update(current);

    let totalModified = 0;
    for (const tab of TABS) {
      const tabSpecs = SETTING_SPECS.filter((s) => s.tab === tab.id);
      let tabModified = 0;
      for (const spec of tabSpecs) {
        const mod = current[spec.key] !== defaults[spec.key];
        if (mod) {
          tabModified++;
          totalModified++;
        }
        const dot = rowModDots.get(spec.key);
        if (dot) dot.hidden = !mod;
        const rbtn = rowResetBtns.get(spec.key);
        if (rbtn) rbtn.hidden = !mod;
      }
      const tabEntry = tabButtons.get(tab.id);
      if (tabEntry) tabEntry.dot.hidden = tabModified === 0;
    }

    modifiedSummary.textContent =
      totalModified === 0
        ? 'All Defaults Active'
        : `${totalModified} Custom ${totalModified === 1 ? 'Setting' : 'Settings'}`;
    modifiedSummary.dataset.modified = totalModified > 0 ? 'true' : 'false';
    setFocused(focusedKey);
  });

  window.addEventListener('keydown', (event) => {
    if (!isActive) return;
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      audio.uiBack();
      onBack();
      return;
    }
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault();
      const idx = TABS.findIndex((t) => t.id === activeTab);
      const step = event.code === 'KeyE' ? 1 : -1;
      const next = TABS[(idx + step + TABS.length) % TABS.length];
      if (next) {
        audio.uiSelect();
        setActiveTab(next.id);
      }
    }
  });

  setActiveTab('controls');

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      if (active) setFocused(focusedKey);
    },
    selectTab(tab: TabId) {
      setActiveTab(tab);
    },
  };
}
