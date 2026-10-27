import { throwError, type Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Un jeton qui ne s'obtient plus — `login_required`, `invalid_grant`,
 * `missing_refresh_token`… — signale la session expirée, puis **rejette** :
 * l'appelant apprend l'échec au lieu d'attendre une valeur qui ne viendra pas.
 *
 * Extrait de la façade pour être éprouvé : les tests tournent en bypass dev,
 * où la façade ne demande jamais de jeton au SDK.
 */
export function expiringOnFailure<T>(token$: Observable<T>, expire: () => void): Observable<T> {
  return token$.pipe(
    catchError((error: unknown) => {
      expire();
      return throwError(() => error);
    }),
  );
}
