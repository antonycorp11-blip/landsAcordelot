export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export function shade(c: RGB, amount: number): RGB {
  return [
    Math.max(0, Math.min(255, c[0] * amount)),
    Math.max(0, Math.min(255, c[1] * amount)),
    Math.max(0, Math.min(255, c[2] * amount)),
  ];
}

export function rgbaCss(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}
