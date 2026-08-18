import { IdGenerator } from "./id-generator.js";

/**
 * `IdGenerator` **déterministe** : `prefix_000001`, `prefix_000002`, …
 *
 * Réservé aux tests — rend les identifiants d'un handler prévisibles pour les
 * assertions, sans dépendre d'un ULID aléatoire.
 */
export class FixedIdGenerator extends IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = "id") {
    super();
  }

  next(): string {
    this.counter += 1;
    return `${this.prefix}_${String(this.counter).padStart(6, "0")}`;
  }
}
