import { HttpErrorResponse } from '@angular/common/http';

import { serverMessageOf } from '../../server-message';

/**
 * **Ce que la fiche d'atelier dit d'un envoi qui n'a pas abouti** : refus du
 * serveur, silence, ou geste gardé dans la file d'envoi.
 */

/**
 * La réponse n'est pas arrivée : le serveur a peut-être écrit. On ne reprend
 * pas `serverMessageOf`, qui dirait « rien n'a été enregistré » — c'est
 * justement ce qu'on ne sait pas.
 */
const NO_ANSWER =
  'Le serveur n’a pas répondu — réessayez : la même fournée ne comptera pas deux fois.';

/** Une fournée gardée dans la file : elle partira seule, le dire sans alarmer. */
export const BATCH_KEPT =
  'Pas de réponse du serveur : la fournée est gardée sur cet appareil et repartira dès le retour du réseau — la même fournée ne comptera pas deux fois.';

/** Un « Fait » gardé dans la file : il partira seul. */
export const DONE_KEPT =
  'Pas de réponse du serveur : « Fait » est gardé sur cet appareil et repartira dès le retour du réseau — il ne comptera qu’une fois.';

/** Le serveur n'a pas répondu (réseau coupé, délai) : il a peut-être écrit. */
export function isOffline(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 0;
}

/** Le geste n'est pas parti mais il est gardé dans la file : il repartira. */
export class GestureKept extends Error {
  constructor(readonly said: string) {
    super('geste gardé dans la file d’envoi');
    this.name = 'GestureKept';
  }
}

/** La raison d'un échec, dans les mots que la fiche affiche. */
export function reasonOf(error: unknown): string {
  if (error instanceof GestureKept) {
    return error.said;
  }
  return isOffline(error) ? NO_ANSWER : serverMessageOf(error);
}
