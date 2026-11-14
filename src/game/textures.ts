import * as THREE from 'three';

/**
 * Surface textures drawn at start-up, so the slice ships without image files.
 * A fixed seed keeps them identical on every run.
 */

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  return { element, context };
}

/** Fine per-pixel brightness variation over whatever is already drawn. */
function grain(context: CanvasRenderingContext2D, amount: number, random: () => number) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const offset = (random() - 0.5) * amount;
    data[i] = (data[i] ?? 0) + offset;
    data[i + 1] = (data[i + 1] ?? 0) + offset;
    data[i + 2] = (data[i + 2] ?? 0) + offset;
  }
  context.putImageData(image, 0, 0);
}

function blotches(
  context: CanvasRenderingContext2D,
  count: number,
  colour: string,
  maxRadius: number,
  random: () => number,
) {
  const { width, height } = context.canvas;
  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height;
    const radius = (0.3 + random() * 0.7) * maxRadius;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

function finish(element: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Cast concrete wall panel with form seams, tie holes and rain streaks. */
export function concreteWall(): THREE.CanvasTexture {
  const random = seeded(11);
  const { element, context } = canvas(512, 512);
  context.fillStyle = '#9b978d';
  context.fillRect(0, 0, 512, 512);
  blotches(context, 9, 'rgba(70,66,58,0.09)', 220, random);
  blotches(context, 7, 'rgba(210,205,195,0.1)', 200, random);

  // Streaks running down from the top of the panel.
  for (let i = 0; i < 26; i++) {
    const x = random() * 512;
    const length = 80 + random() * 300;
    const gradient = context.createLinearGradient(0, 0, 0, length);
    gradient.addColorStop(0, `rgba(55,52,46,${0.08 + random() * 0.14})`);
    gradient.addColorStop(1, 'rgba(55,52,46,0)');
    context.fillStyle = gradient;
    context.fillRect(x, 0, 2 + random() * 10, length);
  }

  context.fillStyle = 'rgba(40,38,34,0.5)';
  context.fillRect(0, 0, 512, 3);
  context.fillRect(0, 0, 3, 512);
  for (const [x, y] of [
    [128, 128],
    [384, 128],
    [128, 384],
    [384, 384],
  ] as const) {
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fillStyle = 'rgba(45,42,38,0.75)';
    context.fill();
  }
  grain(context, 22, random);
  return finish(element);
}

/** Poured slab: lighter than the walls, with joints, cracks and stains. */
export function concreteFloor(): THREE.CanvasTexture {
  const random = seeded(23);
  const { element, context } = canvas(512, 512);
  context.fillStyle = '#c4b8a2';
  context.fillRect(0, 0, 512, 512);
  blotches(context, 16, 'rgba(90,82,68,0.09)', 150, random);
  blotches(context, 12, 'rgba(225,218,204,0.15)', 130, random);
  blotches(context, 4, 'rgba(40,36,30,0.14)', 60, random);

  context.strokeStyle = 'rgba(50,46,40,0.28)';
  context.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    let x = random() * 512;
    let y = random() * 512;
    context.beginPath();
    context.moveTo(x, y);
    const heading = random() * Math.PI * 2;
    for (let j = 0; j < 22; j++) {
      x += Math.cos(heading) * 9 + (random() - 0.5) * 12;
      y += Math.sin(heading) * 9 + (random() - 0.5) * 12;
      context.lineTo(x, y);
    }
    context.stroke();
  }

  context.fillStyle = 'rgba(45,42,36,0.55)';
  context.fillRect(0, 0, 512, 3);
  context.fillRect(0, 0, 3, 512);
  grain(context, 26, random);
  return finish(element);
}

/** One weathered plywood sheet, 1.2 m by 2.4 m, grain running up the sheet. */
export function plywood(): THREE.CanvasTexture {
  const random = seeded(37);
  const { element, context } = canvas(256, 512);
  context.fillStyle = '#a88a66';
  context.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 260; i++) {
    const x = random() * 256;
    const dark = random() > 0.4;
    context.strokeStyle = dark
      ? `rgba(84,58,30,${0.05 + random() * 0.16})`
      : `rgba(226,196,150,${0.05 + random() * 0.12})`;
    context.lineWidth = 0.5 + random() * 2.5;
    context.beginPath();
    context.moveTo(x, 0);
    const sway = (random() - 0.5) * 26;
    context.bezierCurveTo(x + sway, 170, x - sway, 340, x + (random() - 0.5) * 10, 512);
    context.stroke();
  }

  // Sun-bleached and water-stained patches, as on sheets left outdoors.
  blotches(context, 10, 'rgba(150,146,134,0.3)', 150, random);
  blotches(context, 6, 'rgba(60,44,26,0.2)', 90, random);
  const base = context.createLinearGradient(0, 512, 0, 380);
  base.addColorStop(0, 'rgba(60,50,38,0.35)');
  base.addColorStop(1, 'rgba(60,50,38,0)');
  context.fillStyle = base;
  context.fillRect(0, 380, 256, 132);

  context.fillStyle = 'rgba(40,28,14,0.6)';
  context.fillRect(0, 0, 256, 2);
  context.fillRect(0, 0, 2, 512);
  grain(context, 18, random);
  return finish(element);
}

/** One face of a wooden crate: horizontal boards inside a frame. */
export function crate(): THREE.CanvasTexture {
  const random = seeded(51);
  const { element, context } = canvas(256, 256);
  const boards = 5;
  const boardHeight = 256 / boards;
  for (let i = 0; i < boards; i++) {
    const shade = 108 + random() * 26;
    context.fillStyle = `rgb(${shade + 18},${shade - 8},${shade - 44})`;
    context.fillRect(0, i * boardHeight, 256, boardHeight);
    for (let j = 0; j < 22; j++) {
      const y = i * boardHeight + random() * boardHeight;
      context.strokeStyle = `rgba(60,40,20,${0.08 + random() * 0.14})`;
      context.lineWidth = 0.5 + random();
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(85, y + (random() - 0.5) * 6, 170, y + (random() - 0.5) * 6, 256, y);
      context.stroke();
    }
    context.fillStyle = 'rgba(30,20,10,0.7)';
    context.fillRect(0, i * boardHeight, 256, 2);
  }

  const frame = 30;
  context.fillStyle = '#6f5334';
  context.fillRect(0, 0, 256, frame);
  context.fillRect(0, 256 - frame, 256, frame);
  context.fillRect(0, 0, frame, 256);
  context.fillRect(256 - frame, 0, frame, 256);
  context.strokeStyle = 'rgba(25,16,8,0.75)';
  context.lineWidth = 2;
  context.strokeRect(frame, frame, 256 - frame * 2, 256 - frame * 2);
  context.strokeRect(1, 1, 254, 254);
  blotches(context, 6, 'rgba(40,30,18,0.2)', 80, random);
  grain(context, 20, random);
  return finish(element);
}

/** Checkered walnut for the pistol grip panels. */
export function walnutChecker(): THREE.CanvasTexture {
  const random = seeded(67);
  const { element, context } = canvas(128, 128);
  context.fillStyle = '#4a2b19';
  context.fillRect(0, 0, 128, 128);
  context.lineWidth = 1.2;
  for (let i = -128; i < 256; i += 6) {
    context.strokeStyle = 'rgba(24,12,6,0.75)';
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + 128, 128);
    context.moveTo(i + 128, 0);
    context.lineTo(i, 128);
    context.stroke();
  }
  grain(context, 16, random);
  return finish(element);
}

/** Soft round blob used for dust puffs and the muzzle flash. */
export function softDot(inner: string, outer: string): THREE.CanvasTexture {
  const { element, context } = canvas(64, 64);
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
