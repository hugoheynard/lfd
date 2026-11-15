import { InvalidServiceDayError } from "../errors/production-errors.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Le jour de service** — la journée qu'on fabrique, `AAAA-MM-JJ`.
 *
 * Un value object plutôt qu'une `string`, pour la raison qui vaut partout ici :
 * il s'auto-valide à la construction, donc une journée mal formée n'existe pas
 * — elle n'est pas « refusée plus loin », elle est **inexprimable**.
 *
 * ⚠️ **Une date sans heure, et surtout pas un `Date`.** Un `Date` porte un
 * instant et un fuseau ; une journée de production n'en a pas. Le jour où
 * quelqu'un construirait `new Date("2026-09-08")` sur une machine en UTC−5, la
 * journée du fournil reculerait d'un cran — et personne ne chercherait là.
 */
export class ServiceDay {
  private constructor(readonly value: string) {}

  /** @throws {InvalidServiceDayError} la chaîne n'est pas un jour ISO. */
  static of(value: string): ServiceDay {
    const trimmed = value.trim();
    if (!ISO_DAY.test(trimmed)) {
      throw new InvalidServiceDayError(value);
    }
    return new ServiceDay(trimmed);
  }

  equals(other: ServiceDay): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
