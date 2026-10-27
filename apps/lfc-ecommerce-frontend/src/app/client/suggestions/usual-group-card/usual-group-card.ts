import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { UsualSuggestionView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { sizedMedia } from '../../shop/media-source';
import { shelfArtOf } from '../../shop/shelf-display';
import { StaffSuggestionCard } from '../staff-suggestion-card/staff-suggestion-card';
import { UsualPicks } from '../usual-picks.service';

/** Les habituels d'un même rythme, réunis sous une raison. */
export interface UsualGroup {
  readonly key: string;
  readonly title: string;
  readonly views: readonly UsualSuggestionView[];
}

/** Au plus quatre photos : la mosaïque est une grille de deux sur deux. */
const MOSAIC_SIZE = 4;
const TILE_WIDTH = 280;

/**
 * Une carte d'habituels au format galerie (Hugo, 2026-10-27) : la mosaïque
 * des produits du groupe, sa raison et son compte. Le « + » la déplie sur la
 * liste défilante de ses articles, chacun avec sa fiche et son propre « + ».
 */
@Component({
  selector: 'app-usual-group-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, StaffSuggestionCard],
  templateUrl: './usual-group-card.html',
  styleUrl: './usual-group-card.scss',
})
export class UsualGroupCard {
  readonly group = input.required<UsualGroup>();

  protected readonly picks = inject(UsualPicks);
  protected readonly t = inject(ClientCopyService).t;
  protected readonly open = signal(false);

  protected readonly tiles = computed(() =>
    this.group()
      .views.slice(0, MOSAIC_SIZE)
      .map((view) => ({
        sku: view.sku,
        src: sizedMedia(
          (view.item.image ?? view.item.thumbnail)?.url ?? shelfArtOf(view.item.shelfId),
          TILE_WIDTH,
        ),
      })),
  );

  protected readonly count = computed(() =>
    fill(this.t().shop.usualGroupCount, { count: String(this.group().views.length) }),
  );

  protected readonly toggleLabel = computed(() =>
    fill(this.open() ? this.t().shop.usualCollapse : this.t().shop.usualExpand, {
      title: this.group().title,
    }),
  );
}
