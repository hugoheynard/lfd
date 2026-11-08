import { HttpHeaders } from '@angular/common/http';

/** L'en-tête qui porte la clé d'intention d'un geste (lu par l'API, `@IntentKey()`). */
export const INTENT_KEY_HEADER = 'Idempotency-Key';

/** Les options HTTP d'un geste porteur de sa clé d'intention. */
export function intentOptions(intentKey: string): { readonly headers: HttpHeaders } {
  return { headers: new HttpHeaders({ [INTENT_KEY_HEADER]: intentKey }) };
}

/**
 * **Les intentions d'un écran** — une clé par geste voulu (plan
 * `documentation/mail/plan-service-e-mails.md`, revue avec
 * Hugo, cas 4).
 *
 * L'écran fabrique la clé à la première demande pour un sujet, et la renvoie
 * à chaque clic tant que le geste n'a pas abouti : l'API s'en sert comme
 * identifiant du geste, et un double clic ne renvoie pas deux e-mails. Une
 * fois le geste abouti, {@link done} l'oublie : le clic suivant est un vrai
 * renvoi, avec une clé neuve. C'est la forme de l'annonce de la vitrine
 * (`vitrine-notice-panel`), tenue par sujet pour les listes.
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

  /** Le geste a abouti : le prochain clic sur ce sujet est une intention neuve. */
  done(subject: string): void {
    this.keys.delete(subject);
  }
}
