import { SecretGenerator } from "./secret-generator.js";

/**
 * `SecretGenerator` **déterministe** : `SECRET000001`, `SECRET000002`, …
 *
 * Réservé aux tests, comme `FixedIdGenerator` : un jeton prévisible est le seul
 * moyen d'écrire une assertion sur l'URL qu'un client présentera. Prévisible est
 * exactement ce qu'on refuse en production — d'où le nom explicite.
 */
export class FixedSecretGenerator extends SecretGenerator {
  private counter = 0;

  constructor(private readonly prefix = "SECRET") {
    super();
  }

  next(): string {
    this.counter += 1;
    return `${this.prefix}${String(this.counter).padStart(6, "0")}`;
  }
}
