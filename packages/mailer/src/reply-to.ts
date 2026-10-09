import { MailerInvalidReplyToError } from "./errors.js";

/** Longueur maximale d'une adresse (RFC 5321 : 254 caractères utiles). */
const MAX_ADDRESS_LENGTH = 254;

/** Une partie locale, un `@`, un domaine à point ; ni espace ni chevron ni virgule. */
const ADDRESS_SHAPE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/u;

function hasControlCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Valide une adresse **avant qu'elle devienne l'en-tête `Reply-To`**.
 *
 * Contrairement à l'objet, qu'on assainit (`sanitiseSubject`), une adresse ne
 * se répare pas : un retour à la ligne dedans est une tentative d'injection
 * d'en-tête, et une adresse rognée enverrait la réponse à quelqu'un d'autre.
 * On refuse donc, et l'appelant décide.
 *
 * @throws {MailerInvalidReplyToError} forme invalide ou caractère de contrôle.
 */
export function validReplyTo(value: string): string {
  if (!isValidReplyTo(value)) {
    throw new MailerInvalidReplyToError();
  }
  return value;
}

/** La même règle, en question : pour un appelant qui veut refuser sans lever. */
export function isValidReplyTo(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ADDRESS_LENGTH &&
    !hasControlCharacter(value) &&
    ADDRESS_SHAPE.test(value)
  );
}
