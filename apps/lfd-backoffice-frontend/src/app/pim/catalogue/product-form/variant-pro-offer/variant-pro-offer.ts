import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { PublishedEntryView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldLinkComponent } from 'fold-ng';

import { CatalogueService } from '../../../../b2b/catalogue/catalogue.service';
import { ProductFormStore } from '../product-form-store';
import {
  proOfferNotesOf,
  proOfferSentence,
  settledAtCommerce,
  type ProOfferCause,
} from './pro-offer';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Ce que le canal pro ne propose pas, et pourquoi**
 * (`plan-pro-voit-les-declinaisons.md`, L6).
 *
 * Le référentiel ne lit pas le commerce (CLAUDE.md §3) : c’est l’ÉCRAN qui
 * lit, par le même chemin que « Catalogue publié » (`GET
 * admin/catalog/published`), l’état de chaque déclinaison telle que le
 * commerce la sert. Une validation pro en attente ou un masquage se lèvent à
 * cet écran-là : la mention y renvoie.
 *
 * Le commerce reçoit la fiche par un fait relayé : juste après un
 * enregistrement, l’état peut avoir un temps de retard.
 */
@Component({
  selector: 'app-variant-pro-offer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldLinkComponent],
  templateUrl: './variant-pro-offer.html',
  styleUrl: './variant-pro-offer.scss',
})
export class VariantProOffer {
  protected readonly store = inject(ProductFormStore);
  private readonly catalogue = inject(CatalogueService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  private readonly entry = signal<PublishedEntryView | undefined>(undefined);

  protected readonly notes = computed(() =>
    this.state() === 'ready'
      ? proOfferNotesOf(this.entry(), this.store.variantTabs(), this.store.variantsAsTiles())
      : [],
  );

  constructor() {
    effect(() => {
      const productId = this.store.productId();
      // Relu quand la fiche change de déclinaisons (créée, archivée, retarifée).
      this.store.variants();
      if (productId !== '') {
        void this.load(productId);
      }
    });
  }

  protected sentence(cause: ProOfferCause): string {
    return proOfferSentence(cause);
  }

  protected linksToCommerce(cause: ProOfferCause): boolean {
    return settledAtCommerce(cause);
  }

  protected openPublished(): void {
    void this.router.navigate(['/catalogue-publie']);
  }

  private async load(productId: string): Promise<void> {
    try {
      const view = await this.catalogue.published();
      this.entry.set(view.entries.find((entry) => entry.productId === productId));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
