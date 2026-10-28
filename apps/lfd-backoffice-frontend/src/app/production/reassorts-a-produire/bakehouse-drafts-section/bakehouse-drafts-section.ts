import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { BakehouseResupplyDraftView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldCalloutComponent } from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseDraftList } from '../bakehouse-draft-list/bakehouse-draft-list';
import { BakehouseDraftsStore } from '../bakehouse-drafts.store';

/**
 * **Les brouillons ouverts, sur la liste des réassorts** (Hugo, 2026-10-28 :
 * la page montre ce qui est demandé, et la composition a sa propre page).
 * « Reprendre » ouvre `…/reassorts/brouillon/:id` ; « Supprimer » clôt ici.
 * Sans brouillon, rien ne s'affiche.
 */
@Component({
  selector: 'app-bakehouse-drafts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BakehouseDraftList, FoldCalloutComponent],
  providers: [BakehouseDraftsStore],
  templateUrl: './bakehouse-drafts-section.html',
})
export class BakehouseDraftsSection {
  private readonly router = inject(Router);
  private readonly pickups = inject(PickupAddressesService);
  protected readonly store = inject(BakehouseDraftsStore);

  private readonly sites = signal<readonly { id: string; label: string }[]>([]);
  protected readonly siteLabels = computed(
    () => new Map(this.sites().map((site) => [site.id, site.label] as const)),
  );
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    void this.store.reload();
    void this.pickups.list().then(
      (sites) => this.sites.set(sites.map((site) => ({ id: site.id, label: site.label }))),
      // Sans libellés, la ligne dit « Point inconnu » : le brouillon reste repris.
      () => undefined,
    );
  }

  protected resume(draft: BakehouseResupplyDraftView): void {
    void this.router.navigate(['/prod-manager/reassorts/brouillon', draft.id]);
  }

  protected async discard(draft: BakehouseResupplyDraftView): Promise<void> {
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.store.discard(draft);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le brouillon n'a pas pu être supprimé."));
    } finally {
      this.pending.set(false);
    }
  }
}
