import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
  FoldPanelHostService,
  FoldToastComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

import { BatchUploadStore } from '../batch-upload';
import { DescriptionWriter } from '../description-writer';
import { FeedCriteria } from '../feed-criteria';
import { FeedTail, type FeedTailState } from '../feed-tail/feed-tail';
import { ImageActions } from '../image-actions';
import { fileNameOf } from '../image-facts';
import { MediaDeposit } from '../media-deposit/media-deposit';
import { MediaFeedStore } from '../media-feed';
import { MediaSeriesStore } from '../media-series';
import { MediaToolbar } from '../media-toolbar/media-toolbar';
import { tileLabel, usesWording } from '../media-wording';
import { feedRows } from '../month-dividers';
import { PaletteBackfill } from '../palette-backfill';
import { PaletteStrip } from '../palette-strip/palette-strip';
import { PaletteStripStore } from '../palette-strip-store';
import { SeriesChip } from '../series-chip/series-chip';
import { SeriesEditor } from '../series-editor';
import { SeriesListPanel, type SeriesListPanelData } from '../series-list-panel/series-list-panel';
import { TagBand } from '../tag-band/tag-band';
import { TagChip } from '../tag-chip/tag-chip';
import { TagGestures, UNDO_MS } from '../tag-gestures';
import { TagPaletteStore, type PaletteTag } from '../tag-palette';
import { TagVocabularyGestures } from '../tag-vocabulary-gestures';

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
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  protected readonly feed = inject(MediaFeedStore);
  /** Les critères de la grille, tels que l'adresse les porte. */
  protected readonly view = inject(FeedCriteria);
  private readonly backfill = inject(PaletteBackfill);
  protected readonly colorStrip = inject(PaletteStripStore);
  protected readonly actions = inject(ImageActions);
  protected readonly gestures = inject(TagGestures);
  private readonly vocabulary = inject(TagVocabularyGestures);

  protected readonly undoMs = UNDO_MS;
  protected readonly label = tileLabel;

  /** Combien de colonnes la frise peut montrer — sa largeur, qu'elle annonce. */
  private readonly stripColumns = signal(0);

  /**
   * La grille avec ses intercalaires — le mois sous le tri par dépôt, la
   * série sous le tri par prise de vue (jamais par tag : Hugo, 2026-10-10).
   */
  protected readonly rows = computed(() => feedRows(this.feed.items(), this.view.criteria().sort));

  /** Ce que le bas de la grille dit. Un échec se dit au-dessus, pas ici. */
  protected readonly tail = computed<FeedTailState>(() => {
    if (this.feed.failure() !== null) {
      return 'idle';
    }
    if (this.feed.loading()) {
      return 'loading';
    }
    if (this.feed.hasMore()) {
      return 'more';
    }
    return this.feed.ended() ? 'end' : 'idle';
  });

  /**
   * Ce que la frise demande au serveur. Un lot de rattrapage des couleurs en
   * fait partie : chaque lot repeint change ce qu'elle dit, et doit la relire.
   */
  private readonly stripRequest = computed(() => ({
    criteria: this.view.criteria(),
    columns: this.stripColumns(),
    repainted: this.backfill.batches(),
  }));

  constructor() {
    // Les deux magasins absorbent leur échec dans `failure`, sciemment.
    void this.palette.refresh();
    void this.series.refresh();
    // LE RATTRAPAGE DES COULEURS (`mediatheque.md` §9 bis) : les images
    // chargées sans palette. Le serveur ne l'accepte que de qui écrit.
    effect(() => {
      const items = this.feed.items();
      if (this.permissions.can('media_library:write')) {
        this.backfill.offer(items);
      }
    });
    // LA FRISE : relue au serveur quand sa demande change.
    effect(() => {
      const { criteria, columns } = this.stripRequest();
      if (columns > 0) {
        void this.colorStrip.load(criteria, columns);
      }
    });
  }

  protected resizeStrip(columns: number): void {
    this.stripColumns.set(columns);
  }

  /**
   * Ouvre la liste des séries. « Modifier » et « Nouvelle série » ouvrent le
   * panneau de série PAR-DESSUS : la liste reste derrière, et se relit.
   *
   * Une série corrigée change ce que les tuiles montrent (titre, date) : la
   * grille est relue à la fermeture, une fois.
   */
  protected async manageSeries(): Promise<void> {
    let touched = false;
    await this.panels.open<SeriesListPanelData, void>(SeriesListPanel, {
      data: {
        series: () => this.series.all(),
        failure: () => this.series.failure(),
        edit: (series) => {
          // `edit` rend le refus dans son panneau ; il ne rejette pas.
          void this.seriesEditor.edit(series, true).then((id) => {
            touched ||= id !== undefined;
          });
        },
      },
    }).closed;
    if (touched) {
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
      await this.view.followTags(
        this.view.criteria().tags.map((kept) => (kept === entry.tag ? to : kept)),
      );
    }
  }

  /** Retire un mot de tout le fonds ; le filtre le relâche. */
  protected async removeEverywhere(entry: PaletteTag): Promise<void> {
    if (await this.vocabulary.remove(entry)) {
      await this.view.followTags(this.view.criteria().tags.filter((kept) => kept !== entry.tag));
    }
  }

  protected async drop(event: DragEvent, item: LibraryMediaView): Promise<void> {
    event.preventDefault();
    await this.gestures.apply(item, event.dataTransfer?.getData('text/plain') ?? null);
  }
}
