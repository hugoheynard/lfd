import { HttpErrorResponse } from '@angular/common/http';

/**
 * **Le tri des échecs d'une file hors ligne** : ce qui se réessaie, et ce qui
 * ne passera jamais.
 *
 * Partagé par `WorksheetQueue` et `PackingQueue`, qui gardent chacune leur
 * mécanique. C'est la seule pièce mise en commun, et c'est délibéré : les deux
 * files ont des clés et des routes différentes, mais **une seule décision** sur
 * ce qu'un refus veut dire. La laisser recopiée dans deux fichiers, c'était la
 * garantie qu'elle diverge au premier statut ajouté — et c'est précisément
 * l'absence de cette décision qui bloquait les deux files à vie (dette ouverte
 * et fermée le 2026-09-13/14).
 */

/** Un refus DÉFINITIF : le geste sort de la file, et l'écran le dit. */
export interface Refusal {
  readonly status: number;
  /** Le message du serveur, écrit pour le personnel — ou un repli neutre. */
  readonly message: string;
}

/** Un geste écarté, tel que l'écran le montre avant qu'on en prenne acte. */
export interface Rejected<M> {
  readonly mark: M;
  readonly message: string;
}

/**
 * Les statuts qu'on RÉESSAIE, bien qu'ils soient des 4xx.
 *
 * - `0` : pas de réponse du tout — le sous-sol, le cas pour lequel la file existe ;
 * - `401` : la session a expiré. Le geste est juste, c'est la personne qu'il
 *   faut reconnecter ; l'écarter ferait perdre une coche légitime ;
 * - `408`, `425`, `429` : le serveur demande d'attendre, il ne dit pas non.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([0, 401, 408, 425, 429]);

const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

const FALLBACK_MESSAGE = 'Le serveur a refusé ce geste.';

/**
 * `null` quand le geste doit **rester** en file ; un {@link Refusal} quand il ne
 * passera jamais.
 *
 * 🔴 **Une erreur qu'on ne sait pas lire est gardée**, jamais écartée. Écarter
 * un geste est le seul choix irréversible de la file : sur une erreur inconnue —
 * une exception JavaScript, un objet sans statut —, se tromper en gardant coûte
 * un compteur qui ne descend pas, se tromper en jetant coûte une coche perdue.
 * Seul un 4xx explicite du serveur est une preuve de refus.
 *
 * Un 5xx est gardé aussi : le serveur est tombé, il n'a rien jugé.
 */
export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const { status } = error;
  if (
    RETRYABLE_STATUSES.has(status) ||
    status < CLIENT_ERROR_FLOOR ||
    status >= SERVER_ERROR_FLOOR
  ) {
    return null;
  }
  return { status, message: messageOf(error.error) };
}

/**
 * Le `message` de l'enveloppe d'erreur de l'API (`{ code, message, requestId }`).
 *
 * Un tableau (la forme des erreurs de validation de Nest) ou une chaîne vide
 * tombent sur le repli : un message à moitié lisible ferait plus de mal qu'un
 * message neutre, lu par quelqu'un qui a les mains dans la pâte.
 */
function messageOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return FALLBACK_MESSAGE;
  }
  const envelope: Partial<Record<'message', unknown>> = body;
  const message = typeof envelope.message === 'string' ? envelope.message.trim() : '';
  return message === '' ? FALLBACK_MESSAGE : message;
}
