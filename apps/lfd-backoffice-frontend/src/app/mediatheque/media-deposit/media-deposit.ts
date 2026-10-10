import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { MEDIA_LIMITS, type MediaUploadFailureView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  type FoldBadgeVariant,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { BatchUploadStore, type UploadEntry, type UploadState } from '../batch-upload';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { MediaSeriesStore, seriesLabel } from '../media-series';
import { SeriesChip } from '../series-chip/series-chip';
import { SeriesEditor } from '../series-editor';

/** Le choix « aucune série » — une série n'a jamais un identifiant vide. */
export const NO_SERIES = '';
/** Le choix qui ouvre le panneau de création — jamais un identifiant ULID. */
export const NEW_SERIES = '__new__';

/** Ce que dit la pastille d'état de chaque ligne du compte rendu. */
const STATE_BADGES: Readonly<
  Record<UploadState, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  attente: { label: 'En attente', variant: 'neutral' },
  envoi: { label: 'Envoi…', variant: 'accent' },
  déposé: { label: 'Déposé', variant: 'success' },
  'déjà au fonds': { label: 'Déjà au fonds', variant: 'info' },
  refusé: { label: 'Refusé', variant: 'alert' },
};

/**
 * Ce qu'on dit d'une image déjà au fonds (D2, Hugo 2026-10-10) : elle GARDE
 * sa série d'origine. Sans alarme — rien n'est perdu, rien n'a changé.
 *
 * @param findTitle le titre d'une série connue, `null` si on ne la connaît pas.
 */
export function alreadyNote(
  entry: UploadEntry,
  batchSeriesId: string | null,
  findTitle: (id: string) => string | null,
): string {
  const origin = entry.seriesId;
  if (origin === null) {
    return batchSeriesId === null
      ? 'Rien n’a changé.'
      : 'Elle n’a pas de série et n’en reçoit pas : un redépôt ne la change pas.';
  }
  if (origin === batchSeriesId) {
    return 'Elle est déjà dans cette série.';
  }
  const title = findTitle(origin);
  return title === null
    ? 'Elle garde sa série d’origine.'
    : `Elle garde sa série d’origine, « ${title} ».`;
}

/**
 * **Le dépôt en lot** — choisir une série, déposer, lire le compte rendu, et
 * relire ce qui n'est pas entré les jours passés.
 *
 * Sorti de la page le 2026-10-10 (L3) : la série au dépôt et le compte rendu
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaDeposit {
  private readonly api = inject(MediaLibraryHttpApi);
  protected readonly batch = inject(BatchUploadStore);
  protected readonly series = inject(MediaSeriesStore);
  private readonly editor = inject(SeriesEditor);

  /** Au moins un fichier est passé : la grille est à relire. */
  readonly passed = output();

  /**
   * **Ce que le dépôt accepte**, dit AVANT qu'on essaie — lu du CONTRAT,
   * jamais recopié. La garde de transport (25 Mo) n'est pas annoncée : ce
   * n'est pas une règle mais une protection.
   */
  protected readonly limits = {
    accept: MEDIA_LIMITS.accept,
    hint: [
      MEDIA_LIMITS.formatLabels.join(' · '),
      `${String(MEDIA_LIMITS.maxBytes / (1024 * 1024))} Mo par image`,
      `${String(MEDIA_LIMITS.minEdgePixels)} × ${String(MEDIA_LIMITS.minEdgePixels)} px minimum`,
    ].join(' · '),
  };

  /** La série choisie pour le PROCHAIN lot. `''` = aucune (D3 : facultative). */
  protected readonly choice = signal<string>(NO_SERIES);
  /** La série du lot affiché dans le compte rendu — figée à l'envoi. */
  protected readonly batchSeries = signal<string | null>(null);

  protected readonly options = computed((): readonly FoldSelectOption<string>[] => [
    { value: NO_SERIES, label: 'Aucune série' },
    ...this.series.all().map((series) => ({ value: series.id, label: seriesLabel(series) })),
    { value: NEW_SERIES, label: 'Nouvelle série…' },
  ]);

  protected readonly chosen = computed(() => this.series.find(this.chosenId()));
  protected readonly shownBatchSeries = computed(() => this.series.find(this.batchSeries()));

  protected readonly pastFailures = signal<readonly MediaUploadFailureView[]>([]);
  protected readonly showPast = signal(false);

  /** L'identifiant réellement choisi, débarrassé des deux valeurs spéciales. */
  private chosenId(): string | null {
    const value = this.choice();
    return value === NO_SERIES || value === NEW_SERIES ? null : value;
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

  /**
   * Ouvre — ou referme — l'historique des refus, relu à l'ouverture : personne
   * ne le consulte à chaque visite.
   */
  protected async togglePast(): Promise<void> {
    const opening = !this.showPast();
    this.showPast.set(opening);
    if (!opening) {
      return;
    }
    try {
      this.pastFailures.set(await this.api.failures());
    } catch {
      // Muet et vide : un historique illisible n'est pas une panne du fonds.
      this.pastFailures.set([]);
    }
  }

  protected whenOf(failure: MediaUploadFailureView): string {
    return new Date(failure.occurredAt).toLocaleString('fr-FR');
  }
}
