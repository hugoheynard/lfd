import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  BANK_TRANSFER_REFERENCE_MAX,
  type BankTransferPreviewView,
  type UnpaidTransferInvoiceView,
} from '@lfd/contracts';
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

/** Ce que l'aperçu demande : l'entité, le montant, les factures cochées. */
interface PreviewRequest {
  readonly key: string;
  readonly legalEntityId: string;
  readonly amountCents: number;
  readonly invoiceIds: readonly string[];
}

/** La réponse de l'aperçu, rangée sous la demande qui l'a produite. */
type PreviewState =
  | { readonly key: string; readonly view: BankTransferPreviewView }
  | { readonly key: string; readonly error: string };

/** Ce que l'écran dit de l'écart, et sur quel ton. */
export interface GapNotice {
  readonly variant: 'success' | 'warning';
  readonly text: string;
}

/**
 * **« Virement reçu »** (`le-paiement-par-virement.md`, V7) :
 * le montant, le jour et la référence lus sur le relevé, et les factures au
 * virement du payeur qu'il règle en entier. L'écran n'additionne aucun
 * montant (porte `front-money-reads`) : l'écart est lu, AVANT « Enregistrer »,
 * sur l'aperçu du serveur (`…/bank-transfers/preview`), calculé par la règle
 * même de la saisie ; le bouton ne s'active qu'à écart nul. Les factures
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
  /** La demande d'aperçu des saisies courantes ; `null` tant qu'il manque montant ou facture. */
  private readonly previewRequest = computed<PreviewRequest | null>(() => {
    const invoices = this.chosenInvoices();
    const amountCents = this.amountCents();
    const [first] = invoices;
    if (first === undefined || amountCents === null || this.mixedEntities()) {
      return null;
    }
    const invoiceIds = invoices.map((invoice) => invoice.invoiceId);
    const key = `${first.legalEntityId}|${String(amountCents)}|${invoiceIds.join(',')}`;
    return { key, legalEntityId: first.legalEntityId, amountCents, invoiceIds };
  });
  private readonly previewState = signal<PreviewState | null>(null);
  /** L'aperçu des saisies COURANTES : une réponse d'avant une frappe ne compte plus. */
  private readonly preview = computed<PreviewState | null>(() => {
    const state = this.previewState();
    return state !== null && state.key === this.previewRequest()?.key ? state : null;
  });
  protected readonly gapNotice = computed<GapNotice | null>(() => {
    const state = this.preview();
    return state === null || !('view' in state) ? null : gapNoticeOf(state.view);
  });
  protected readonly previewError = computed(() => {
    const state = this.preview();
    return state !== null && 'error' in state ? state.error : null;
  });
  private readonly gapIsZero = computed(() => {
    const state = this.preview();
    return state !== null && 'view' in state && state.view.gapCents === 0;
  });

  constructor() {
    effect(() => {
      const request = this.previewRequest();
      if (request !== null) {
        untracked(() => void this.readPreview(request));
      }
    });
  }

  protected readonly canSubmit = computed(
    () =>
      this.chosenInvoices().length > 0 &&
      !this.mixedEntities() &&
      this.gapIsZero() &&
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

  private async readPreview(request: PreviewRequest): Promise<void> {
    try {
      const view = await this.api.preview(
        request.legalEntityId,
        request.amountCents,
        request.invoiceIds,
      );
      this.previewState.set({ key: request.key, view });
    } catch (caught) {
      this.previewState.set({
        key: request.key,
        error: httpErrorMessage(caught, "L'écart n'a pas pu être calculé."),
      });
    }
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

/** L'écart lu sur l'aperçu, dit en euros : rien n'est recalculé ici. */
export function gapNoticeOf(view: BankTransferPreviewView): GapNotice {
  const due = euros(view.invoicesDueCents);
  if (view.gapCents === 0) {
    return {
      variant: 'success',
      text: `Le montant reçu égale le total des factures cochées (${due}).`,
    };
  }
  const gap = euros(Math.abs(view.gapCents));
  const side = view.gapCents > 0 ? 'en trop' : 'manquants';
  return {
    variant: 'warning',
    text: `Écart de ${gap} ${side} : factures cochées ${due}, montant reçu ${euros(view.amountCents)}. Ajustez les factures cochées ou le montant.`,
  };
}
