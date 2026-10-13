import { SiteColorFormatError, SiteColorReservedError } from "./site-errors.js";

/** `#rrggbb`, insensible à la casse à l'entrée ; stocké en minuscules. */
const HEX_COLOR = /^#[0-9a-f]{6}$/u;

/** Une plage de teintes HSL, en degrés, bornes INCLUSES. */
interface HueRange {
  readonly from: number;
  readonly to: number;
}

/**
 * **Le vert du surligneur OK** : du vert-jaune au vert-bleu, 75° à 165°.
 * En deçà, c'est un jaune (60°) ; au-delà, un turquoise qui tire au bleu.
 */
export const RESERVED_GREEN_HUES: HueRange = { from: 75, to: 165 };

/**
 * **Le rouge et le rose du surligneur KO** : du rose (330°) au rouge-orangé
 * (20°), en passant par 0°. Le magenta (300°) et le violet restent permis ;
 * l'orange (30°) aussi — c'est une couleur de la demande d'origine.
 */
export const RESERVED_RED_HUES: HueRange = { from: 330, to: 20 };

/**
 * En dessous de cette saturation HSL (0 à 1), une couleur se lit comme un gris
 * teinté, quelle que soit sa teinte : le gris est une couleur de la demande,
 * et un gris légèrement verdâtre ne passe pas pour un surligneur.
 */
export const RESERVED_MIN_SATURATION = 0.25;

const FULL_TURN = 360;
const CHANNEL_MAX = 255;

function inRange(hue: number, range: HueRange): boolean {
  return range.from <= range.to
    ? hue >= range.from && hue <= range.to
    : hue >= range.from || hue <= range.to;
}

/** Teinte (degrés) et saturation (0–1) HSL d'une couleur `#rrggbb`. */
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

/**
 * **Une couleur de site** — libre, saisie au back-office (Hugo, 2026-10-13 :
 * pas de palette fermée), sauf les teintes des surligneurs OK / KO de la
 * logistique : vert, rouge, rose (demande d'origine, plan des sites §0 et §3.5).
 *
 * La forme `#rrggbb` est aussi tenue en base (CHECK) ; la teinte ne l'est
 * qu'ici, parce qu'un calcul HSL n'a rien à faire dans une contrainte SQL.
 */
export class SiteColor {
  private constructor(readonly hex: string) {}

  /**
   * @throws {SiteColorFormatError} la valeur n'est pas `#rrggbb`.
   * @throws {SiteColorReservedError} sa teinte est celle d'un surligneur.
   */
  static of(value: string): SiteColor {
    const hex = value.trim().toLowerCase();
    if (!HEX_COLOR.test(hex)) {
      throw new SiteColorFormatError(value);
    }
    const { hue, saturation } = hueAndSaturation(hex);
    const reserved =
      saturation >= RESERVED_MIN_SATURATION &&
      (inRange(hue, RESERVED_GREEN_HUES) || inRange(hue, RESERVED_RED_HUES));
    if (reserved) {
      throw new SiteColorReservedError(hex);
    }
    return new SiteColor(hex);
  }

  equals(other: SiteColor): boolean {
    return this.hex === other.hex;
  }
}
