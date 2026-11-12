import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { BANK_TRANSFER_REFERENCE_MAX, type UnpaidTransferInvoiceView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { GestureIntents } from '../../shared/gesture-intents';
import { BankTransfersService } from '../bank-transfers.service';
import { centsOf } from '../cents-field';
import { day, euros } from '../invoice-dossier-format';

/** Ce que le panneau reçoit : le payeur et ses factures au virement non réglées. */
export interface BankTransferPanelData {
  readonly payerName: string;
  readonly invoices: readonly UnpaidTransferInvoiceView[];
}

/**
 * **« Virement reçu »** (plan `plan-paiement-au-compte-par-virement.md`, V7) :
 * le montant, le jour et la référence lus sur le relevé, et les factures au
 * virement du payeur qu'il règle en entier. L'écran n'additionne aucun
 * montant (porte `front-money-reads`) : c'est le serveur qui compare et dit
 * l'écart en euros (409 rédigé, affiché tel quel). Les factures
 * cochées sont d'une seule entité émettrice : le geste est celui de l'entité.
 *
 * La clé d'intention est celle du payeur tant que le geste n'a pas abouti : un
 * double clic ne saisit pas deux virements.
 */
@Component({
  selector: 'app-bank-transfer-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './bank-transfer-panel.html',
  styleUrl: './bank-transfer-panel.scss',
})
export class BankTransferPanel {
  private readonly api = inject(BankTransfersService);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly intents = new GestureIntents();

  readonly data = input<BankTransferPanelData | undefined>(undefined);

  protected readonly amount = signal('');
  protected readonly receivedOn = signal('');
  protected readonly reference = signal('');
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly referenceMax = BANK_TRANSFER_REFERENCE_MAX;

  protected readonly invoices = computed(() => this.data()?.invoices ?? []);
  private readonly chosenInvoices = computed(() =>
    this.invoices().filter((invoice) => this.chosen().has(invoice.invoiceId)),
  );
  private readonly amountCents = computed(() => centsOf(this.amount()));
  protected readonly amountInvalid = computed(
    () => this.amount().trim() !== '' && this.amountCents() === null,
  );
  private readonly entities = computed(
    () => new Set(this.chosenInvoices().map((invoice) => invoice.legalEntityId)),
  );
  protected readonly mixedEntities = computed(() => this.entities().size > 1);
  protected readonly canSubmit = computed(
    () =>
      this.chosenInvoices().length > 0 &&
      !this.mixedEntities() &&
      this.amountCents() !== null &&
      this.receivedOn() !== '' &&
      this.reference().trim() !== '' &&
      this.reference().length <= BANK_TRANSFER_REFERENCE_MAX &&
      !this.saving(),
  );

  protected labelOf(invoice: UnpaidTransferInvoiceView): string {
    return `${invoice.number} — ${euros(invoice.amountCents)}`;
  }

  /** L'échéance, le retard et l'entité qui l'a émise. */
  protected hintOf(invoice: UnpaidTransferInvoiceView): string {
    const due = invoice.overdue
      ? `En retard de ${invoice.daysLate} j — échéance ${day(invoice.dueOn)}`
      : `Échéance ${day(invoice.dueOn)}`;
    return `${due} — ${invoice.legalEntityName}`;
  }

  protected toggle(invoiceId: string, checked: boolean): void {
    const next = new Set(this.chosen());
    if (checked) {
      next.add(invoiceId);
    } else {
      next.delete(invoiceId);
    }
    this.chosen.set(next);
  }

  protected async submit(): Promise<void> {
    const invoices = this.chosenInvoices();
    const amountCents = this.amountCents();
    const [first] = invoices;
    if (first === undefined || amountCents === null || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.record(
        first.legalEntityId,
        {
          amountCents,
          receivedOn: this.receivedOn(),
          reference: this.reference().trim(),
          invoiceIds: invoices.map((invoice) => invoice.invoiceId),
        },
        this.intents.keyFor(first.payerCompanyId),
      );
      this.intents.done(first.payerCompanyId);
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le virement n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
