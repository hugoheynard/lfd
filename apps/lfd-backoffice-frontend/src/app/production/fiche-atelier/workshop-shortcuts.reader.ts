import { computed, inject, Injectable, signal } from '@angular/core';
import type { WorkshopShortcutView } from '@lfd/contracts';

import { BatchShortcutsService } from '../batch-shortcuts.service';

/**
 * **Les raccourcis du fournil**, lus pour la fiche d'atelier (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S2).
 *
 * Une lecture pour toute la fiche, jamais une par ligne. Une lecture qui
 * échoue ne retire rien : le champ « Pièces sorties » se tape à la main.
 * Fourni par l'écran, comme {@link WorkshopTranchesReader}.
 */
@Injectable()
export class WorkshopShortcutsReader {
  private readonly api = inject(BatchShortcutsService);
  private readonly served = signal<Readonly<Record<string, readonly WorkshopShortcutView[]>>>({});

  /** Les raccourcis servis, par SKU produit. */
  readonly bySku = computed<ReadonlyMap<string, readonly WorkshopShortcutView[]>>(
    () => new Map(Object.entries(this.served())),
  );

  async load(): Promise<void> {
    try {
      this.served.set((await this.api.workshop()).bySku);
    } catch {
      // Un confort : sans eux, la quantité se saisit comme avant.
    }
  }
}
