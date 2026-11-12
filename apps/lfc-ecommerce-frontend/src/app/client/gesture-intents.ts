import { HttpErrorResponse, HttpHeaders, type HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';

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
 * Seule exception : une clé refusée comme déjà servie sur un autre contenu
 * (409 `intent.key_reused`, {@link refusedIntentKeyInterceptor}) est oubliée.
 */
export class GestureIntents {
  private readonly keys = new Map<string, string>();

  /** La clé de l'intention en cours pour ce sujet, fabriquée si besoin. */
  keyFor(subject: string): string {
    const known = this.keys.get(subject);
    if (known !== undefined && !refusedKeys.delete(known)) return known;
    const fresh = crypto.randomUUID();
    this.keys.set(subject, fresh);
    return fresh;
  }

  /** Le geste a abouti : le prochain envoi sur ce sujet est une intention neuve. */
  done(subject: string): void {
    this.keys.delete(subject);
  }
}

/** Le code de l'API pour une clé déjà servie sur un autre contenu, ou un autre geste. */
const KEY_REUSED_CODE = 'intent.key_reused';

/**
 * Les clés que l'API a refusées comme déjà servies sur un autre contenu
 * (409 `intent.key_reused`). Une telle clé ne passera plus jamais : la garder
 * bloquerait l'écran sur le même refus à chaque nouvel essai. Tenues ici, au
 * niveau du module, parce que l'intercepteur qui les voit ne connaît pas
 * l'écran qui les a fabriquées.
 */
const refusedKeys = new Set<string>();

/**
 * **Oublie une clé refusée comme déjà servie** : sur un 409
 * `intent.key_reused`, la clé de la requête est marquée, et le prochain
 * {@link GestureIntents.keyFor} du sujet en fabrique une neuve. Le refus
 * lui-même remonte à l'écran inchangé : il affiche le message, pas un succès.
 */
export const refusedIntentKeyInterceptor: HttpInterceptorFn = (request, next) => {
  const key = request.headers.get(INTENT_KEY_HEADER);
  if (key === null) return next(request);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 409 &&
          codeOf(error) === KEY_REUSED_CODE
        ) {
          refusedKeys.add(key);
        }
      },
    }),
  );
};

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
