import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonIconComponent,
  FoldInlineConfirmComponent,
  type FoldInlineConfirmLabels,
} from 'fold-ng';

import type { WorkshopBatch } from '@lfd/contracts';

import { hourLabel } from '../../worksheet-day';

/** Une fournée telle que la puce la dit : « 5 h 10 · CR · 60 ». */
interface ShownBatch {
  readonly batch: WorkshopBatch;
  readonly said: string;
  readonly labels: Partial<FoldInlineConfirmLabels>;
}

/**
 * **Les fournées d'une ligne**, en puces — chacune s'annule en deux temps :
 * ✕, puis « Annuler 24 ? » (plan `documentation/fournil/plan-fournee-v3.md`
 * §4.5). N'importe quel poste annule celle d'un autre : le serveur trace qui.
 */
@Component({
  selector: 'app-batch-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonIconComponent, FoldInlineConfirmComponent],
  templateUrl: './batch-chips.html',
  styleUrl: './batch-chips.scss',
})
export class BatchChips {
  readonly batches = input.required<readonly WorkshopBatch[]>();
  readonly busy = input(false);
  readonly cancelled = output<WorkshopBatch>();

  protected readonly shown = computed<readonly ShownBatch[]>(() =>
    this.batches().map((batch) => {
      const hour = hourLabel(batch.recordedAt) ?? '';
      const qty = String(batch.quantity);
      return {
        batch,
        said: [hour, batch.initials ?? '—', qty].join(' · '),
        labels: {
          confirm: `Annuler ${qty} ?`,
          cancel: 'Garder',
          cancelAria: 'Garder la fournée',
          busy: 'Annulation…',
          group: `Annuler la fournée de ${qty} à ${hour}`,
        },
      };
    }),
  );
}
