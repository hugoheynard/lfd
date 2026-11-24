import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { euros } from '../../comptabilite/invoice-dossier-format';
import { PeriodQuotesService } from '../../comptabilite/period-quotes.service';
import { GestureIntents } from '../../shared/gesture-intents';

/** Ce que le panneau reçoit : la version du devis dont l'engagement arrive. */
export interface PeriodQuoteCommitmentPanelData {
  readonly quoteId: string;
  readonly number: string;
  readonly version: number;
  readonly payerName: string;
  readonly totalCents: number;
}

/** Ce que le panneau rend quand l'engagement est enregistré : la facture émise. */
export interface PeriodQuoteCommitmentResult {
  readonly invoiceId: string;
}

/**
 * **« Engagement reçu »** (plan `plan-clients-publics-chorus.md`, § 6 sexies,
 * QD6) : le numéro que l'organisme a renvoyé. Le serveur l'écrit sur les
 * commandes du devis et émet sa facture dans la même transaction ; la forme
 * du numéro, la fraîcheur du devis et ses groupes se jugent là-bas, et un
 * refus s'affiche tel quel dans le panneau, qui reste ouvert.
 *
 * La clé d'intention est celle du devis tant que le geste n'a pas abouti : un
 * double clic n'émet pas deux factures.
 */
@Component({
  selector: 'app-period-quote-commitment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './period-quote-commitment-panel.html',
  styleUrl: './period-quote-commitment-panel.scss',
})
export class PeriodQuoteCommitmentPanel {
  private readonly api = inject(PeriodQuotesService);
  private readonly ref = inject(FoldPanelRef<PeriodQuoteCommitmentResult>);
  private readonly intents = new GestureIntents();

  readonly data = input<PeriodQuoteCommitmentPanelData | undefined>(undefined);

  protected readonly commitmentNumber = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const data = this.data();
    return data === undefined
      ? ''
      : `Devis ${data.number} (version ${String(data.version)}) — ${data.payerName}`;
  });
  protected readonly total = computed(() => {
    const data = this.data();
    return data === undefined ? '' : euros(data.totalCents);
  });
  protected readonly canSubmit = computed(
    () => this.data() !== undefined && this.commitmentNumber().trim() !== '' && !this.saving(),
  );

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const issued = await this.api.receiveCommitment(
        data.quoteId,
        { number: this.commitmentNumber().trim() },
        this.intents.keyFor(data.quoteId),
      );
      this.intents.done(data.quoteId);
      this.ref.close(issued);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'L’engagement n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
