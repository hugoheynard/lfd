import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

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

/**
 * **Un geste envoyé sous la clé de son sujet**, oubliée au succès : un
 * réessai après un échec renvoie la même clé (l'API rend la réponse
 * d'origine), l'envoi suivant au succès est une intention neuve. Pour un
 * appelant sans écran — un outil de l'agent, dont l'intention est l'appel et
 * ses arguments — comme pour un service.
 */
export async function sentOnce<T>(
  intents: GestureIntents,
  subject: string,
  send: (intentKey: string) => Promise<T>,
): Promise<T> {
  const result = await send(intents.keyFor(subject));
  intents.done(subject);
  return result;
}

/** Le code de l'API pour un geste encore en vol : la clé reste, le premier envoi décide. */
const IN_FLIGHT_CODE = 'intent.in_flight';

/**
 * **Un geste dont la réponse montre un secret une fois** (un lien de mot de
 * passe, le secret d'un abonné) : envoyé sous la clé du sujet, puis la clé est
 * oubliée au succès — le clic suivant est un geste neuf.
 *
 * L'API ne garde pas le secret : un rejeu de la même clé est refusé en 409
 * (« déjà émis : émettez-en un nouveau »). Ce refus-là oublie aussi la clé,
 * pour que le clic qui suit le message fabrique bien un nouveau geste ; seul
 * « encore en vol » la garde.
 */
export async function shownOnce<T>(
  intents: GestureIntents,
  subject: string,
  send: (intentKey: string) => Promise<T>,
): Promise<T> {
  try {
    const result = await send(intents.keyFor(subject));
    intents.done(subject);
    return result;
  } catch (error) {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 409 &&
      codeOf(error) !== IN_FLIGHT_CODE
    ) {
      intents.done(subject);
    }
    throw error;
  }
}

function codeOf(error: HttpErrorResponse): string | null {
  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    return body.code;
  }
  return null;
}
