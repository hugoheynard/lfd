import { randomUUID } from "node:crypto";

/**
 * L'en-tête d'une **clé d'intention** (plan
 * `documentation/mail/plan-service-e-mails.md`, revue, cas 4) :
 * les gestes du staff qui envoient un e-mail l'exigent, et un second appel de
 * même clé ne réexécute rien.
 */
export const INTENT_KEY = "Idempotency-Key";

/** Une intention neuve — ce que l'écran fabrique à l'ouverture d'un dialogue. */
export function freshIntent(): string {
  return randomUUID();
}
