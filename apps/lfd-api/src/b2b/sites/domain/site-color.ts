import { SiteColorFormatError } from "./site-errors.js";

/** `#rrggbb`, insensible à la casse à l'entrée ; stocké en minuscules. */
const HEX_COLOR = /^#[0-9a-f]{6}$/u;

/**
 * **Une couleur de site** — entièrement libre, saisie au back-office (Hugo,
 * 2026-10-13 : pas de palette fermée, et aucune teinte refusée). La demande
 * d'origine réservait le vert et le rouge / rose aux surligneurs OK / KO de la
 * logistique ; la règle a été retirée le 2026-10-13 : l'équipe s'organise
 * entre elle (plan des sites, §3.5).
 *
 * Seule la FORME `#rrggbb` est jugée, ici et en base (CHECK).
 */
export class SiteColor {
  private constructor(readonly hex: string) {}

  /** @throws {SiteColorFormatError} la valeur n'est pas `#rrggbb`. */
  static of(value: string): SiteColor {
    const hex = value.trim().toLowerCase();
    if (!HEX_COLOR.test(hex)) {
      throw new SiteColorFormatError(value);
    }
    return new SiteColor(hex);
  }

  equals(other: SiteColor): boolean {
    return this.hex === other.hex;
  }
}
