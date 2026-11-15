import type { WeaponId } from '../../core/weapon';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'play'
  | 'resume'
  | 'restart'
  | 'modes'
  | 'shield'
  | 'skull'
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
  | 'heart'
  | 'helmet'
  | 'vest'
  | 'bandage'
  | 'firstAid'
  | 'medKit'
  | 'energyDrink'
  | 'painkiller';

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
    case 'modes':
      svg.append(
        strokePath(
          'M3.2 3.8h5.6v5.2H3.2zM11.2 3.8h5.6v5.2h-5.6zM3.2 11h5.6v5.2H3.2zM11.2 11h5.6v5.2h-5.6z',
        ),
      );
      break;
    case 'shield':
      svg.append(
        strokePath('M10 2.6L16.2 5v4.6c0 3.9-2.6 6.8-6.2 8-3.6-1.2-6.2-4.1-6.2-8V5L10 2.6Z'),
        strokePath('M10 6.8v4.8M7.6 9.2h4.8'),
      );
      break;
    case 'skull':
      svg.append(
        strokePath(
          'M10 3.2a5.4 5.4 0 0 0-5.4 5.4c0 2 .9 3.6 2.3 4.5v2.7h6.2v-2.7c1.4-.9 2.3-2.5 2.3-4.5A5.4 5.4 0 0 0 10 3.2Z',
        ),
        strokePath('M8 9.2h.01M12 9.2h.01M8.8 15.8v-1.6M11.2 15.8v-1.6'),
      );
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
    case 'heart':
      svg.append(
        strokePath(
          'M10 16.2S3.6 12.3 3.6 7.9A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6.4 1.6c0 4.4-6.4 8.3-6.4 8.3Z',
        ),
      );
      break;
    case 'helmet':
      svg.append(
        strokePath('M3.4 12.6a6.6 6.6 0 0 1 13.2 0v1.2H3.4v-1.2Z'),
        strokePath('M3.4 13.8h14.2M6.4 13.8v2.6M8.2 6.6v7.2'),
      );
      break;
    case 'vest':
      svg.append(
        strokePath(
          'M6.4 3.4L4.2 5.6v10.8h11.6V5.6l-2.2-2.2c-.5 1.7-1.9 2.8-3.6 2.8S6.9 5.1 6.4 3.4Z',
        ),
        strokePath('M6.6 10.2h6.8M6.6 13h6.8'),
      );
      break;
    case 'bandage':
      svg.append(
        strokePath('M9 4.4a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z'),
        strokePath('M9 7.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z'),
        strokePath('M9 13.2h7.6v2.6H11'),
      );
      break;
    case 'firstAid':
      svg.append(
        strokePath('M4.6 6.4h10.8v10H4.6z'),
        strokePath('M7.6 6.4V4.2h4.8v2.2'),
        strokePath('M10 9.2v4.4M7.8 11.4h4.4'),
      );
      break;
    case 'medKit':
      svg.append(
        strokePath('M2.6 7h14.8v9.4H2.6z'),
        strokePath('M7 7V4.6h6V7M5.2 7v9.4M14.8 7v9.4'),
        strokePath('M10 9.4v4.6M7.7 11.7h4.6'),
      );
      break;
    case 'energyDrink':
      svg.append(
        strokePath('M6.8 5.4h6.4v11.2H6.8z'),
        strokePath('M7.8 5.4l.7-2h3l.7 2'),
        strokePath('M10.8 8l-1.8 3h2l-1.8 3'),
      );
      break;
    case 'painkiller':
      svg.append(
        strokePath('M5.9 14.1a3 3 0 0 1 0-4.2l4-4a3 3 0 0 1 4.2 4.2l-4 4a3 3 0 0 1-4.2 0Z'),
        strokePath('M7.9 7.9l4.2 4.2'),
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
 * Clean left-facing side-profile SVG silhouettes for every firearm in the arsenal.
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

    case 'm16a4':
      return silhouettePath(
        [
          // A2 flash hider, 20" barrel, A-frame front sight, rail handguard, carry handle, fixed A2 stock
          'M4 31 H13 V30 H50 L55 17 H59 L63 25 H108 V22 H112 V14 L116 11 H140 L144 14 V24 H152 L156 27 H176 L212 30 V60 L200 62 L176 44 H152 L147 46 L155 69 L142 71 L134 49 H117 L112 46 L104 75 L90 72 L97 46 L93 43 H63 V37 H13 V36 H4 Z',
          // Trigger guard and carry-handle window
          'M118 42 H132 L133 47 H120 Z M118 15 H138 V21 H118 Z',
        ].join(' '),
        'M66 30 H104 M66 36 H104 M160 34 H206',
        '0 0 220 88',
        className,
      );

    case 'aug-a3':
      return silhouettePath(
        [
          // Bullpup: folding foregrip, full-hand guard, magazine behind the grip, one-piece stock body
          'M6 29 H18 V30 H58 V26 H70 V20 H98 V12 H114 V20 H150 V24 L170 26 H206 L212 30 V62 L206 66 H158 L155 82 H140 L138 60 H124 L128 74 H94 L90 46 H72 V64 H62 V37 H18 V38 H6 Z',
          // Hand window inside the guard
          'M96 50 H110 L114 68 H98 Z',
        ].join(' '),
        'M74 26 H146 M166 34 H204 M144 62 V78',
        '0 0 220 88',
        className,
      );

    case 'ump45':
      return silhouettePath(
        [
          // Boxy polymer receiver, straight 25-rd .45 magazine, skeleton folding stock
          'M30 31 H44 V26 H52 V20 H58 V24 H140 V20 H148 V26 L152 28 H204 V25 H212 V58 L200 58 L160 44 H150 L156 68 L144 70 L136 48 H120 L116 46 V78 H100 V46 H56 L52 40 H44 V37 H30 Z',
          // Trigger guard and stock window
          'M121 42 H134 L135 47 H123 Z M166 33 H204 V50 L170 38 Z',
        ].join(' '),
        'M60 30 H136 M104 50 V74',
        '0 0 220 88',
        className,
      );

    case 'vector':
      return silhouettePath(
        [
          // Flat top rail, deep Super V block ahead of a long stick magazine, folding stock
          'M40 30 H52 V22 H150 L154 26 H170 L176 24 H206 L212 28 V58 L202 60 L198 40 H176 L170 44 H152 L158 68 L146 70 L138 50 H124 L122 46 V82 H108 V60 H70 L56 44 V37 H40 Z',
          // Trigger guard and stock window
          'M126 43 H137 L138 48 H127 Z M180 31 H204 V37 H180 Z',
        ].join(' '),
        'M58 28 H146 M112 62 V78 M72 44 L100 56',
        '0 0 220 88',
        className,
      );

    case 'saiga-12':
      return silhouettePath(
        [
          // Kalashnikov-pattern shotgun: thick barrel, short handguard, wide raked box magazine
          'M6 30 H18 V29 H50 L56 23 H96 V26 H108 L114 23 H148 L153 27 L211 34 V58 L199 58 L150 44 L145 45 L155 67 L143 69 L134 48 H115 L111 47 L104 78 L84 74 L92 46 H52 V38 H18 V37 H6 Z',
          // Trigger guard opening
          'M118 42 H132 L133 46 H119 Z',
        ].join(' '),
        'M58 30 H94 M114 32 H144 M156 35 L204 44 M90 56 L104 59',
        '0 0 220 88',
        className,
      );

    case 'sks':
      return silhouettePath(
        [
          // Hooded front sight, folded bayonet under the barrel, fixed 10-rd belly magazine, wood stock
          'M4 32 H12 V24 H18 V32 H52 V28 H60 L64 25 H104 V27 H146 L152 30 L166 36 L212 38 V60 L200 62 L164 48 L152 53 H122 L118 57 H98 L96 46 H60 V41 H14 V38 H4 Z',
          // Trigger guard opening
          'M124 46 H140 L142 50 H126 Z',
        ].join(' '),
        'M66 31 H102 M64 40 H94 M110 32 H142 M168 42 L206 48',
        '0 0 220 88',
        className,
      );

    case 'mini-14':
      return silhouettePath(
        [
          // Blade front sight, short handguard over a sporting wood stock, 20-rd box magazine
          'M6 32 H14 V25 H18 V32 H56 V30 H64 L68 27 H112 V24 H118 V27 H144 L150 30 L166 37 L212 39 V61 L200 62 L164 49 L152 54 H124 L120 50 L116 74 L102 72 L104 48 H66 L62 42 H56 V38 H6 Z',
          // Trigger guard opening
          'M126 46 H142 L144 51 H128 Z',
        ].join(' '),
        'M70 33 H140 M70 41 H100 M168 43 L206 49',
        '0 0 220 88',
        className,
      );

    case 'kar98k':
      return silhouettePath(
        [
          // Full-length wood stock, tangent rear sight, flush magazine, straight wrist
          'M4 31 H10 V25 H14 V31 H26 V29 H96 V26 H108 V28 H146 L152 31 L166 37 L212 39 V61 L200 62 L166 49 L154 53 H128 L126 49 H104 L100 44 H30 V40 H26 V37 H4 Z',
          // Trigger guard opening
          'M130 46 H144 L146 50 H132 Z',
        ].join(' '),
        'M34 34 H92 M40 29 V44 M70 29 V44 M112 33 H140 M141 34 L146 43 M168 43 L206 49',
        '0 0 220 88',
        className,
      );

    case 'mosin-nagant':
      return silhouettePath(
        [
          // Long barrel, PSO-1 on a side mount, box magazine ahead of the trigger guard
          'M2 31 H7 V26 H10 V31 H24 V29 H98 V27 H104 V12 H132 V9 H138 V12 H160 V22 H138 V28 H148 L154 31 L168 37 L212 39 V61 L200 62 L168 49 L156 53 H132 L130 49 H126 L124 58 H110 L108 46 H100 L98 44 H28 V40 H24 V37 H2 Z',
          // Gap between scope and receiver, and the trigger guard opening
          'M104 22 H122 V28 H104 Z M134 46 H146 L148 50 H136 Z',
        ].join(' '),
        'M30 34 H94 M44 29 V44 M76 29 V44 M108 17 H156 M170 43 L206 49',
        '0 0 220 88',
        className,
      );

    case 'dp-28':
      return silhouettePath(
        [
          // Flared flash hider, perforated barrel shroud, bipod, flat pan magazine, wood butt
          'M4 27 L14 31 H26 V29 H98 V24 H104 V17 H164 V24 H170 V28 L178 32 L212 36 V60 L202 62 L176 48 L166 56 H148 L144 46 H100 V42 H42 L32 72 H27 L35 42 H26 V37 H14 L4 41 Z',
          // Trigger guard opening
          'M150 48 H162 L164 52 H152 Z',
        ].join(' '),
        'M34 33 H40 M48 33 H54 M62 33 H68 M76 33 H82 M90 33 H94 M34 38 H40 M48 38 H54 M62 38 H68 M76 38 H82 M108 21 H160 M180 40 L206 46',
        '0 0 220 88',
        className,
      );

    case 'beretta-92fs':
      return silhouettePath(
        [
          // Open-top slide with the barrel showing, rounded trigger guard, spur hammer
          'M38 22 H44 V19 H50 L52 16 H56 L57 19 H150 L153 15 H161 L162 19 H168 L176 13 L180 16 L174 24 L184 28 L186 34 L178 37 L190 80 L193 83 L192 87 H160 L159 83 L162 80 L152 50 H120 L112 45 V39 H76 L72 36 H44 V31 H38 Z',
          // Trigger guard window
          'M120 39 H146 L148 46 H124 L117 42 Z',
        ].join(' '),
        'M44 31 H170 M60 23 H114 M140 22 L138 28 M145 22 L143 28 M150 22 L148 28 M155 22 L153 28 M160 22 L158 28 M158 52 H172 L183 77 H168 Z',
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
