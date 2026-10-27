import { HttpErrorResponse, HttpStatusCode, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthFacade } from './auth.facade';

/**
 * Un **401 sur un appel authentifié** — porteur d'un `Authorization` — veut
 * dire que l'API ne reconnaît plus le jeton : la session a expiré, même si
 * Auth0 se croit encore connecté. On le dit à la façade, à UN seul endroit,
 * plutôt que de laisser chaque écran avaler son refus en liste vide (bug de
 * production du 2026-10-27, « Mes commandes » vide sans état).
 *
 * Un 401 sur un appel ANONYME n'est pas une session expirée : il n'y en avait
 * pas. L'erreur continue sa route — l'écran qui attendait doit l'apprendre.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthFacade);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === HttpStatusCode.Unauthorized &&
        request.headers.has('Authorization')
      ) {
        auth.markSessionExpired();
      }
      return throwError(() => error);
    }),
  );
};
