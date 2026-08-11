import type { DeferredTerm } from '@lfd/contracts';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';
import { SETTLEMENT_OPTIONS } from '../../account/account.model';

/** Charge d'ouverture : l'entreprise visée et sa condition actuelle. */
export interface PaymentTermPanelData {
  readonly companyId: string;
  /** Les crédits **déjà accordés** — inutile de redemander ce qu'on a. */
  readonly granted: readonly DeferredTerm[];
}

/**
 * Panneau **Condition de règlement** — le client choisit la condition
 * **souhaitée**. C'est une demande : le commercial la valide à l'activation.
 */
@Component({
  selector: 'app-payment-term-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldSelectComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
  ],
  templateUrl: './payment-term-panel.html',
  styleUrl: './payment-term-panel.scss',
})
export class PaymentTermPanel {
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<PaymentTermPanelData | undefined>(undefined);
  protected readonly terms = SETTLEMENT_OPTIONS;

  protected readonly term = signal<DeferredTerm>('monthly');
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const data = this.data();
      if (data !== undefined) {
        // Le premier crédit non encore accordé : demander ce qu'on a déjà
        // n'aurait aucun sens.
        const open = SETTLEMENT_OPTIONS.find((option) => !data.granted.includes(option.value));
        this.term.set(open?.value ?? 'monthly');
      }
    });
  }

  protected onChange(value: string): void {
    const match = SETTLEMENT_OPTIONS.find((option) => option.value === value);
    if (match !== undefined) {
      this.term.set(match.value);
    }
  }

  protected submit(): void {
    const data = this.data();
    if (data === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.account.requestSettlementMean(data.companyId, this.term(), () => this.ref.close(true));
  }

  protected cancel(): void {
    this.ref.close();
  }
}
