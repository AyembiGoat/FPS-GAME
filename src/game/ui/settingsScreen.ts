import type { GameAudio } from '../audio';
import { el } from './dom';
import { createIcon } from './icons';
import { createKeyHint } from './keycaps';
import type { CrosshairColorId, CrosshairSizeId, GameSettings, SettingsStore } from './settings';
import { CROSSHAIR_COLORS, CROSSHAIR_SIZES } from './settings';

type TabId = 'controls' | 'gameplay' | 'audio' | 'interface';

interface SettingDescriptor {
  readonly key: keyof GameSettings;
  readonly tab: TabId;
  readonly section: string;
  readonly label: string;
  readonly description: string;
  readonly showCrosshairPreview?: boolean;
}

const SETTING_SPECS: readonly SettingDescriptor[] = [
  {
    key: 'mouseSensitivity',
    tab: 'controls',
    section: 'Mouse & Aiming',
    label: 'Mouse Sensitivity',
    description: 'Scales horizontal and vertical look speed during hipfire movement.',
  },
  {
    key: 'adsSensitivity',
    tab: 'controls',
    section: 'Mouse & Aiming',
    label: 'ADS Sensitivity Multiplier',
    description: 'Adjusts fine-aim turn speed relative to zoom while aiming down the iron sights.',
  },
  {
    key: 'fov',
    tab: 'gameplay',
    section: 'Camera',
    label: 'Field of View',
    description: 'Sets horizontal peripheral vision angle in degrees across Shoot House.',
  },
  {
    key: 'reducedMotion',
    tab: 'gameplay',
    section: 'Accessibility & Comfort',
    label: 'Reduced Motion',
    description: 'Minimises interface slides, crosshair kick, and title camera drift.',
  },
  {
    key: 'masterVolume',
    tab: 'audio',
    section: 'Output Mix',
    label: 'Master Volume',
    description: 'Controls overall loudness of gunfire, steel impacts, footsteps, and menu cues.',
  },
  {
    key: 'crosshairColor',
    tab: 'interface',
    section: 'Crosshair',
    label: 'Crosshair Colour',
    description: 'Changes hipfire reticle tint for contrast against sunlit plywood and concrete.',
    showCrosshairPreview: true,
  },
  {
    key: 'crosshairSize',
    tab: 'interface',
    section: 'Crosshair',
    label: 'Crosshair Size',
    description: 'Scales the centre dot and dynamic spread arms of the hipfire reticle.',
    showCrosshairPreview: true,
  },
  {
    key: 'hudScale',
    tab: 'interface',
    section: 'HUD Layout',
    label: 'HUD Scale',
    description: 'Resizes peripheral objective, weapon, ammo, and event feed modules.',
  },
];

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'audio', label: 'Audio' },
  { id: 'interface', label: 'Interface' },
];

export function createSettingsScreen(
  container: HTMLElement,
  store: SettingsStore,
  audio: GameAudio,
  onBack: () => void,
) {
  const screen = el('section', 'ui-screen settings-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Settings');

  // Header
  const header = el('header', 'ui-screen__header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'System Configuration'),
    el('h1', 'ui-screen__title', 'Settings'),
  );
  header.append(titleBlock);

  // Frame: Tabs + Two-column workspace
  const frame = el('div', 'subscreen__frame');
  const tabBar = el('div', 'settings-tabs');
  tabBar.setAttribute('role', 'tablist');

  const workspace = el('div', 'settings-workspace');
  const panelHost = el('div', 'settings-panel-host');
  panelHost.style.minHeight = '0';

  // Right-hand Inspector Card
  const inspector = el('aside', 'settings-inspector');
  const inspectorEyebrow = el('span', 'settings-inspector__eyebrow', 'Focused Setting');
  const inspectorTitle = el('h2', 'settings-inspector__title', 'Mouse Sensitivity');
  const inspectorDesc = el('p', 'settings-inspector__desc', '');

  // Live Crosshair Preview (shown when inspecting Crosshair settings or Interface tab)
  const preview = el('div', 'settings-preview');
  preview.hidden = true;
  const previewReticle = el('div', 'settings-preview__reticle');
  const pDot = el('span', 'hud-crosshair__dot');
  const pTop = el('span', 'hud-crosshair__arm hud-crosshair__arm--top');
  const pBottom = el('span', 'hud-crosshair__arm hud-crosshair__arm--bottom');
  const pLeft = el('span', 'hud-crosshair__arm hud-crosshair__arm--left');
  const pRight = el('span', 'hud-crosshair__arm hud-crosshair__arm--right');
  pTop.style.transform = 'translateY(-6px)';
  pBottom.style.transform = 'translateY(6px)';
  pLeft.style.transform = 'translateX(-6px)';
  pRight.style.transform = 'translateX(6px)';
  previewReticle.append(pDot, pTop, pBottom, pLeft, pRight);
  preview.append(previewReticle, el('span', 'settings-preview__caption', 'Live Reticle Preview'));

  const inspectorMeta = el('div', 'settings-inspector__meta');
  const inspectorDefault = el('span', undefined, 'Default: 1.00x');
  const inspectorCurrent = el('span', undefined, 'Current: 1.00x');
  inspectorMeta.append(inspectorDefault, inspectorCurrent);

  inspector.append(inspectorEyebrow, inspectorTitle, inspectorDesc, preview, inspectorMeta);
  workspace.append(panelHost, inspector);
  frame.append(tabBar, workspace);

  // Footer
  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('Q / E', 'Switch Tab'),
    createKeyHint('Arrows', 'Navigate & Adjust'),
    createKeyHint('R', 'Reset Tab'),
    createKeyHint('Esc', 'Back'),
  );

  const footerActions = el('div', 'ui-screen__hints');
  const resetTabBtn = el('button', 'ui-footer-btn');
  resetTabBtn.type = 'button';
  resetTabBtn.append(createIcon('reset'), el('span', undefined, 'Reset Tab'));

  const backBtn = el('button', 'ui-footer-btn');
  backBtn.type = 'button';
  backBtn.append(createIcon('back'), el('span', undefined, 'Back'));

  footerActions.append(resetTabBtn, backBtn);
  footer.append(hints, footerActions);

  screen.append(header, frame, footer);
  container.append(screen);

  let activeTab: TabId = 'controls';
  let inspectedKey: keyof GameSettings = 'mouseSensitivity';
  let isActive = false;

  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const rowRefs = new Map<
    keyof GameSettings,
    {
      readonly row: HTMLElement;
      readonly sync: (settings: GameSettings, defaults: GameSettings) => void;
      readonly stepBy: (delta: number) => void;
    }
  >();

  function formatSettingValue(key: keyof GameSettings, settings: GameSettings): string {
    switch (key) {
      case 'mouseSensitivity':
        return `${settings.mouseSensitivity.toFixed(2)}×`;
      case 'adsSensitivity':
        return `${settings.adsSensitivity.toFixed(2)}×`;
      case 'fov':
        return `${Math.round(settings.fov)}°`;
      case 'masterVolume':
        return `${Math.round(settings.masterVolume * 100)}%`;
      case 'crosshairColor':
        return CROSSHAIR_COLORS[settings.crosshairColor].label;
      case 'crosshairSize':
        return CROSSHAIR_SIZES[settings.crosshairSize].label;
      case 'hudScale':
        return `${Math.round(settings.hudScale * 100)}%`;
      case 'reducedMotion':
        return settings.reducedMotion ? 'On' : 'Off';
    }
  }

  function updateInspector(key: keyof GameSettings) {
    inspectedKey = key;
    const spec = SETTING_SPECS.find((item) => item.key === key);
    if (!spec) return;
    const current = store.get();
    const defaults = store.defaults();
    inspectorEyebrow.textContent = spec.section;
    inspectorTitle.textContent = spec.label;
    inspectorDesc.textContent = spec.description;
    preview.hidden = !spec.showCrosshairPreview;
    inspectorDefault.textContent = `Default: ${formatSettingValue(key, defaults)}`;
    inspectorCurrent.textContent = `Current: ${formatSettingValue(key, current)}`;

    for (const [k, ref] of rowRefs) {
      ref.row.dataset.active = k === key ? 'true' : 'false';
    }
  }

  function createSliderControl(
    key: 'mouseSensitivity' | 'adsSensitivity' | 'fov' | 'masterVolume' | 'hudScale',
    min: number,
    max: number,
    step: number,
  ) {
    const wrap = el('div', 'ui-slider');
    const track = el('div', 'ui-slider__track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-valuemin', String(min));
    track.setAttribute('aria-valuemax', String(max));

    const rail = el('div', 'ui-slider__rail');
    const fill = el('div', 'ui-slider__fill');
    rail.append(fill);
    const thumb = el('div', 'ui-slider__thumb');
    track.append(rail, thumb);

    const readout = el('span', 'ui-slider__value');
    wrap.append(track, readout);

    const setFromFraction = (fraction: number) => {
      const clamped = Math.max(0, Math.min(1, fraction));
      const raw = min + clamped * (max - min);
      const stepped = Math.round(raw / step) * step;
      store.update({ [key]: stepped });
    };

    const handlePointer = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      setFromFraction((clientX - rect.left) / rect.width);
    };

    let dragging = false;
    track.addEventListener('pointerdown', (event) => {
      audio.start();
      dragging = true;
      track.setPointerCapture(event.pointerId);
      handlePointer(event.clientX);
      audio.uiSelect();
    });
    track.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      handlePointer(event.clientX);
    });
    track.addEventListener('pointerup', () => {
      dragging = false;
    });
    track.addEventListener('pointercancel', () => {
      dragging = false;
    });

    const stepBy = (delta: number) => {
      const next = store.get()[key] + delta * step;
      store.update({ [key]: next });
      audio.uiSelect();
    };

    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepBy(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepBy(1);
      }
    });

    return {
      element: wrap,
      stepBy,
      sync(settings: GameSettings) {
        const val = settings[key];
        const frac = Math.max(0, Math.min(1, (val - min) / (max - min)));
        fill.style.transform = `scaleX(${frac.toFixed(4)})`;
        thumb.style.left = `${(frac * 100).toFixed(2)}%`;
        const formatted = formatSettingValue(key, settings);
        readout.textContent = formatted;
        track.setAttribute('aria-valuenow', String(val));
        track.setAttribute('aria-valuetext', formatted);
      },
    };
  }

  function createToggleControl(key: 'reducedMotion') {
    const group = el('div', 'ui-segmented');
    group.setAttribute('role', 'radiogroup');
    const offBtn = el('button', 'ui-segmented__option', 'Off');
    offBtn.type = 'button';
    offBtn.setAttribute('role', 'radio');
    const onBtn = el('button', 'ui-segmented__option', 'On');
    onBtn.type = 'button';
    onBtn.setAttribute('role', 'radio');

    offBtn.addEventListener('click', () => {
      audio.start();
      store.update({ [key]: false });
      audio.uiSelect();
    });
    onBtn.addEventListener('click', () => {
      audio.start();
      store.update({ [key]: true });
      audio.uiSelect();
    });

    group.append(offBtn, onBtn);

    return {
      element: group,
      stepBy() {
        store.update({ [key]: !store.get()[key] });
        audio.uiSelect();
      },
      sync(settings: GameSettings) {
        const active = settings[key];
        offBtn.setAttribute('aria-checked', active ? 'false' : 'true');
        onBtn.setAttribute('aria-checked', active ? 'true' : 'false');
      },
    };
  }

  function createSizeControl() {
    const order: readonly CrosshairSizeId[] = ['small', 'medium', 'large'];
    const group = el('div', 'ui-segmented');
    group.setAttribute('role', 'radiogroup');
    const buttons = new Map<CrosshairSizeId, HTMLButtonElement>();

    for (const id of order) {
      const btn = el('button', 'ui-segmented__option', CROSSHAIR_SIZES[id].label);
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.addEventListener('click', () => {
        audio.start();
        store.update({ crosshairSize: id });
        audio.uiSelect();
      });
      buttons.set(id, btn);
      group.append(btn);
    }

    return {
      element: group,
      stepBy(delta: number) {
        const idx = order.indexOf(store.get().crosshairSize);
        const next = order[(idx + delta + order.length) % order.length];
        if (next) {
          store.update({ crosshairSize: next });
          audio.uiSelect();
        }
      },
      sync(settings: GameSettings) {
        for (const [id, btn] of buttons) {
          btn.setAttribute('aria-checked', settings.crosshairSize === id ? 'true' : 'false');
        }
      },
    };
  }

  function createColorSwatches() {
    const order: readonly CrosshairColorId[] = ['white', 'brass', 'cyan', 'green', 'red'];
    const group = el('div', 'ui-swatches');
    group.setAttribute('role', 'radiogroup');
    const buttons = new Map<CrosshairColorId, HTMLButtonElement>();

    for (const id of order) {
      const spec = CROSSHAIR_COLORS[id];
      const btn = el('button', 'ui-swatch');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', spec.label);
      btn.title = spec.label;
      const chip = el('span', 'ui-swatch__chip');
      chip.style.background = spec.hex;
      btn.append(chip);
      btn.addEventListener('click', () => {
        audio.start();
        store.update({ crosshairColor: id });
        audio.uiSelect();
      });
      buttons.set(id, btn);
      group.append(btn);
    }

    return {
      element: group,
      stepBy(delta: number) {
        const idx = order.indexOf(store.get().crosshairColor);
        const next = order[(idx + delta + order.length) % order.length];
        if (next) {
          store.update({ crosshairColor: next });
          audio.uiSelect();
        }
      },
      sync(settings: GameSettings) {
        for (const [id, btn] of buttons) {
          btn.setAttribute('aria-checked', settings.crosshairColor === id ? 'true' : 'false');
        }
      },
    };
  }

  function buildControlFor(key: keyof GameSettings) {
    switch (key) {
      case 'mouseSensitivity':
        return createSliderControl('mouseSensitivity', 0.2, 3, 0.05);
      case 'adsSensitivity':
        return createSliderControl('adsSensitivity', 0.25, 2, 0.05);
      case 'fov':
        return createSliderControl('fov', 65, 105, 1);
      case 'masterVolume':
        return createSliderControl('masterVolume', 0, 1, 0.05);
      case 'hudScale':
        return createSliderControl('hudScale', 0.85, 1.2, 0.05);
      case 'reducedMotion':
        return createToggleControl('reducedMotion');
      case 'crosshairSize':
        return createSizeControl();
      case 'crosshairColor':
        return createColorSwatches();
    }
  }

  function renderTab(tabId: TabId) {
    activeTab = tabId;
    for (const [id, btn] of tabButtons) {
      btn.setAttribute('aria-selected', id === tabId ? 'true' : 'false');
    }

    panelHost.replaceChildren();
    rowRefs.clear();

    const pane = el('div', 'settings-panel');
    const items = SETTING_SPECS.filter((spec) => spec.tab === tabId);
    const sections = new Map<string, SettingDescriptor[]>();
    for (const item of items) {
      const list = sections.get(item.section) ?? [];
      list.push(item);
      sections.set(item.section, list);
    }

    const current = store.get();
    const defaults = store.defaults();

    for (const [sectionTitle, rows] of sections) {
      const sectionEl = el('div', 'settings-section');
      sectionEl.append(el('div', 'settings-section__header', sectionTitle));

      for (const spec of rows) {
        const row = el('div', 'setting-row');
        row.dataset.setting = spec.key;
        const label = el('div', 'setting-row__label', spec.label);
        const controlWrap = el('div', 'setting-row__control');
        const control = buildControlFor(spec.key);
        controlWrap.append(control.element);

        const resetBtn = el('button', 'setting-row__reset');
        resetBtn.type = 'button';
        resetBtn.title = `Reset ${spec.label} to default`;
        resetBtn.setAttribute('aria-label', `Reset ${spec.label} to default`);
        resetBtn.append(createIcon('reset'));
        resetBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          audio.start();
          store.resetKey(spec.key);
          audio.uiBack();
        });

        row.addEventListener('pointerenter', () => {
          if (inspectedKey !== spec.key) {
            audio.uiHover();
            updateInspector(spec.key);
          }
        });
        row.addEventListener('focusin', () => {
          updateInspector(spec.key);
        });

        row.append(label, controlWrap, resetBtn);
        sectionEl.append(row);

        const sync = (s: GameSettings, d: GameSettings) => {
          control.sync(s);
          row.dataset.modified = s[spec.key] !== d[spec.key] ? 'true' : 'false';
        };
        sync(current, defaults);
        rowRefs.set(spec.key, { row, sync, stepBy: control.stepBy });
      }

      pane.append(sectionEl);
    }

    panelHost.append(pane);
    const first = items[0];
    if (first) updateInspector(first.key);
  }

  for (const tab of TABS) {
    const btn = el('button', 'settings-tab', tab.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.dataset.tab = tab.id;
    btn.addEventListener('pointerenter', () => {
      audio.uiHover();
    });
    btn.addEventListener('click', () => {
      audio.start();
      if (activeTab !== tab.id) {
        audio.uiSelect();
        renderTab(tab.id);
      }
    });
    tabButtons.set(tab.id, btn);
    tabBar.append(btn);
  }

  resetTabBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  resetTabBtn.addEventListener('click', () => {
    audio.start();
    const keys = SETTING_SPECS.filter((s) => s.tab === activeTab).map((s) => s.key);
    store.resetKeys(keys);
    audio.uiBack();
  });

  backBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  backBtn.addEventListener('click', () => {
    audio.start();
    audio.uiBack();
    onBack();
  });

  store.subscribe((settings) => {
    const defaults = store.defaults();
    for (const ref of rowRefs.values()) ref.sync(settings, defaults);
    inspectorCurrent.textContent = `Current: ${formatSettingValue(inspectedKey, settings)}`;
  });

  renderTab('controls');

  window.addEventListener('keydown', (event) => {
    if (!isActive) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      audio.uiBack();
      onBack();
      return;
    }
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault();
      const idx = TABS.findIndex((t) => t.id === activeTab);
      const delta = event.code === 'KeyE' ? 1 : -1;
      const next = TABS[(idx + delta + TABS.length) % TABS.length];
      if (next) {
        audio.uiSelect();
        renderTab(next.id);
      }
      return;
    }
    if (event.code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      const keys = SETTING_SPECS.filter((s) => s.tab === activeTab).map((s) => s.key);
      store.resetKeys(keys);
      audio.uiBack();
      return;
    }
    const items = SETTING_SPECS.filter((s) => s.tab === activeTab);
    if (items.length === 0) return;
    const currentIdx = Math.max(
      0,
      items.findIndex((s) => s.key === inspectedKey),
    );
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextSpec = items[(currentIdx + delta + items.length) % items.length];
      if (nextSpec) {
        audio.uiHover();
        updateInspector(nextSpec.key);
      }
    } else if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      !(
        document.activeElement instanceof HTMLElement &&
        document.activeElement.getAttribute('role') === 'slider'
      )
    ) {
      event.preventDefault();
      const ref = rowRefs.get(inspectedKey);
      ref?.stepBy(event.key === 'ArrowRight' ? 1 : -1);
    }
  });

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      if (active) renderTab(activeTab);
    },
    selectTab(tabId: TabId) {
      renderTab(tabId);
    },
  };
}
