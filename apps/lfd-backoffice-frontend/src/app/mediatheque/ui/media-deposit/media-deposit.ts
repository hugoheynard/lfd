import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { MediaUploadFailureView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  type FoldBadgeVariant,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { BatchUploadStore } from '../../state/batch-upload';
import type { UploadEntry } from '../../rules/upload-entry';
import { UploadFailuresStore } from '../../state/upload-failures';
import { NEW_SERIES, STATE_BADGES, alreadyNote } from '../../rules/upload-report';
import { MediaSeriesStore } from '../../state/media-series';
import { NO_SERIES, chosenSeriesId, seriesOptions } from '../../rules/series';
import { SeriesChip } from '../series-chip/series-chip';
import { SeriesEditor } from '../../gestures/series-editor';
import { UPLOAD_LIMITS } from '../../rules/upload-check';

/**
 * **Le dépôt en lot** — choisir une série, déposer, lire le compte rendu, et
 * relire ce qui n'est pas entré les jours passés.
 *
 * Sorti de la page le 2026-10-10 : la série au dépôt et le compte rendu
 * détaillé y ajoutaient un sujet entier, et la page en portait déjà quatre.
 *
 * Il ne relit pas le fonds : il dit à la page qu'un lot est passé (`passed`),
 * et c'est elle qui relit, une fois, depuis le début.
 */
@Component({
  selector: 'app-media-deposit',
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFileDropzoneComponent,
    FoldListboxComponent,
    SeriesChip,
  ],
  templateUrl: './media-deposit.html',
  styleUrl: './media-deposit.scss',
  providers: [UploadFailuresStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaDeposit {
  protected readonly batch = inject(BatchUploadStore);
  protected readonly series = inject(MediaSeriesStore);
  private readonly editor = inject(SeriesEditor);

  /** Au moins un fichier est passé : la grille est à relire. */
  readonly passed = output();

  protected readonly limits = UPLOAD_LIMITS;

  /** La série choisie pour le PROCHAIN lot. `''` = aucune (facultative, `mediatheque.md` §5). */
  protected readonly choice = signal<string>(NO_SERIES);
  /** La série du lot affiché dans le compte rendu — figée à l'envoi. */
  protected readonly batchSeries = signal<string | null>(null);

  protected readonly options = computed((): readonly FoldSelectOption<string>[] => [
    ...seriesOptions(this.series.all()),
    { value: NEW_SERIES, label: 'Nouvelle série…' },
  ]);

  protected readonly chosen = computed(() => this.series.find(this.chosenId()));
  protected readonly shownBatchSeries = computed(() => this.series.find(this.batchSeries()));

  protected readonly past = inject(UploadFailuresStore);
  protected readonly pastFailures = this.past.failures;
  protected readonly showPast = this.past.open;

  /** L'identifiant réellement choisi, débarrassé des deux valeurs spéciales. */
  private chosenId(): string | null {
    const value = this.choice();
    return value === NEW_SERIES ? null : chosenSeriesId(value);
  }

  /**
   * Le choix d'une série. « Nouvelle série… » ouvre le panneau ; annulé, le
   * choix revient où il était — jamais sur « Nouvelle série… », qui n'est pas
   * une série.
   *
   * ⚠️ Le signal passe PAR `NEW_SERIES` avant de revenir : la liste a déjà
   * affiché ce choix, et reposer la valeur d'avant sans changement ne lui
   * serait pas renvoyé.
   */
  protected async pick(value: string): Promise<void> {
    if (value !== NEW_SERIES) {
      this.choice.set(value);
      return;
    }
    const previous = this.choice();
    this.choice.set(NEW_SERIES);
    const created = await this.editor.edit(null);
    this.choice.set(created ?? previous);
  }

  protected clearChoice(): void {
    this.choice.set(NO_SERIES);
  }

  /**
   * Dépose la sélection dans la série choisie. Le lot ne s'arrête jamais sur
   * un refus ; la page relit le fonds une seule fois, à la fin.
   */
  protected async deposit(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    const seriesId = this.chosenId();
    this.batchSeries.set(seriesId);
    if ((await this.batch.send(files, seriesId)) > 0) {
      // Le compte d'images des séries a bougé.
      await this.series.refresh();
      this.passed.emit();
    }
  }

  protected async retry(): Promise<void> {
    if ((await this.batch.retry()) > 0) {
      await this.series.refresh();
      this.passed.emit();
    }
  }

  protected badgeOf(entry: UploadEntry): {
    readonly label: string;
    readonly variant: FoldBadgeVariant;
  } {
    return STATE_BADGES[entry.state];
  }

  protected alreadyOf(entry: UploadEntry): string {
    return alreadyNote(entry, this.batchSeries(), (id) => this.series.find(id)?.title ?? null);
  }

  /** Ouvre — ou referme — l'historique des refus, cf. {@link UploadFailuresStore}. */
  protected async togglePast(): Promise<void> {
    await this.past.toggle();
  }

  protected whenOf(failure: MediaUploadFailureView): string {
    return new Date(failure.occurredAt).toLocaleString('fr-FR');
  }
}
