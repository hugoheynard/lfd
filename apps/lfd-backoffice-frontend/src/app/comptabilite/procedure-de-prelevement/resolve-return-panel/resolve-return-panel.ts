import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollectionReturnView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionReturnsService } from '../../collection-returns.service';
import { returnAmount } from '../../collection-return-wording';

/** La note est bornée côté serveur à 500 caractères. */
const NOTE_MAX = 500;

/** Les deux gestes qui demandent une note. */
export type ReturnResolutionGesture = 'settle' | 'write-off';

export interface ResolveReturnPanelData {
  readonly item: CollectionReturnView;
  readonly gesture: ReturnResolutionGesture;
}

const WORDS: Readonly<
  Record<ReturnResolutionGesture, { title: string; label: string; hint: string; button: string }>
> = {
  settle: {
    title: 'Réglé autrement',
    label: 'Comment a-t-il été réglé ?',
    hint: 'Lien de paiement, virement du…, référence. La seule trace du règlement.',
    button: 'Marquer réglé',
  },
  'write-off': {
    title: 'Passer en perte',
    label: 'Pourquoi est-ce perdu ?',
    hint: 'Aucune écriture ni avoir : un état et une trace, en attendant le cabinet.',
    button: 'Passer en perte',
  },
};

/**
 * **Régler autrement, ou passer en perte**, un retour bancaire (R5a) : toutes
 * les commandes de la ligne suivent, avec la même note.
 */
@Component({
  selector: 'app-resolve-return-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './resolve-return-panel.html',
  styleUrl: './resolve-return-panel.scss',
})
export class ResolveReturnPanel {
  private readonly api = inject(CollectionReturnsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ResolveReturnPanelData | undefined>(undefined);

  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly words = computed(() => WORDS[this.data()?.gesture ?? 'settle']);

  protected readonly subtitle = computed(() => {
    const item = this.data()?.item;
    return item === undefined ? '' : `${item.debtorName} — ${returnAmount(item)}`;
  });

  protected readonly canSubmit = computed(() => {
    const note = this.note().trim();
    return note !== '' && note.length <= NOTE_MAX && !this.saving();
  });

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const note = this.note().trim();
      await (data.gesture === 'settle'
        ? this.api.settleOtherwise(data.item.id, note)
        : this.api.writeOff(data.item.id, note));
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le retour n'a pas pu être traité."));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
