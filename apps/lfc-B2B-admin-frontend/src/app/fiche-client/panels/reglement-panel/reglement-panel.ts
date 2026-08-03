import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { PAYMENT_TERM_LABELS, type PaymentTerm } from '../../../comptes-clients/admin-company';

/** Charge d'ouverture : la société + le terme **convenu** courant (à préremplir). */
export interface AdminReglementPanelData {
  readonly companyId: string;
  readonly current: PaymentTerm;
}

/** Ordre d'affichage des termes (du plus strict au plus souple). */
const TERM_ORDER: readonly PaymentTerm[] = ['per_order', 'monthly', 'net60', 'net90'];

/** Options du select : valeur + libellé, dans l'ordre. */
const TERM_OPTIONS: readonly { readonly value: PaymentTerm; readonly label: string }[] =
  TERM_ORDER.map((value) => ({ value, label: PAYMENT_TERM_LABELS[value] }));

/**
 * Panneau **Condition de règlement** côté staff — fixe le terme **convenu** d'une
 * société (l'acte proprement commercial : le client ne fait que *demander*). Le
 * backend solde alors la demande client en cours.
 */
@Component({
  selector: 'app-admin-reglement-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldSelectComponent, FoldButtonComponent],
  templateUrl: './reglement-panel.html',
  styleUrl: './reglement-panel.scss',
})
export class AdminReglementPanel {
  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<AdminReglementPanelData>();

  protected readonly options = TERM_OPTIONS;
  protected readonly term = signal<PaymentTerm>('per_order');
  protected readonly submitting = signal(false);

  constructor() {
    // Préremplit avec le terme convenu courant ; `data` est fixé.
    effect(() => this.term.set(this.data().current));
  }

  protected onSelect(value: string): void {
    const found = TERM_OPTIONS.find((option) => option.value === value);
    if (found !== undefined) {
      this.term.set(found.value);
    }
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.service.setPaymentTerm(this.data().companyId, this.term());
      this.notify.success('Condition de règlement convenue.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
