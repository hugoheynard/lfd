import { addDays } from "@lfd/contracts";

import { InvalidCollectionDayError } from "../errors/collection-errors.js";

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Un jour d'échéance de prélèvement**, `AAAA-MM-JJ` — la `ReqdColltnDt` d'un
 * `pain.008`, figée sur le lot à sa constitution.
 *
 * Un jour et non un instant : la banque prélève un JOUR, sans heure ni fuseau,
 * et la colonne qui le garde est un `DATE`. Le calendrier TARGET2
 * (`target2-calendar.ts`) calcule encore en chaînes ; ce type ne couvre que le
 * lot et ses lecteurs directs (décidé le 2026-10-23, revue qualité chantier 3).
 *
 * L'ordre ISO est l'ordre du calendrier : la comparaison est celle des chaînes,
 * une fois la forme garantie.
 */
export class CollectionDay {
  private constructor(readonly value: string) {}

  /**
   * @throws {InvalidCollectionDayError} la forme n'est pas `AAAA-MM-JJ`, ou le
   * jour n'existe pas (un 30 février).
   */
  static of(raw: string): CollectionDay {
    // `addDays(jour, 0)` repasse par le calendrier : un 30 février en ressort
    // 2 mars, et ne se relit donc pas à l'identique.
    if (!DAY_SHAPE.test(raw) || addDays(raw, 0) !== raw) {
      throw new InvalidCollectionDayError(raw);
    }
    return new CollectionDay(raw);
  }

  /** Vrai si ce jour tombe strictement après l'autre. */
  isAfter(other: CollectionDay): boolean {
    return this.value > other.value;
  }

  equals(other: CollectionDay): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
