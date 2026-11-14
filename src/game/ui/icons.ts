import type { WeaponId } from '../../core/weapon';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'play'
  | 'resume'
  | 'restart'
  | 'loadout'
  | 'settings'
  | 'controls'
  | 'gameplay'
  | 'audio'
  | 'interface'
  | 'check'
  | 'quit'
  | 'back'
  | 'reset'
  | 'chevronLeft'
  | 'chevronRight'
  | 'leanLeft'
  | 'leanRight'
  | 'sprint'
  | 'target'
  | 'mouseLeft'
  | 'mouseRight'
  | 'mouseMove'
  | 'modes'
  | 'hostile';

function svgRoot(viewBox: string, className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  return svg;
}

function strokePath(d: string, width = '1.6'): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', width);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  return path;
}

function fillPath(d: string, opacity?: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  if (opacity) path.setAttribute('fill-opacity', opacity);
  return path;
}

export function createIcon(name: IconName, className = 'ui-icon'): SVGSVGElement {
  const svg = svgRoot('0 0 20 20', className);
  switch (name) {
    case 'play':
      svg.append(fillPath('M6.5 4.6L15.6 10L6.5 15.4V4.6Z'));
      break;
    case 'resume':
      svg.append(strokePath('M4.5 5v10'), fillPath('M8.5 5.2L16 10l-7.5 4.8V5.2Z'));
      break;
    case 'restart':
      svg.append(strokePath('M4.6 8.2A5.8 5.8 0 1 1 5.4 13.8'), strokePath('M4.2 4.6v3.8H8'));
      break;
    case 'loadout':
      svg.append(
        strokePath('M2.2 9.5h11.5l1.6-1.2h2.4v4.4h-2.5l-1.5-1.2H8.5l-.8 3.2h-2l.6-3.2H4.5'),
        strokePath('M10.5 11.5l1.2 3.8h1.8l-1-3.8'),
        strokePath('M7.5 7.5h3.6v2H7.5z'),
      );
      break;
    case 'settings':
      svg.append(
        strokePath('M3.5 6h5m3 0h5M3.5 10h9m3 0h1M3.5 14h2m3 0h8'),
        strokePath('M10 4.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z'),
        strokePath('M14 8.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z'),
        strokePath('M7 12.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z'),
      );
      break;
    case 'controls':
      svg.append(
        strokePath('M3 5.5h14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z'),
        strokePath('M5.5 8.5h1M9.5 8.5h1M13.5 8.5h1M6.5 11.8h7'),
      );
      break;
    case 'gameplay':
      svg.append(
        strokePath('M10 3.2v2.4M10 14.4v2.4M3.2 10h2.4M14.4 10h2.4'),
        strokePath('M10 6.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z'),
      );
      break;
    case 'audio':
      svg.append(
        strokePath('M3.5 8h3l3.5-3v10L6.5 12h-3V8Z'),
        strokePath('M13 7.5a3.5 3.5 0 0 1 0 5M15.4 5.4a6.2 6.2 0 0 1 0 9.2'),
      );
      break;
    case 'interface':
      svg.append(
        strokePath('M3 4.5h14v11H3v-11Z'),
        strokePath('M6 7.5h4M6 12.5h2M12.5 12.5H14M10 9.2v1.6M9.2 10h1.6'),
      );
      break;
    case 'check':
      svg.append(strokePath('M4.5 10.5l3.6 3.5L15.5 6.5', '2'));
      break;
    case 'quit':
      svg.append(
        strokePath('M11.5 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h6'),
        strokePath('M8.5 10h7.5M13 7l3 3-3 3'),
      );
      break;
    case 'back':
      svg.append(strokePath('M12.5 5L7.5 10l5 5'));
      break;
    case 'reset':
      svg.append(strokePath('M5.2 7.5A5.3 5.3 0 1 1 6 13.6'), strokePath('M4.8 4.4v3.4h3.4'));
      break;
    case 'chevronLeft':
      svg.append(strokePath('M12.2 5.2L7.4 10l4.8 4.8'));
      break;
    case 'chevronRight':
      svg.append(strokePath('M7.8 5.2L12.6 10l-4.8 4.8'));
      break;
    case 'leanLeft':
      svg.append(
        strokePath('M12.5 16.5L8.2 5.5'),
        strokePath('M6.8 9.2L4 6.5l3.6-1.2'),
        strokePath('M8 16.5h7'),
      );
      break;
    case 'leanRight':
      svg.append(
        strokePath('M7.5 16.5l4.3-11'),
        strokePath('M13.2 9.2L16 6.5l-3.6-1.2'),
        strokePath('M5 16.5h7'),
      );
      break;
    case 'sprint':
      svg.append(strokePath('M4.5 6l4 4-4 4'), strokePath('M10 6l4 4-4 4'));
      break;
    case 'modes':
      svg.append(
        strokePath('M2.8 6.4h9.8v9.4H2.8V6.4Z'),
        strokePath('M5.4 4.2h11.8v9.2'),
        strokePath('M5.2 10h4.8M5.2 12.6h6.6'),
      );
      break;
    case 'hostile':
      svg.append(
        strokePath('M10 3.6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z'),
        strokePath('M4.9 16.4c0-2.7 2.3-4.8 5.1-4.8s5.1 2.1 5.1 4.8'),
      );
      break;
    case 'target':
      svg.append(
        strokePath('M7.6 3.5h4.8v3.1h2.4v9.9H5.2V6.6h2.4V3.5Z'),
        strokePath('M10 9.4v3.2M8.4 11h3.2'),
      );
      break;
    case 'mouseLeft':
      svg.append(
        strokePath('M5.5 7.5a4.5 4.5 0 0 1 9 0v5a4.5 4.5 0 0 1-9 0v-5Z'),
        strokePath('M10 3v5.5M5.6 8.5h8.8'),
        fillPath('M10 3.4v4.9H5.9V7.5A4.1 4.1 0 0 1 10 3.4Z', '0.92'),
      );
      break;
    case 'mouseRight':
      svg.append(
        strokePath('M5.5 7.5a4.5 4.5 0 0 1 9 0v5a4.5 4.5 0 0 1-9 0v-5Z'),
        strokePath('M10 3v5.5M5.6 8.5h8.8'),
        fillPath('M10 3.4A4.1 4.1 0 0 1 14.1 7.5v0.8H10V3.4Z', '0.92'),
      );
      break;
    case 'mouseMove':
      svg.append(
        strokePath('M6.2 7.8a3.8 3.8 0 0 1 7.6 0v4.4a3.8 3.8 0 0 1-7.6 0V7.8Z'),
        strokePath('M10 4v3.2'),
        strokePath('M2.5 10h1.8M15.7 10h1.8'),
      );
      break;
  }
  return svg;
}

function silhouettePath(
  d: string,
  detailD?: string,
  viewBox = '0 0 220 88',
  className = 'hud-weapon-svg',
): SVGSVGElement {
  const svg = svgRoot(viewBox, className);
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', d);
  body.setAttribute('fill', 'currentColor');
  body.setAttribute('fill-rule', 'evenodd');
  svg.append(body);

  if (detailD) {
    const details = document.createElementNS(SVG_NS, 'path');
    details.setAttribute('d', detailD);
    details.setAttribute('stroke', 'rgba(10, 14, 20, 0.72)');
    details.setAttribute('stroke-width', '1.6');
    details.setAttribute('stroke-linecap', 'round');
    details.setAttribute('stroke-linejoin', 'round');
    svg.append(details);
  }
  return svg;
}

/**
 * Clean left-facing side-profile SVG silhouettes for all 8 firearms in the arsenal.
 * Every silhouette matches its real-world geometry and 3D weapon model.
 */
export function createWeaponSilhouette(id: WeaponId, className = 'hud-weapon-svg'): SVGSVGElement {
  switch (id) {
    case 'hk416':
      return silhouettePath(
        [
          // Birdcage flash hider, 14.5" barrel, quad-rail handguard, EOTech holo, HK E1 stock
          'M8 31 H19 V29 H44 V24 H103 V14 H116 L120 11 H130 V24 H147 V27 H174 L179 25 H210 V54 L201 56 L176 42 H152 L147 45 L155 68 L142 70 L134 49 H116 L111 45 L103 74 L89 72 L96 47 L92 43 H44 V37 H19 V35 H8 Z',
          // Trigger guard cutout
          'M118 42 H132 L133 47 H120 Z',
        ].join(' '),
        'M48 28 H98 M48 34 H98 M112 24 H144 M118 16 H127 V22 H118 Z M174 34 H206',
        '0 0 220 88',
        className,
      );

    case 'ak47':
      return silhouettePath(
        [
          // Slant muzzle brake, hooded front sight tower, angled gas block, wood handguard,
          // curved 30-rd banana mag, classic sloped wooden AK buttstock
          'M6 34 L12 31 H17 V22 H21 V31 H48 L54 24 H94 V27 H106 L112 24 H148 L153 28 L211 36 V60 L199 60 L150 44 L145 45 L155 67 L143 69 L134 48 H115 L109 47 L94 79 L79 74 L94 46 H50 V38 H17 V37 H6 Z',
          // Trigger guard opening
          'M118 42 H132 L133 46 H119 Z',
        ].join(' '),
        'M54 31 H94 M114 33 H144 M156 36 L204 45 M89 58 L97 61',
        '0 0 220 88',
        className,
      );

    case 'scar-h':
      return silhouettePath(
        [
          // PWS 3-chamber brake, tall monolithic upper rail, compact reflex optic, straight 20-rd mag,
          // unmistakable SCAR "UGG-boot" stock with raised cheekpiece
          'M6 31 H21 V29 H44 V22 H95 V13 H122 V22 H147 V24 H168 L174 20 H198 L202 24 H212 V56 L196 58 L190 46 H148 L145 47 L154 70 L141 72 L132 50 H116 L112 46 V74 H92 V46 H44 V38 H21 V36 H6 Z',
          // Trigger guard cutout
          'M118 43 H131 L132 48 H119 Z',
        ].join(' '),
        'M50 28 H88 M100 22 H142 M100 50 V70 M170 34 H206',
        '0 0 220 88',
        className,
      );

    case 'mp5':
      return silhouettePath(
        [
          // Tri-lug barrel, circular front hood, sloped tropical handguard, curved 9mm 30-rd mag,
          // rotary diopter rear sight, compact collapsing A3 twin-rod wire stock
          'M24 31 H36 V21 H42 V27 H86 V25 H125 V21 H133 V26 H149 V29 H188 V26 H196 V54 H187 V37 H149 V43 L157 67 L145 69 L136 48 H118 L113 44 H103 L94 76 L83 74 L91 45 H85 L44 39 V36 H24 Z',
          // Trigger guard & wire stock open gap
          'M121 41 H134 L135 46 H122 Z M152 32 H186 V35 H152 Z',
        ].join(' '),
        'M46 31 H84 M96 31 H142 M54 27 H76',
        '0 0 220 88',
        className,
      );

    case 'remington-870':
      return silhouettePath(
        [
          // Twin-tube 18.5" barrel + under-barrel magazine tube, ribbed pump forend,
          // rounded steel receiver with ghost ring, traditional swept shotgun stock
          'M6 28 H130 V24 H137 V28 H146 L160 32 L212 36 V62 L198 62 L152 46 L142 54 L132 51 L126 42 H98 V40 H48 V41 H15 V35 H98 V33 H6 Z',
          // Space between barrel and mag tube at front clamp
          'M16 32 H46 V34 H16 Z',
        ].join(' '),
        'M54 36 V40 M60 36 V40 M66 36 V40 M72 36 V40 M78 36 V40 M84 36 V40 M102 32 H128',
        '0 0 220 88',
        className,
      );

    case 'awm':
      return silhouettePath(
        [
          // Massive dual-chamber muzzle brake, long fluted 26" barrel, folded bipod legs,
          // Schmidt & Bender scope with elevation turret, 5-rd box mag, monolithic thumbhole chassis!
          'M4 33 H18 V35 H66 V31 H94 V21 H85 V15 H116 V17 H125 V12 H134 V17 H156 V15 H164 V21 H148 V29 H155 V32 H178 V28 H200 V32 H214 V58 L198 59 L190 50 H170 L154 59 L140 59 L136 45 H122 L119 56 H103 V45 H62 V43 H48 V47 H44 V41 H66 V39 H18 V41 H4 Z',
          // Iconic Accuracy International thumbhole stock cutout + trigger guard
          'M156 39 H182 L178 49 H158 Z M124 41 H135 V44 H124 Z',
        ].join(' '),
        'M68 37 H144 M100 18 H158 M104 47 H117',
        '0 0 220 88',
        className,
      );

    case 'desert-eagle':
      return silhouettePath(
        [
          // Massive full-length angled barrel shroud + top Weaver rail, full dust cover,
          // squared combat trigger guard, rear slide serrations, beefy .50 AE grip!
          'M34 18 L40 13 H126 V16 H156 V12 H164 V17 H170 L178 12 L182 15 L176 23 L187 26 L185 31 L175 34 L190 80 L152 80 L140 50 H102 L96 44 V37 H34 V28 H32 V20 Z',
          // Squared combat trigger guard window
          'M104 37 H135 L137 45 H106 Z',
        ].join(' '),
        'M36 28 H172 M118 18 V32 M140 20 L138 27 M146 20 L144 27 M152 20 L150 27 M148 49 L166 49 L179 75 L159 75 Z',
        '0 0 220 92',
        className,
      );

    case 'm1911':
    default:
      return silhouettePath(
        [
          // Classic Government Model M1911A1 centered cleanly in unified frame
          'M42 19 L46 14.5 H50 L51.5 19 H152 L155 14 H163 L164.5 19 H170 L177 13.5 L181 16.5 L174.5 24 L186 27.5 L185 31.5 L175 34.5 L191 81 L194 83.5 L193 87.5 H161 L160.5 83.5 L164 81.5 L151 49.5 H118 L112.5 44.5 V38.5 H72 L69 36.5 H42 V30.5 L40.5 29.5 V20.5 Z',
          // Trigger guard window
          'M119 38.5 H147.5 L149.5 46 H120.5 L116.5 42 Z',
        ].join(' '),
        'M42 30.5 H168 M96 21.5 H122 V27.5 H96 Z M140 22.5 L138 28.5 M145 22.5 L143 28.5 M150 22.5 L148 28.5 M155 22.5 L153 28.5 M160 22.5 L158 28.5 M158 51 H172 L184 78 H169 Z',
        '0 0 220 92',
        className,
      );
  }
}

export function createM1911Silhouette(className = 'hud-weapon-svg'): SVGSVGElement {
  return createWeaponSilhouette('m1911', className);
}
