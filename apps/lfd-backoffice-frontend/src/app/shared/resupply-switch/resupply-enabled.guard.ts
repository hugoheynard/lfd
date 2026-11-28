import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { ResupplySwitchStore } from './resupply-switch.store';

/**
 * Ferme une route du réassort tant que l'interrupteur est éteint, et renvoie à
 * l'atterrissage de son espace — qui ouvre alors le premier onglet permis. Une
 * adresse tapée ou un favori ne rouvre donc pas un écran que le serveur
 * refuserait d'écrire.
 */
export function resupplyEnabledGuard(landing: string): CanActivateFn {
  return async () => {
    const store = inject(ResupplySwitchStore);
    const router = inject(Router);
    await store.ensureLoaded();
    return store.enabled() ? true : router.parseUrl(landing);
  };
}
