import { InvalidEmailError } from "../errors/account-errors.js";

/**
 * Contrôle **délibérément permissif** : une seule arobase, du texte de chaque
 * côté, un point dans le domaine, aucun espace. Les regex « RFC-complètes » sont
 * illisibles, fausses en pratique, et rejettent des adresses valides. La seule
 * preuve qu'une adresse existe est un e-mail de vérification — ici on n'attrape
 * que la faute de frappe manifeste.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export const EMAIL_MAX_LENGTH = 254; // limite d'une adresse en pratique (RFC 5321)

/**
 * Adresse e-mail d'un compte.
 *
 * Normalisée en **minuscules** : les domaines sont insensibles à la casse et les
 * fournisseurs traitent la partie locale de même. Sans cette normalisation,
 * `Jean@x.fr` et `jean@x.fr` créeraient deux comptes pour une seule personne.
 */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(raw: string): EmailAddress {
    const normalized = raw.trim().toLowerCase();

    if (normalized.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailError(raw);
    }

    return new EmailAddress(normalized);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
