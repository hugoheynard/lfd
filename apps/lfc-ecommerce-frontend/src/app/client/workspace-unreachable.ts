import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
// Par le sous-chemin sans zod : l'intercepteur est chargé au démarrage.
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { catchError, filter, firstValueFrom, NEVER, throwError } from 'rxjs';

import { AccountService } from '../account/account.service';
import { NotifyService } from '../notify.service';
import { WORKSPACE_RELOAD_ROUTE, WORKSPACE_UNKNOWN_HOME } from './client-workspace-switch.service';

/**
 * Le code que l'API rend (403) quand l'en-tête d'espace désigne une société
 * que la personne n'atteint plus — supprimée, résiliée, quittée (décision de
 * Hugo du 2026-11-22). `GET /me` reste servi : c'est par lui qu'on en sort.
 */
export const WORKSPACE_UNREACHABLE = 'auth.workspace_unreachable';

/**
 * **Quitte un espace devenu injoignable**, une seule fois par vague.
 *
 * Plusieurs écrans lisent au même instant, et tous prennent le même refus. Le
 * premier ouvre la vague : un toast, une relecture de `/me` — qui ne liste
 * plus la société, et `ClientWorkspace` retombe sur un espace atteignable par
 * sa règle par défaut —, puis un retour à l'accueil, par la route de
 * rechargement pour que chaque écran relise dans le nouvel espace. Les refus
 * suivants de la même vague n'ajoutent rien.
 *
 * Un espace déjà quitté une fois et refusé encore (le `/me` relu le désigne
 * toujours) ne relance pas de relecture : ce serait une boucle. Le refus suit
 * alors sa route, et l'écran dit qu'il n'a pas pu lire.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceUnreachableExit {
  private readonly account = inject(AccountService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private wave: Promise<void> | null = null;
  private readonly left = new Set<string>();

  /**
   * Prend le refus d'un espace. Rend `true` quand la sortie s'en charge — la
   * requête refusée n'a alors plus d'écran à servir —, `false` quand le refus
   * doit suivre sa route.
   */
  take(workspace: string | null, message: string): boolean {
    if (this.wave !== null) {
      return true;
    }
    if (workspace !== null && this.left.has(workspace)) {
      return false;
    }
    if (workspace !== null) {
      this.left.add(workspace);
    }
    this.notify.info(message);
    this.wave = this.leave().finally(() => {
      this.wave = null;
    });
    return true;
  }

  private async leave(): Promise<void> {
    this.account.load();
    await firstValueFrom(
      toObservable(this.account.status, { injector: this.injector }).pipe(
        filter((status) => status !== 'loading'),
      ),
    );
    await this.router.navigateByUrl(WORKSPACE_RELOAD_ROUTE, { skipLocationChange: true });
    await this.router.navigateByUrl(WORKSPACE_UNKNOWN_HOME, { replaceUrl: true });
  }
}

/**
 * Prend le refus `auth.workspace_unreachable`, quelle que soit la requête.
 *
 * La requête refusée ne rend alors **rien** (`NEVER`) : l'écran qui l'attendait
 * va être remplacé par la sortie, et lui laisser l'erreur ferait afficher à
 * chaque écran son propre 403 par-dessus le toast. Placé APRÈS
 * `workspaceInterceptor`, pour lire l'en-tête que celui-ci pose.
 */
export const workspaceUnreachableInterceptor: HttpInterceptorFn = (request, next) => {
  const exit = inject(WorkspaceUnreachableExit);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        httpErrorCode(error) === WORKSPACE_UNREACHABLE &&
        exit.take(request.headers.get(WORKSPACE_HEADER), httpErrorMessage(error))
      ) {
        return NEVER;
      }
      return throwError(() => error);
    }),
  );
};
