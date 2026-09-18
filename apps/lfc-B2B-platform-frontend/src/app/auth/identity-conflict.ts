import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { httpErrorCode } from '@lfd/endpoints';
import { catchError, throwError } from 'rxjs';

import { AuthFacade } from './auth.facade';

/**
 * Le code que l'API rend quand une connexion **Google** arrive sous l'adresse
 * d'un compte qui existe déjà (`SocialSignInAccountExistsError`).
 */
export const IDENTITY_LINK_REQUIRED = 'account.identity.link_required';

/** La trace qui survit à la déconnexion : l'aller-retour Auth0 recharge la page. */
const NOTICE_KEY = 'lfc-identity-link-required';

/**
 * **« Un compte existe déjà avec cette adresse »** — l'avis qu'on montre après
 * avoir fait sortir la personne.
 *
 * ## Pourquoi sortir, et pourquoi un avis qui survit
 *
 * Une session Google refusée par l'API n'ouvre rien : chaque écran prendrait
 * son propre 409. On déconnecte donc tout de suite — et la déconnexion Auth0
 * recharge l'application. L'avis est gardé dans le stockage de session pour
 * être lu APRÈS ce rechargement, par le shell, là où le visiteur atterrit.
 *
 * Le stockage peut être refusé (navigation privée) : l'avis se perd alors,
 * mais la sortie a lieu quand même — ce qui compte le plus.
 */
@Injectable({ providedIn: 'root' })
export class IdentityConflictNotice {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly raisedHere = signal(false);

  /** L'avis est à montrer. */
  readonly pending = signal(this.browser && readNotice());

  /**
   * Pose l'avis. Rend `true` la PREMIÈRE fois seulement : plusieurs requêtes
   * partent au chargement, et une seule doit déclencher la sortie.
   */
  raise(): boolean {
    if (this.raisedHere()) {
      return false;
    }
    this.raisedHere.set(true);
    writeNotice(true);
    this.pending.set(true);
    return true;
  }

  dismiss(): void {
    writeNotice(false);
    this.pending.set(false);
  }
}

/**
 * Fait sortir la personne au premier refus `identity.link_required`, quel que
 * soit l'écran qui l'a reçu. L'erreur continue sa route : l'écran qui attendait
 * une réponse doit apprendre qu'il n'en aura pas.
 */
export const identityConflictInterceptor: HttpInterceptorFn = (request, next) => {
  const notice = inject(IdentityConflictNotice);
  const auth = inject(AuthFacade);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        httpErrorCode(error) === IDENTITY_LINK_REQUIRED &&
        notice.raise()
      ) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};

function readNotice(): boolean {
  try {
    return sessionStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeNotice(on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(NOTICE_KEY, '1');
    } else {
      sessionStorage.removeItem(NOTICE_KEY);
    }
  } catch {
    // Stockage refusé : l'avis ne survivra pas au rechargement, la sortie si.
  }
}
