import { InvalidOccurrenceDateError } from "../errors/subscription-errors.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Une date **calendaire** `AAAA-MM-JJ`, sans heure ni fuseau.
 *
 * On modélise la date comme une **chaîne**, pas un `Date` JS : un `Date` porte une
 * heure et un fuseau, et le trajet base (`@db.Date`, minuit UTC) ↔ JS ↔ affichage
 * décale d'un jour dès qu'un fuseau s'en mêle. Ici la valeur est la vérité ; la
 * conversion en `Date` (minuit UTC) n'existe que pour parler à Prisma.
 */
export class IsoDate {
  private constructor(readonly value: string) {}

  /** Depuis une saisie `AAAA-MM-JJ` — rejette une date qui n'existe pas (30 février). */
  static fromString(raw: string): IsoDate {
    const match = ISO_DATE.exec(raw);
    if (match === null) {
      throw new InvalidOccurrenceDateError(raw, "format AAAA-MM-JJ attendu");
    }
    const [, year, month, day] = match;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const utc = new Date(Date.UTC(y, m - 1, d));
    // Round-trip : si un composant a débordé (30 février → 2 mars), c'est invalide.
    if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
      throw new InvalidOccurrenceDateError(raw, "date inexistante");
    }
    return new IsoDate(raw);
  }

  /** Depuis un `Date` Prisma (`@db.Date` = minuit UTC) → la date calendaire. */
  static fromDate(date: Date): IsoDate {
    return new IsoDate(date.toISOString().slice(0, 10));
  }

  /** Vers un `Date` minuit UTC — la seule forme que Prisma `@db.Date` comprend. */
  toUtcDate(): Date {
    return new Date(`${this.value}T00:00:00.000Z`);
  }

  isBefore(other: IsoDate): boolean {
    return this.value < other.value;
  }

  isAfter(other: IsoDate): boolean {
    return this.value > other.value;
  }

  equals(other: IsoDate): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
