import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { MediaSeriesView } from '@lfd/pim-contracts';
import {
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { ReplacementDeposit } from '../../gestures/replacement-deposit';
import type { ImageDescription } from '../../rules/image-description';
import type { ReplaceCandidate } from '../../rules/replace-rules';
import { chosenSeriesId, NO_SERIES, seriesOptions } from '../../rules/series';
import { UPLOAD_LIMITS } from '../../rules/upload-check';

/**
 * **Déposer la remplaçante** — la série où la ranger, la zone de dépôt, et le
 * refus s'il y en a un. Le fichier déposé est DÉSIGNÉ, pas encore posé : le
 * remplacement reste au panneau.
 *
 * La série vit chez le panneau (`[(seriesId)]`) : revenir au choix ne la
 * remet pas à celle d'origine.
 */
@Component({
  selector: 'app-replace-deposit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent, FoldFileDropzoneComponent, FoldCalloutComponent],
  templateUrl: './replace-deposit.html',
  styleUrl: './replace-deposit.scss',
})
export class ReplaceDeposit {
  private readonly depositing = inject(ReplacementDeposit);

  readonly seriesChoices = input.required<() => readonly MediaSeriesView[]>();
  /** La description d'une image du fil chargé — cf. `ReplacePanelData.lookup`. */
  readonly lookup = input.required<(url: string) => ImageDescription | null>();
  readonly seriesId = model(NO_SERIES);

  /** Un dépôt part : le refus précédent du remplacement ne vaut plus. */
  readonly started = output();
  readonly designated = output<ReplaceCandidate>();

  protected readonly limits = UPLOAD_LIMITS;
  protected readonly uploading = signal(false);
  protected readonly depositRefusal = signal<string | null>(null);
  protected readonly seriesOptions = computed((): readonly FoldSelectOption<string>[] =>
    seriesOptions(this.seriesChoices()()),
  );

  /** Dépose UN fichier et le désigne — cf. {@link ReplacementDeposit}. */
  protected async deposit(files: readonly File[]): Promise<void> {
    const file = files[0];
    if (file === undefined || this.uploading()) {
      return;
    }
    this.depositRefusal.set(null);
    this.started.emit();
    this.uploading.set(true);
    const outcome = await this.depositing.deposit(
      file,
      chosenSeriesId(this.seriesId()),
      this.lookup(),
    );
    this.uploading.set(false);
    if ('refusal' in outcome) {
      this.depositRefusal.set(outcome.refusal);
    } else {
      this.designated.emit(outcome);
    }
  }
}
