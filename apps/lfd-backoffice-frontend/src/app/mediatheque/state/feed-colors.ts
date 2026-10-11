import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { PermissionsStore } from '../../auth/permissions.store';
import { FeedCriteria } from './feed-criteria';
import { MediaFeedStore } from './media-feed';
import { PaletteBackfill } from './palette-backfill';
import { PaletteStripStore } from './palette-strip-store';

/**
 * **Les couleurs du fil** — la frise relue quand sa demande change, et le
 * rattrapage des palettes manquantes (`mediatheque.md` §9 bis).
 *
 * Les deux sont liés : chaque lot repeint change ce que dit la frise, et doit
 * la relire. Fourni par la page, comme le fil qu'il observe.
 */
@Injectable()
export class FeedColors {
  private readonly feed = inject(MediaFeedStore);
  private readonly view = inject(FeedCriteria);
  private readonly permissions = inject(PermissionsStore);
  private readonly backfill = inject(PaletteBackfill);
  private readonly strip = inject(PaletteStripStore);

  /** Combien de colonnes la frise peut montrer — sa largeur, qu'elle annonce. */
  private readonly columns = signal(0);

  /**
   * Ce que la frise demande au serveur. Un lot de rattrapage des couleurs en
   * fait partie : chaque lot repeint change ce qu'elle dit, et doit la relire.
   */
  private readonly request = computed(() => ({
    criteria: this.view.criteria(),
    columns: this.columns(),
    repainted: this.backfill.batches(),
  }));

  constructor() {
    // LE RATTRAPAGE : les images chargées sans palette. Le serveur ne
    // l'accepte que de qui écrit.
    effect(() => {
      const items = this.feed.items();
      if (this.permissions.can('media_library:write')) {
        this.backfill.offer(items);
      }
    });
    // LA FRISE : relue au serveur quand sa demande change.
    effect(() => {
      const { criteria, columns } = this.request();
      if (columns > 0) {
        void this.strip.load(criteria, columns);
      }
    });
  }

  resize(columns: number): void {
    this.columns.set(columns);
  }
}
