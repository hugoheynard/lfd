import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldToastComponent,
} from 'fold-ng';

import { BatchUploadStore } from '../../state/batch-upload';
import { DescriptionWriter } from '../../gestures/description-writer';
import { FeedColors } from '../../state/feed-colors';
import { FeedCriteria } from '../../state/feed-criteria';
import { FeedTail } from '../feed-tail/feed-tail';
import { ImageActions } from '../../gestures/image-actions';
import { fileNameOf } from '../../rules/image-facts';
import { MediaDeposit } from '../media-deposit/media-deposit';
import { MediaFeedStore } from '../../state/media-feed';
import { MediaSeriesStore } from '../../state/media-series';
import { MediaToolbar } from '../media-toolbar/media-toolbar';
import { tileLabel, usesWording } from '../../rules/media-wording';
import { feedRows } from '../../rules/month-dividers';
import { PaletteBackfill } from '../../state/palette-backfill';
import { PaletteStrip } from '../palette-strip/palette-strip';
import { PaletteStripStore } from '../../state/palette-strip-store';
import { SeriesChip } from '../series-chip/series-chip';
import { SeriesEditor } from '../../gestures/series-editor';
import { TagBand } from '../tag-band/tag-band';
import { TagChip } from '../tag-chip/tag-chip';
import { TagGestures, UNDO_MS } from '../../gestures/tag-gestures';
import { TagPaletteStore, type PaletteTag } from '../../state/tag-palette';
import { TagVocabularyGestures } from '../../gestures/tag-vocabulary-gestures';

/**
 * **La médiathèque** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * Écran de premier niveau, et pas une vue du référentiel : les fiches portent
 * des visuels, les familles aussi, et les contenus de la vitrine en porteront.
 * Aucun d'eux ne possède la bibliothèque.
 *
 * La page COMPOSE et ne fait que ça : les critères tels que l'adresse les
 * porte ({@link FeedCriteria}), les gestes sur une image ({@link ImageActions})
 * et sur un mot ({@link TagGestures}, {@link TagVocabularyGestures}) vivent
 * dans leurs services, fournis ici pour mourir avec l'écran.
 *
 * 🔴 Ce que cet écran ne fait PAS, et qu'il ne faut pas lui ajouter par
 * commodité : dédoublonner. Le serveur groupe par URL — la seule identité qui
 * traverse deux enregistrements de fiche — et une seconde règle de groupement
 * ici finirait par ne plus dire la même chose que la première.
 */
@Component({
  selector: 'app-mediatheque-page',
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldToastComponent,
    FeedTail,
    MediaDeposit,
    MediaToolbar,
    PaletteStrip,
    RouterLink,
    SeriesChip,
    TagBand,
    TagChip,
  ],
  templateUrl: './mediatheque-page.html',
  styleUrl: './mediatheque-page.scss',
  // Fourni par la PAGE et non à la racine : un compte rendu de dépôt appartient
  // à l'écran qui l'a lancé, et le quitter doit l'oublier.
  providers: [
    BatchUploadStore,
    DescriptionWriter,
    FeedColors,
    FeedCriteria,
    ImageActions,
    MediaFeedStore,
    MediaSeriesStore,
    PaletteBackfill,
    PaletteStripStore,
    SeriesEditor,
    TagGestures,
    TagPaletteStore,
    TagVocabularyGestures,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediathequePage {
  protected readonly series = inject(MediaSeriesStore);
  private readonly seriesEditor = inject(SeriesEditor);
  protected readonly palette = inject(TagPaletteStore);
  protected readonly feed = inject(MediaFeedStore);
  /** Les critères de la grille, tels que l'adresse les porte. */
  protected readonly view = inject(FeedCriteria);
  protected readonly colors = inject(FeedColors);
  protected readonly colorStrip = inject(PaletteStripStore);
  protected readonly actions = inject(ImageActions);
  protected readonly gestures = inject(TagGestures);
  private readonly vocabulary = inject(TagVocabularyGestures);

  protected readonly undoMs = UNDO_MS;
  protected readonly label = tileLabel;

  /**
   * La grille avec ses intercalaires — le mois sous le tri par dépôt, la
   * série sous le tri par prise de vue (jamais par tag : Hugo, 2026-10-10).
   */
  protected readonly rows = computed(() => feedRows(this.feed.items(), this.view.criteria().sort));

  protected readonly tail = this.feed.tail;

  constructor() {
    // Les deux magasins absorbent leur échec dans `failure`, sciemment.
    void this.palette.refresh();
    void this.series.refresh();
  }

  /** La liste des séries ; une série corrigée fait relire la grille, une fois. */
  protected async manageSeries(): Promise<void> {
    if (await this.seriesEditor.manage()) {
      await this.feed.reload();
    }
  }

  /**
   * Ce que l'image porte, dit en toutes lettres.
   *
   * 🔴 Le compte d'emplois est affiché AVANT toute proposition de suppression,
   * et c'est le seul point de cet écran qui n'est pas décoratif : on ne
   * supprime pas une image qu'un porteur affiche, et la base le refuse. Sans
   * cette phrase, la règle s'apprendrait par un échec.
   */
  protected usesLabel(item: LibraryMediaView): string {
    return usesWording(item.uses);
  }

  /** Le nom de fichier, pour reconnaître une image qu'on n'a pas nommée. */
  protected fileOf(item: LibraryMediaView): string {
    return fileNameOf(item.url);
  }

  /** Renomme un mot partout ; le filtre le suit. */
  protected async rename(entry: PaletteTag): Promise<void> {
    const to = await this.vocabulary.rename(entry);
    if (to !== null) {
      await this.view.tagRenamed(entry.tag, to);
    }
  }

  /** Retire un mot de tout le fonds ; le filtre le relâche. */
  protected async removeEverywhere(entry: PaletteTag): Promise<void> {
    if (await this.vocabulary.remove(entry)) {
      await this.view.tagRemoved(entry.tag);
    }
  }

  protected async drop(event: DragEvent, item: LibraryMediaView): Promise<void> {
    event.preventDefault();
    await this.gestures.apply(item, event.dataTransfer?.getData('text/plain') ?? null);
  }
}
