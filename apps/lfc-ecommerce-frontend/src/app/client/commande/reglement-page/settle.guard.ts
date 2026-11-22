import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';
import { of } from 'rxjs';

import { AuthFacade } from '../../../auth/auth.facade';
import { HeldOrderPayment } from '../../held-order-payment.service';

/**
 * **Qui entre sur la page de règlement** (`/reglement/:id`).
 *
 * - le visiteur qui vient de passer la commande : la boutique tient son
 *   paiement en mémoire, connecté ou non ;
 * - sinon, un client connecté — c'est lui qu'atteint un lien de règlement
 *   envoyé par e-mail ou copié du back-office ;
 * - sinon, la connexion d'abord, puis retour ici (`returnTo`). Sans cette
 *   garde, un client arrivé par un lien lisait « règlement clos » : la page ne
 *   peut rien demander au serveur pour quelqu'un qu'elle ne connaît pas.
 *
 * L'état de connexion s'attend (`authGate$`), comme pour `authenticatedGuard` :
 * le lire avant que le SDK soit prêt renverrait vers la connexion un client
 * déjà connecté.
 */
export const settleGuard: CanActivateFn = (route, state) => {
  const orderId = route.paramMap.get('id') ?? '';
  if (inject(HeldOrderPayment).holdsPaymentFor(orderId)) {
    return of(true);
  }
  const router = inject(Router);
  return inject(AuthFacade)
    .authGate$()
    .pipe(
      map((isAuthenticated) =>
        isAuthenticated
          ? true
          : router.createUrlTree(['/login'], { queryParams: { returnTo: state.url } }),
      ),
    );
};
