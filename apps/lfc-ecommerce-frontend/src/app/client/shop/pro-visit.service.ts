import { computed, inject, Injectable, signal } from '@angular/core';

import { AuthFacade } from '../../auth/auth.facade';

/** La clé de la visite pro, le temps de l'onglet. */
const PRO_VISIT_KEY = 'lfd.shop.pro-visit';

/** Le fragment que la landing `/pro` pose sur le lien vers la boutique. */
export const PRO_VISIT_FRAGMENT = 'pro';

/**
 * **La visite pro** — un visiteur venu de la landing `/pro` (`/boutique#pro`)
 * lit la boutique aux tarifs professionnels hors taxe (Hugo, 2026-10-19).
 *
 * 🔴 **Elle ne vaut que pour un visiteur.** Une personne reconnue garde
 * l'affichage de son espace : c'est sa société, pas un fragment d'URL, qui
 * décide de son prix et de son assiette (`ShopPriceBasis`).
 *
 * Le choix dure la visite (`sessionStorage`) pour survivre aux allers-retours
 * entre rayons et fiche. L'accès est protégé : côté serveur `sessionStorage`
 * n'existe pas, et un navigateur peut le refuser — on retombe alors sur un
 * choix tenu en mémoire seulement.
 */
@Injectable({ providedIn: 'root' })
export class ProVisit {
  private readonly auth = inject(AuthFacade);
  private readonly chosen = signal(readStored());

  /** Vrai quand la boutique s'affiche en pro pour un visiteur non reconnu. */
  readonly active = computed(() => this.chosen() && !this.auth.isAuthenticated());

  /** Arrivée par `#pro` : la visite passe en affichage pro. */
  enter(): void {
    this.chosen.set(true);
    writeStored(true);
  }

  /** « Voir les prix TTC » : le choix s'efface. */
  leave(): void {
    this.chosen.set(false);
    writeStored(false);
  }
}

function readStored(): boolean {
  try {
    return sessionStorage.getItem(PRO_VISIT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(PRO_VISIT_KEY, '1');
    } else {
      sessionStorage.removeItem(PRO_VISIT_KEY);
    }
  } catch {
    // Stockage refusé ou absent (SSR) : le signal tient la visite en mémoire.
  }
}
