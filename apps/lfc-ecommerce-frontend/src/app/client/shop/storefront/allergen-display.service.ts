import { Injectable, signal } from '@angular/core';
import type { StorefrontAllergenDisplay } from '@lfd/contracts';

/**
 * **Où la boutique montre les allergènes** — réglage global de la vitrine
 * (Hugo, 2026-10-27, `plan-allergenes-en-boutique.md`).
 *
 * Servi sur TOUTE page de vitrine : {@link ShopStorefront} le pose ici dès
 * qu'une page arrive, sans appel de plus. Un service à part, sans dépendance,
 * pour que la carte du rayon le lise sans tirer le réseau de la vitrine.
 * `sheet` (la fiche seulement) tant qu'aucune page ne l'a dit, ou qu'un
 * serveur d'avant ne le sert pas.
 */
@Injectable({ providedIn: 'root' })
export class ShopAllergenDisplay {
  private readonly value = signal<StorefrontAllergenDisplay>('sheet');

  readonly current = this.value.asReadonly();

  /** Ce qu'une page de vitrine a servi ; une page d'avant le réglage ne change rien. */
  served(display: StorefrontAllergenDisplay | undefined): void {
    if (display !== undefined) {
      this.value.set(display);
    }
  }
}
