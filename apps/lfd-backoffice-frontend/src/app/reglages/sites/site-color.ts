/**
 * **La teinte d'une couleur de site, jugée à la saisie.**
 *
 * Copie VOLONTAIRE de la règle du serveur
 * (`apps/lfd-api/src/b2b/sites/domain/site-color.ts`, relue le 2026-10-13) :
 * mêmes plages, même seuil de saturation, même calcul HSL. Aucun contrat
 * partagé ne la porte — `@lfd/contracts` ne tient que la forme `#rrggbb` — et
 * l'y mettre ferait peser un calcul de logistique sur le baril que la boutique
 * charge. Le serveur reste l'AUTORITÉ : ce jugement n'annonce le refus qu'en
 * avance, il ne remplace pas celui qui compte. Si les seuils du serveur
 * bougent, ceux-ci doivent suivre.
 */

/** `#rrggbb`, insensible à la casse. */
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

interface HueRange {
  readonly from: number;
  readonly to: number;
}

/** Le vert du surligneur OK, en degrés HSL, bornes incluses. */
export const RESERVED_GREEN_HUES: HueRange = { from: 75, to: 165 };
/** Le rouge et le rose du surligneur KO, à cheval sur 0°. */
export const RESERVED_RED_HUES: HueRange = { from: 330, to: 20 };
/** En dessous, un gris teinté — et le gris est permis. */
export const RESERVED_MIN_SATURATION = 0.25;

const FULL_TURN = 360;
const CHANNEL_MAX = 255;

/** Ce que l'écran dit d'une saisie ; `null` = rien à redire. */
export type SiteColorIssue = 'format' | 'reserved';

export const SITE_COLOR_MESSAGES: Readonly<Record<SiteColorIssue, string>> = {
  format: 'Couleur attendue sous la forme #rrggbb — choisissez-la dans le sélecteur.',
  reserved:
    'Trop proche du vert, du rouge ou du rose, réservés aux surligneurs OK / KO : choisissez-en une autre (bleu, jaune, orange, gris, violet…).',
};

function inRange(hue: number, range: HueRange): boolean {
  return range.from <= range.to
    ? hue >= range.from && hue <= range.to
    : hue >= range.from || hue <= range.to;
}

function hueAndSaturation(hex: string): { readonly hue: number; readonly saturation: number } {
  const channel = (at: number): number => parseInt(hex.slice(at, at + 2), 16) / CHANNEL_MAX;
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return { hue: 0, saturation: 0 };
  }
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const hue = (sector * 60 + FULL_TURN) % FULL_TURN;
  return { hue, saturation };
}

/** Normalise comme le serveur : sans blancs, en minuscules. */
export function normalizeSiteColor(value: string): string {
  return value.trim().toLowerCase();
}

/** Ce qui cloche dans une couleur saisie, ou `null`. */
export function siteColorIssue(value: string): SiteColorIssue | null {
  const hex = normalizeSiteColor(value);
  if (!HEX_COLOR.test(hex)) {
    return 'format';
  }
  const { hue, saturation } = hueAndSaturation(hex);
  const reserved =
    saturation >= RESERVED_MIN_SATURATION &&
    (inRange(hue, RESERVED_GREEN_HUES) || inRange(hue, RESERVED_RED_HUES));
  return reserved ? 'reserved' : null;
}
