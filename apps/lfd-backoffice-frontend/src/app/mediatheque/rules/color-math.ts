/**
 * **Les maths de la couleur** — sRGB, CIE Lab et la distance ΔE76. Pures et
 * sans navigateur : la palette d'une image (`palette-extract.ts`) les
 * appelle des milliers de fois par image.
 */

/** Une couleur en Lab (D65). */
export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Le plus grand canal sRGB sur huit bits. */
const CHANNEL_MAX = 255;

/** sRGB → linéaire (IEC 61966-2-1) : sous ce seuil, la courbe est une droite. */
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA = 2.4;

/** sRGB linéaire → XYZ (D65), une ligne par composante. */
const SRGB_TO_X = [0.4124, 0.3576, 0.1805] as const;
const SRGB_TO_Y = [0.2126, 0.7152, 0.0722] as const;
const SRGB_TO_Z = [0.0193, 0.1192, 0.9505] as const;

/** Le blanc de référence D65 (Y = 1). */
const D65_WHITE_X = 0.95047;
const D65_WHITE_Z = 1.08883;

/** CIE : sous ε, la racine cubique est remplacée par une droite de pente κ / 116. */
const CIE_EPSILON = 0.008856;
const CIE_KAPPA_OVER_116 = 7.787;
const LAB_OFFSET = 16;
const LAB_L_SCALE = 116;
const LAB_A_SCALE = 500;
const LAB_B_SCALE = 200;

/** Les 256 valeurs d'un canal, linéarisées une fois pour toutes. */
const LINEAR = Array.from({ length: CHANNEL_MAX + 1 }, (_, value) => {
  const channel = value / CHANNEL_MAX;
  return channel <= SRGB_LINEAR_THRESHOLD
    ? channel / SRGB_LINEAR_SLOPE
    : ((channel + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA;
});

function labPivot(value: number): number {
  return value > CIE_EPSILON
    ? Math.cbrt(value)
    : CIE_KAPPA_OVER_116 * value + LAB_OFFSET / LAB_L_SCALE;
}

function dot(row: readonly [number, number, number], r: number, g: number, b: number): number {
  return row[0] * r + row[1] * g + row[2] * b;
}

/** sRGB 0-255 → Lab, blanc D65. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[r] ?? 0;
  const lg = LINEAR[g] ?? 0;
  const lb = LINEAR[b] ?? 0;
  const x = labPivot(dot(SRGB_TO_X, lr, lg, lb) / D65_WHITE_X);
  const y = labPivot(dot(SRGB_TO_Y, lr, lg, lb));
  const z = labPivot(dot(SRGB_TO_Z, lr, lg, lb) / D65_WHITE_Z);
  return { l: LAB_L_SCALE * y - LAB_OFFSET, a: LAB_A_SCALE * (x - y), b: LAB_B_SCALE * (y - z) };
}

/** `#rrggbb` → [r, g, b]. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** `#rrggbb` → Lab. */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/** [r, g, b] → `#rrggbb`, en minuscules — la forme que le domaine range. */
export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(CHANNEL_MAX, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** ΔE76 : la distance euclidienne en Lab. */
export function deltaE76(first: Lab, second: Lab): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}
