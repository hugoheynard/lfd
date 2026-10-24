import { Injectable, inject, signal } from '@angular/core';

import type { SitePaletteEntryView } from '@lfd/contracts';

import { SitePaletteService } from './site-palette.service';

/**
 * **La palette des sites, à l'écran** — source réactive unique des couleurs
 * de la logistique (plan `commandes/back-office/tri-depart-et-couleurs.md`, L1b).
 *
 * Relue À CHAQUE écran qui s'ouvre (`refresh()`), jamais au démarrage : tout
 * le monde n'a pas le droit de la lire, et une couleur changée en Réglages ›
 * Sites doit se voir au prochain affichage (Hugo, 2026-10-13).
 *
 * Une palette illisible (refus, panne) laisse la liste VIDE : toutes les
 * commandes passent alors en teinte neutre — l'écran reste utilisable, la
 * couleur n'étant qu'une aide. La raison est retenue dans `loadError`, jamais
 * absorbée en silence.
 */
@Injectable({ providedIn: 'root' })
export class SitePaletteStore {
  private readonly service = inject(SitePaletteService);

  private readonly state = signal<readonly SitePaletteEntryView[]>([]);
  readonly sites = this.state.asReadonly();

  private readonly error = signal<unknown>(null);
  /** Pourquoi la palette est vide — `null` : elle a été lue. */
  readonly loadError = this.error.asReadonly();

  /** Relit la palette ; un échec garde la liste précédente et retient sa raison. */
  async refresh(): Promise<void> {
    try {
      const view = await this.service.palette();
      this.state.set(view.sites);
      this.error.set(null);
    } catch (error: unknown) {
      this.error.set(error);
    }
  }
}
