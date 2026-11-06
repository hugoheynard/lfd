import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { DomainError } from "../errors/app-error.js";

/** L'en-tête qui porte la clé d'intention d'un geste. */
export const INTENT_KEY_HEADER = "idempotency-key";

/** Un UUID, la forme que l'écran fabrique (`crypto.randomUUID()`). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** La requête n'a pas de clé d'intention lisible. */
export class MissingIntentKeyError extends DomainError {
  constructor() {
    super(
      "intent.key_missing",
      "Ce geste exige une clé d'intention (en-tête Idempotency-Key, un UUID) : recharger l'écran, qui la fabrique à l'ouverture.",
    );
  }
}

/**
 * Lit la **clé d'intention** d'un geste du staff dans l'en-tête
 * `Idempotency-Key` (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`,
 * revue, cas 4).
 *
 * L'écran la fabrique une fois par intention — à l'ouverture du dialogue ou
 * de l'action — et la renvoie à chaque clic : le serveur s'en sert comme
 * identifiant du geste, et un double clic ne réexécute rien. Obligatoire :
 * une requête sans clé est refusée (400), jamais complétée d'une clé tirée
 * au hasard qui rouvrirait le doublon. `lint:intent-key-gestures` vérifie
 * que chaque contrôleur d'un geste qui envoie un e-mail la lit.
 */
export const IntentKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const value = context.switchToHttp().getRequest<Request>().headers[INTENT_KEY_HEADER];
    if (typeof value !== "string" || !UUID.test(value)) {
      throw new MissingIntentKeyError();
    }
    return value.toLowerCase();
  },
);
