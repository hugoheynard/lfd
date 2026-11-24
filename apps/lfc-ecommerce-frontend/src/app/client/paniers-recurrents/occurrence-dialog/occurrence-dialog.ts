import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { RecurringOccurrenceView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientSubscriptions } from '../../client-subscriptions.service';
import { fill } from '../../copy/client-copy.service';
import { recurringBasketsCopy } from '../../copy/screens/recurring-baskets.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { dialogSide } from '../../panel-side';

/** Ce que la carte passe au dialogue : le panier, l'échéance, et les noms de ses articles. */
export interface OccurrenceDialogData {
  readonly basketId: string;
  readonly occurrence: RecurringOccurrenceView;
  /** « jeudi 30 octobre » — la carte l'a déjà mis en forme. */
  readonly dayLabel: string;
  /** Le nom d'un SKU, ou le SKU lui-même quand le catalogue ne le connaît pas. */
  readonly nameOf: (sku: string) => string;
}

/**
 * **Modifier une échéance** — les quantités de cette commande-là seulement ;
 * les suivantes gardent le panier habituel. Une quantité à 0 retire
 * l'article ; il en faut au moins un (sinon, c'est « Sauter »).
 *
 * Un refus du serveur reste dans le dialogue ; un succès le ferme sur `true`,
 * et la carte l'annonce.
 */
@Component({
  selector: 'app-occurrence-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './occurrence-dialog.html',
  styleUrl: './occurrence-dialog.scss',
})
export class OccurrenceDialog {
  /** Une saisie : dialogue centré au bureau, feuille du bas en pile. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /** Ouvre le dialogue ; la promesse rend `true` quand l'échéance a été modifiée. */
  static open(panels: FoldPanelHostService, data: OccurrenceDialogData): Promise<boolean> {
    const ref = panels.open<OccurrenceDialogData, boolean>(OccurrenceDialog, {
      side: dialogSide(),
      data,
    });
    return ref.closed.then((result) => result === true);
  }

  readonly data = input.required<OccurrenceDialogData>();

  protected readonly copy = screenCopy('recurringBaskets', recurringBasketsCopy);
  private readonly subscriptions = inject(ClientSubscriptions);
  private readonly ref = inject(FoldPanelRef);

  /** Les quantités saisies, par SKU ; une ligne absente garde celle de l'échéance. */
  private readonly edits = signal<Readonly<Record<string, number>>>({});
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly title = computed(() =>
    fill(this.copy().dialogTitle, { day: this.data().dayLabel }),
  );

  protected readonly lines = computed(() => {
    const edits = this.edits();
    const { occurrence, nameOf } = this.data();
    return occurrence.lines.map((line) => ({
      sku: line.sku,
      name: nameOf(line.sku),
      quantity: edits[line.sku] ?? line.quantity,
    }));
  });

  /** Ce qui partirait : les lignes à quantité positive. */
  private readonly kept = computed(() =>
    this.lines()
      .filter((line) => line.quantity > 0)
      .map((line) => ({ sku: line.sku, quantity: line.quantity })),
  );

  /** Rien de changé, rien à envoyer — sauf une échéance sautée, que l'envoi rétablit. */
  protected readonly changed = computed(
    () =>
      this.data().occurrence.state === 'skipped' ||
      this.lines().some(
        (line, index) => line.quantity !== this.data().occurrence.lines[index]?.quantity,
      ),
  );

  protected readonly empty = computed(() => this.kept().length === 0);

  protected setQuantity(sku: string, value: number | null): void {
    const quantity = value === null || value < 0 ? 0 : Math.floor(value);
    this.edits.update((edits) => ({ ...edits, [sku]: quantity }));
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.empty() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const { basketId, occurrence } = this.data();
    const refusal = await this.subscriptions.modify(
      basketId,
      occurrence.serviceDay,
      this.kept(),
      occurrence.note,
    );
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected close(): void {
    this.ref.close(false);
  }
}
