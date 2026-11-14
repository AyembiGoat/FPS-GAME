export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function formatRunTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const rem = clamped - minutes * 60;
  const whole = Math.floor(rem);
  const hundredths = Math.floor((rem - whole + 1e-6) * 100);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(whole).padStart(2, '0');
  const cs = String(Math.min(99, hundredths)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
}
