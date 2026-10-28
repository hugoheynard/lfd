import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonIconComponent,
  FoldInlineConfirmComponent,
  type FoldInlineConfirmLabels,
} from 'fold-ng';

import type { OrderSaleUnit, WorkshopBatch } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { hourLabel } from '../../worksheet-day';

/** Une fournée telle que la puce la dit : « 5 h 10 · CR · 60 ». */
interface ShownBatch {
  /** La quantité de la fournée, dans l'unité de la ligne : « 24 » ou « 1,25 kg ». */
  readonly amount: string;
  readonly batch: WorkshopBatch;
  readonly said: string;
  /** « ↩ 24 en retour » : les pièces que le colisage doit encore rendre. */
  readonly returning: string | null;
  /** Tout est déjà demandé au colisage : plus rien à annuler ici. */
  readonly settled: boolean;
  readonly labels: Partial<FoldInlineConfirmLabels>;
}

/**
 * **Les fournées d'une ligne**, en puces — chacune s'annule en deux temps :
 * ✕, puis « Annuler 24 ? » (plan `documentation/fournil/plan-fournee-v3.md`
 * §4.5). N'importe quel poste annule celle d'un autre : le serveur trace qui.
 *
 * 🔴 Sur une journée tenue par le colisage, annuler une fournée déjà remise
 * n'annule rien : c'est une DEMANDE de retour, et les pièces comptent encore
 * jusqu'à la réponse (`cancel-batch.handler.ts`, vérifié le 2026-10-28). La
 * puce dit donc ce qui compte vraiment, et ce qui est en retour : sans ça,
 * l'annulation avait l'air de ne rien faire (Hugo, 2026-10-28).
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
  /** L'unité de la ligne (P6) : au poids, une fournée se dit « 1,25 kg ». */
  readonly saleUnit = input<OrderSaleUnit>('piece');
  readonly cancelled = output<WorkshopBatch>();

  protected readonly shown = computed<readonly ShownBatch[]>(() =>
    this.batches().map((batch) => {
      const unit = this.saleUnit();
      const hour = hourLabel(batch.recordedAt) ?? '';
      const pending = Math.min(batch.pendingReturn ?? 0, batch.quantity);
      const qty = saleQuantityLabel(batch.quantity - pending, unit);
      return {
        batch,
        amount: saleQuantityLabel(batch.quantity, unit),
        said: [hour, batch.initials ?? '—', saleQuantityLabel(batch.quantity, unit)].join(' · '),
        returning: pending > 0 ? `↩ ${saleQuantityLabel(pending, unit)} en retour` : null,
        settled: pending >= batch.quantity,
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
