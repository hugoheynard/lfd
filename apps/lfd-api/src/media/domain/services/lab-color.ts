/**
 * **Une couleur dans l'espace Lab** (CIE 1976, illuminant D65) — l'espace où
 * une distance euclidienne ressemble à ce que l'œil voit (ΔE76).
 *
 * Sert à la frise des couleurs (L9) : deux dominantes « presque pareilles »
 * de deux photos voisines doivent fusionner, et cette proximité ne se mesure
 * pas en RVB.
 */
export interface LabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const WHITE_X = 0.95047;
const WHITE_Y = 1;
const WHITE_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const LINEAR_THRESHOLD = 0.04045;
const GAMMA_THRESHOLD = 0.0031308;

function toLinear(channel: number): number {
  const c = channel / CHANNEL_MAX;
  return c <= LINEAR_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(linear: number): number {
  const c = linear <= GAMMA_THRESHOLD ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(c, 0), 1) * CHANNEL_MAX);
}

const f = (t: number): number => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInverse = (t: number): number => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);

/** `#rrggbb` (déjà validé) → Lab. */
export function labOf(hex: string): LabColor {
  const channel = (offset: number): number =>
    toLinear(Number.parseInt(hex.slice(offset, offset + 2), HEX_RADIX));
  const [r, g, b] = [channel(1), channel(3), channel(5)];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE_X;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE_Y;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE_Z;
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

/** Lab → `#rrggbb` en minuscules, hors gamut ramené dans le cube RVB. */
export function hexOf(lab: LabColor): string {
  const fy = (lab.l + 16) / 116;
  const x = WHITE_X * fInverse(fy + lab.a / 500);
  const y = WHITE_Y * fInverse(fy);
  const z = WHITE_Z * fInverse(fy - lab.b / 200);
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return `#${[r, g, b]
    .map((linear) => fromLinear(linear).toString(HEX_RADIX).padStart(2, "0"))
    .join("")}`;
}

/** ΔE76 : la distance euclidienne dans Lab. */
export function deltaE76(left: LabColor, right: LabColor): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}
