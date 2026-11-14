const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'play'
  | 'resume'
  | 'restart'
  | 'settings'
  | 'controls'
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
  | 'mouseMove';

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
  }
  return svg;
}

/**
 * Clean side-profile silhouette of the Government Model M1911A1 pistol (facing left,
 * matching standard bottom-right FPS weapon panels in Modern Warfare & Battlefield).
 */
export function createM1911Silhouette(className = 'hud-weapon-svg'): SVGSVGElement {
  const svg = svgRoot('0 0 184 96', className);

  // Authentic Government Model M1911A1 profile facing left:
  // squared slide nose, recoil spring plug + dust cover, arched mainspring housing,
  // grip safety tang, cocked spur hammer, and trigger-guard cutout.
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute(
    'd',
    [
      // Front sight & squared slide top
      'M16 17 L20 12.5 L24 12.5 L25.5 17',
      'L132 17 L135 12 L143 12 L144.5 17 L150 17',
      // Cocked hammer spur & beavertail grip safety
      'L157 11.5 L161 14.5 L154.5 22 L166 25.5 L165 29.5 L155 32.5',
      // Classic 18-degree 1911 grip backstrap + magazine floorplate toe
      'L171 81 L174 83.5 L173 87.5 L141 87.5 L140.5 83.5 L144 81.5',
      // Grip frontstrap up to undercut trigger guard
      'L131 48.5 L98 48.5 L92.5 43.5 L92.5 36.5',
      // Frame dust cover + recoil spring housing + muzzle face
      'L48 36.5 L45 34.5 L16 34.5 L16 28.5 L14.5 27.5 L14.5 18.5 Z',
      // Trigger guard window cutout (even-odd)
      'M99 36.5 L127.5 36.5 L129.5 44.5 L100.5 44.5 L96.5 40.5 Z',
    ].join(' '),
  );
  body.setAttribute('fill', 'currentColor');
  body.setAttribute('fill-rule', 'evenodd');

  // Machined slide stop line, ejection port, rear cocking serrations, grip panel & trigger
  const details = document.createElementNS(SVG_NS, 'path');
  details.setAttribute(
    'd',
    [
      'M16 28.5 H148',
      'M72 19.5 H99 V25.5 H72 Z',
      'M120 20.5 L118 26.5 M125 20.5 L123 26.5 M130 20.5 L128 26.5 M135 20.5 L133 26.5 M140 20.5 L138 26.5',
      'M117 36.5 Q112.5 40.5 117 44.5',
      'M138 49 L152 49 L164 78 L149 78 Z',
    ].join(' '),
  );
  details.setAttribute('stroke', 'rgba(10, 14, 20, 0.72)');
  details.setAttribute('stroke-width', '1.6');
  details.setAttribute('stroke-linecap', 'round');
  details.setAttribute('stroke-linejoin', 'round');

  svg.append(body, details);
  return svg;
}
