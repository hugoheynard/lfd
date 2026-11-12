import type { BusinessError } from "../shared/errors/app-error.js";
import type { IntentRecord } from "./gesture-intent.js";
import type { IntentCodec } from "./once-per-intent.js";

/**
 * Le codec d'un geste dont la réponse porte un **secret montré une fois** —
 * un lien de mot de passe, un secret de signature, la clé d'un paiement
 * (plan `documentation/ops/plan-idempotence-des-ecritures.md`, § 3).
 *
 * Le registre des intentions ne garde **aucun secret** : `keep` n'en retient
 * qu'un identifiant non secret, ou rien. Un rejeu de la même clé ne peut donc
 * pas rendre la réponse d'origine, et il ne refait pas le geste non plus : il
 * reçoit `refusal()`, un 409 qui nomme le geste et le geste de sortie
 * (« émettez-en un nouveau »). L'écran en tire une clé neuve à chaque geste
 * voulu ; seul un double envoi de la même intention tombe ici.
 */
export function shownOnceReplay<R>(
  keep: (result: R) => IntentRecord,
  refusal: () => BusinessError,
): IntentCodec<R> {
  return {
    write: keep,
    read: () => {
      throw refusal();
    },
  };
}
