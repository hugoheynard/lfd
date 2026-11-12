import { HttpHeaders } from '@angular/common/http';

/** L'en-tête qui porte la clé d'intention d'un geste (lu par l'API, `@IntentKey()`). */
export const INTENT_KEY_HEADER = 'Idempotency-Key';

/** Les options HTTP d'un geste porteur de sa clé d'intention. */
export function intentOptions(intentKey: string): { readonly headers: HttpHeaders } {
  return { headers: new HttpHeaders({ [INTENT_KEY_HEADER]: intentKey }) };
}

/** Ajoute la clé d'intention à des en-têtes déjà posés (le jeton, par exemple). */
export function withIntent(headers: HttpHeaders, intentKey: string): HttpHeaders {
  return headers.set(INTENT_KEY_HEADER, intentKey);
}

/**
 * **Les intentions d'un écran de la boutique** — une clé par geste voulu (plan
 * `documentation/ops/plan-idempotence-des-ecritures.md`, § 4 et § 7). La même
 * brique que celle du back-office.
 *
 * L'écran fabrique la clé à la première demande pour un sujet, et la renvoie
 * à chaque envoi tant que le geste n'a pas abouti : l'API s'en sert comme
 * identifiant du geste, et un double clic — ou un réseau qui coupe après
 * l'envoi — ne crée pas deux fois la même chose. Une fois le geste abouti,
 * {@link done} l'oublie : l'envoi suivant est une intention neuve.
 *
 * Un échec garde la clé : l'API a rendu l'intention, le réessai repasse.
 */
export class GestureIntents {
  private readonly keys = new Map<string, string>();

  /** La clé de l'intention en cours pour ce sujet, fabriquée si besoin. */
  keyFor(subject: string): string {
    const known = this.keys.get(subject);
    if (known !== undefined) return known;
    const fresh = crypto.randomUUID();
    this.keys.set(subject, fresh);
    return fresh;
  }

  /** Le geste a abouti : le prochain envoi sur ce sujet est une intention neuve. */
  done(subject: string): void {
    this.keys.delete(subject);
  }
}
