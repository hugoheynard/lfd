import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { MediaLibrarySort } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldDateComponent,
  FoldListboxComponent,
  FoldSearchComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { TagChip } from '../tag-chip/tag-chip';
import { isFiltering, withoutFilters, type MediaFeedCriteria } from '../media-feed-url';

/** Les ordres du fonds, dits comme on les lit. */
const SORTS: readonly FoldSelectOption<MediaLibrarySort>[] = [
  { value: 'deposited', label: 'Plus récentes' },
  { value: 'name', label: 'Étiquette A→Z' },
  { value: 'uses', label: 'Plus employées' },
];

/**
 * **La barre d'outils de la grille** — chercher, trier, filtrer, compter.
 *
 * Elle ne lit rien et ne garde rien : elle reçoit les critères et rend les
 * suivants, ENTIERS. La page les écrit dans l'adresse et relit le fonds ; une
 * barre qui tiendrait sa propre copie finirait par montrer un filtre que la
 * grille n'applique pas.
 *
 * Les mots-clés retenus s'y affichent armés, avec leur × : c'est la bande qui
 * les retient (« Filtrer sur ce mot-clé »), la barre qui les montre et les
 * relâche.
 */
@Component({
  selector: 'app-media-toolbar',
  imports: [
    FoldButtonComponent,
    FoldDateComponent,
    FoldListboxComponent,
    FoldSearchComponent,
    TagChip,
  ],
  templateUrl: './media-toolbar.html',
  styleUrl: './media-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaToolbar {
  readonly criteria = input.required<MediaFeedCriteria>();
  /** Le total du filtre ; `null` tant qu'il n'est pas lu. */
  readonly total = input<number | null>(null);
  readonly changed = output<MediaFeedCriteria>();

  protected readonly sorts = SORTS;
  protected readonly filtering = computed(() => isFiltering(this.criteria()));

  protected readonly count = computed(() => {
    const total = this.total();
    if (total === null) {
      return null;
    }
    return total === 1 ? '1 image' : `${String(total)} images`;
  });

  protected set(patch: Partial<MediaFeedCriteria>): void {
    this.changed.emit({ ...this.criteria(), ...patch });
  }

  protected release(tag: string): void {
    this.set({ tags: this.criteria().tags.filter((kept) => kept !== tag) });
  }

  protected showAll(): void {
    this.changed.emit(withoutFilters(this.criteria()));
  }

  /** Une borne vide n'en est pas une : `undefined` laisse le champ libre. */
  protected bound(day: string): string | undefined {
    return day === '' ? undefined : day;
  }
}
