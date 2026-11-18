import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CHORUS_REJECTION_REASON_MAX, type ChorusInvoiceView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { parisDay } from '../../../mediatheque/rules/paris-calendar';
import { ChorusDepositsService } from '../../chorus-deposits.service';

/** Les trois gestes notés sur une facture publique. */
export type ChorusGesture = 'deposit' | 'rejection' | 'acceptance';

/** Ce que le panneau reçoit : le geste et la facture qu'il vise. */
export interface ChorusGesturePanelData {
  readonly gesture: ChorusGesture;
  readonly invoice: ChorusInvoiceView;
  /** Aujourd'hui, à Paris (`AAAA-MM-JJ`) — injecté pour que le test ne lise pas le mur. */
  readonly today?: string;
}

const TITLES: Readonly<Record<ChorusGesture, string>> = {
  deposit: 'Déposée sur Chorus',
  rejection: 'Rejetée par Chorus',
  acceptance: 'Mise en paiement',
};

const DATE_LABELS: Readonly<Record<ChorusGesture, string>> = {
  deposit: 'Déposée le',
  rejection: 'Rejetée le',
  acceptance: 'Mise en paiement le',
};

/**
 * **Noter un geste fait sur le portail Chorus Pro** (plan
 * `plan-clients-publics-chorus.md`, § 6 quinquies, T5′) : le jour du geste,
 * aujourd'hui par défaut, jamais futur ni avant la facture (ou le dépôt) —
 * et le motif, obligatoire, pour un rejet. Le serveur tranche ; son refus
 * s'affiche tel quel.
 */
@Component({
  selector: 'app-chorus-gesture-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './chorus-gesture-panel.html',
  styleUrl: './chorus-gesture-panel.scss',
})
export class ChorusGesturePanel {
  private readonly api = inject(ChorusDepositsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ChorusGesturePanelData | undefined>(undefined);

  protected readonly reasonMax = CHORUS_REJECTION_REASON_MAX;
  protected readonly today = computed(() => this.data()?.today ?? parisDay(new Date()));
  protected readonly gesture = computed<ChorusGesture>(() => this.data()?.gesture ?? 'deposit');
  protected readonly title = computed(() => TITLES[this.gesture()]);
  protected readonly dateLabel = computed(() => DATE_LABELS[this.gesture()]);
  protected readonly subtitle = computed(() => {
    const invoice = this.data()?.invoice;
    return invoice === undefined ? '' : `${invoice.number} — ${invoice.payerName}`;
  });
  /** Le premier jour possible : la facture, ou le dépôt pour un rejet ou une mise en paiement. */
  protected readonly earliest = computed(() => {
    const invoice = this.data()?.invoice;
    if (invoice === undefined) {
      return '';
    }
    return this.gesture() === 'deposit'
      ? invoice.issuedOn
      : (invoice.chorus.depositedOn ?? invoice.issuedOn);
  });

  private readonly chosenOn = signal<string | null>(null);
  protected readonly occurredOn = computed(() => this.chosenOn() ?? this.today());
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly asksReason = computed(() => this.gesture() === 'rejection');
  protected readonly dateProblem = computed(() => {
    const on = this.occurredOn();
    if (on === '') {
      return null;
    }
    if (on > this.today()) {
      return 'Le jour ne peut pas être dans le futur.';
    }
    if (on < this.earliest()) {
      return this.gesture() === 'deposit'
        ? 'Le jour ne peut pas précéder la facture.'
        : 'Le jour ne peut pas précéder le dépôt.';
    }
    return null;
  });
  protected readonly reasonTooLong = computed(
    () => this.reason().length > CHORUS_REJECTION_REASON_MAX,
  );
  protected readonly canSubmit = computed(
    () =>
      this.data() !== undefined &&
      this.occurredOn() !== '' &&
      this.dateProblem() === null &&
      (!this.asksReason() || (this.reason().trim() !== '' && !this.reasonTooLong())) &&
      !this.saving(),
  );

  protected setOccurredOn(value: string): void {
    this.chosenOn.set(value);
  }

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canSubmit()) {
      return;
    }
    const occurredOn = this.occurredOn();
    const invoiceId = data.invoice.invoiceId;
    this.saving.set(true);
    this.error.set(null);
    try {
      if (data.gesture === 'deposit') {
        await this.api.deposit(invoiceId, { occurredOn });
      } else if (data.gesture === 'acceptance') {
        await this.api.accept(invoiceId, { occurredOn });
      } else {
        await this.api.reject(invoiceId, { occurredOn, reason: this.reason().trim() });
      }
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le geste n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
