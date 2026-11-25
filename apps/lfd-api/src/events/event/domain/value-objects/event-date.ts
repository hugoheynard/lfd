import { InvalidEventDateError } from "../errors/event-errors.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Le jour d'un événement, `AAAA-MM-JJ`, sans heure ni fuseau.
 *
 * La chaîne est la vérité : un `Date` porte une heure et un fuseau, et le
 * trajet base (`@db.Date`, minuit UTC) ↔ JS décale d'un jour dès qu'un fuseau
 * s'en mêle. La conversion en `Date` n'existe que pour parler à Prisma.
 */
export class EventDate {
  private constructor(readonly value: string) {}

  /** Depuis une saisie — refuse une date qui n'existe pas (30 février). */
  static fromString(raw: string): EventDate {
    const match = ISO_DATE.exec(raw);
    if (match === null) {
      throw new InvalidEventDateError(raw, "format AAAA-MM-JJ attendu");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      throw new InvalidEventDateError(raw, "cette date n'existe pas au calendrier");
    }
    return new EventDate(raw);
  }

  /** Depuis un `Date` Prisma (`@db.Date` = minuit UTC). */
  static fromUtcDate(date: Date): EventDate {
    return new EventDate(date.toISOString().slice(0, 10));
  }

  /** Minuit UTC — la seule forme que Prisma `@db.Date` comprend. */
  toUtcDate(): Date {
    const [year, month, day] = this.value.split("-").map(Number);
    return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  }

  equals(other: EventDate): boolean {
    return this.value === other.value;
  }
}
