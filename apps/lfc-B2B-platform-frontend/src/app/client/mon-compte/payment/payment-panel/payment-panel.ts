import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CompanyView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import {
  canRequestMonthly,
  MONTHLY,
  type MonthlyTermState,
  monthlyTermState,
  monthlyTermView,
} from '../payment-section';

/** Charge d'ouverture : la société, où en est son crédit, et si l'on peut le demander. */
export interface PaymentPanelData {
  readonly companyId: string;
  readonly monthly: MonthlyTermState;
  /** `owner`/`admin`, et rien d'accordé ni d'attendu (cf. {@link canRequestMonthly}). */
  readonly canRequest: boolean;
}

/**
 * Le panneau **Paiement** — les deux régimes, côte à côte, la phrase qui dit
 * qu'il n'y en a pas de troisième, et de quoi DEMANDER le second.
 *
 * Deux et pas plus, lus ensemble : l'absence de crédit ne doit pas ressembler
 * à un refus. La pastille dit ce que `/me` dit — accordé, demandé, ou ni l'un
 * ni l'autre.
 *
 * 🔴 **Il affirmait « Accordé le 14/02/2024 · plafond 2 000 € »** à tout le
 * monde, écrit en dur : `CompanyView` ne porte ni date d'accord ni plafond, et
 * rien n'en dit donc plus ici.
 *
 * ## Une demande, jamais un accord
 *
 * `PATCH /companies/:id/payment-term` enregistre le terme **demandé** ; seul le
 * staff accorde. Le panneau le dit avant l'envoi, garde le refus sous les yeux
 * (panneau resté ouvert) et se ferme au succès — `/me` relu, la carte passe
 * alors à « En attente ».
 */
@Component({
  selector: 'app-payment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './payment-panel.html',
  styleUrl: './payment-panel.scss',
})
export class PaymentPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, company: CompanyView): void {
    panels.open(PaymentPanel, {
      side: panelSide(),
      data: {
        companyId: company.id,
        monthly: monthlyTermState(company),
        canRequest: canRequestMonthly(company),
      },
    });
  }

  readonly data = input.required<PaymentPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  /** Le message du dernier refus, `null` tant qu'il n'y en a pas. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly monthly = computed(() =>
    monthlyTermView(this.data().monthly, this.t().account),
  );

  protected async request(): Promise<void> {
    if (!this.data().canRequest || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.askPaymentTerm(this.data().companyId, MONTHLY);
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
