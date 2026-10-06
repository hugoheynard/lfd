import { InvalidRecipientEmailError } from "../errors/dossier-recipient-errors.js";

/**
 * Contrôle **délibérément permissif**, le même que l'adresse d'un compte
 * client (`b2b/account/…/email-address.ts`, relu le 2026-10-06) : une arobase,
 * du texte de chaque côté, un point dans le domaine, aucun espace. Recopié et
 * non importé : le fournil n'importe pas le commerce (`CLAUDE.md` §3).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

/** La limite d'une adresse en pratique (RFC 5321). */
const EMAIL_MAX_LENGTH = 254;

/**
 * **L'adresse d'un destinataire du dossier**, normalisée en minuscules : sans
 * quoi `Jean@x.fr` et `jean@x.fr` passeraient pour deux destinataires, et le
 * même dossier partirait deux fois.
 */
export class RecipientEmail {
  private constructor(readonly value: string) {}

  /** @throws {InvalidRecipientEmailError} l'adresse est manifestement fausse. */
  static of(raw: string): RecipientEmail {
    const normalized = raw.trim().toLowerCase();
    if (normalized.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalized)) {
      throw new InvalidRecipientEmailError(raw);
    }
    return new RecipientEmail(normalized);
  }
}

/** La clé de comparaison d'une adresse lue ailleurs — l'annuaire n'est pas normalisé ici. */
export function emailKeyOf(raw: string): string {
  return raw.trim().toLowerCase();
}
