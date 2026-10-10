import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { catchError, throwError } from 'rxjs';

import { AuthFacade } from './auth.facade';

/**
 * Le code que l'API rend (403) à toute requête d'une personne dont
 * l'invitation a expiré (2026-10-10, `architecture-compte-client-cycle-de-vie.md`
 * §8.1 bis). Son message nomme le geste de sortie : c'est lui qu'on affiche.
 */
export const INVITATION_EXPIRED = 'account.invitation.expired';

/** La trace qui survit à la déconnexion : l'aller-retour Auth0 recharge la page. */
const NOTICE_KEY = 'lfc-invitation-expired';

/**
 * **« Votre invitation a expiré »** — le message du serveur, gardé pour être
 * lu APRÈS la déconnexion, sur `/connexion/erreur`.
 *
 * Même mécanique que `IdentityConflictNotice` : on sort tout de suite (sinon
 * chaque écran prendrait son propre 403), et l'avis vit dans le stockage de
 * session pour traverser le rechargement. Stockage refusé : l'avis se perd, la
 * sortie a lieu quand même.
 */
@Injectable({ providedIn: 'root' })
export class InvitationExpiredNotice {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly raisedHere = signal(false);

  /** Le message du serveur à montrer, ou `null`. */
  readonly pending = signal<string | null>(this.browser ? readNotice() : null);

  /**
   * Pose l'avis. Rend `true` la PREMIÈRE fois seulement : plusieurs requêtes
   * partent au chargement, et une seule doit déclencher la sortie.
   */
  raise(message: string): boolean {
    if (this.raisedHere()) {
      return false;
    }
    this.raisedHere.set(true);
    writeNotice(message);
    this.pending.set(message);
    return true;
  }

  /** Rend le message et l'efface : lu une fois, il ne ramène plus à l'écran. */
  take(): string | null {
    const message = this.pending();
    writeNotice(null);
    this.pending.set(null);
    return message;
  }
}

/**
 * Fait sortir la personne au premier refus `invitation.expired`, quel que soit
 * l'écran qui l'a reçu. L'erreur continue sa route : l'écran qui attendait une
 * réponse doit apprendre qu'il n'en aura pas.
 */
export const invitationExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const notice = inject(InvitationExpiredNotice);
  const auth = inject(AuthFacade);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        httpErrorCode(error) === INVITATION_EXPIRED &&
        notice.raise(httpErrorMessage(error))
      ) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};

function readNotice(): string | null {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY);
    return message === null || message === '' ? null : message;
  } catch {
    return null;
  }
}

function writeNotice(message: string | null): void {
  try {
    if (message === null) {
      sessionStorage.removeItem(NOTICE_KEY);
    } else {
      sessionStorage.setItem(NOTICE_KEY, message);
    }
  } catch {
    // Stockage refusé : l'avis ne survivra pas au rechargement, la sortie si.
  }
}
