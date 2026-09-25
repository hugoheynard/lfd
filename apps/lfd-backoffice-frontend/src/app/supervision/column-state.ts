/**
 * **L'état d'UNE colonne de la Supervision.** Chaque lecture a le sien : une
 * lecture qui échoue n'efface pas les autres (plan §9).
 *
 * - `loading` : premier chargement, rien à montrer ;
 * - `error` : le premier chargement a échoué — `fold-empty-state` d'alerte ;
 * - `ready` : la donnée est là. `stale` = la dernière RELECTURE a échoué : le
 *   contenu reste à l'écran, un `fold-callout` le dit.
 */
export type ColumnState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly data: T; readonly stale: boolean };

export const LOADING: ColumnState<never> = { status: 'loading' };
export const FAILED: ColumnState<never> = { status: 'error' };

export function ready<T>(data: T): ColumnState<T> {
  return { status: 'ready', data, stale: false };
}

/** La donnée si elle est là, `null` sinon — pour les lectures qui en croisent une autre. */
export function dataOf<T>(state: ColumnState<T>): T | null {
  return state.status === 'ready' ? state.data : null;
}

/** Une relecture ratée garde la dernière donnée ; un premier chargement raté devient une erreur. */
export function afterFailure<T>(state: ColumnState<T>): ColumnState<T> {
  return state.status === 'ready' ? { ...state, stale: true } : FAILED;
}
