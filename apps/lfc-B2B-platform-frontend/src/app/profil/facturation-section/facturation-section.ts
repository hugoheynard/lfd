import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { type Company, paymentTermLabel } from '../../account/account.model';
import { PaymentTermPanel } from '../../entreprises/payment-term-panel/payment-term-panel';

/**
 * Section **Facturation** — la condition de règlement de l'entreprise. Le terme
 * **convenu** (défaut « à la commande ») est écrit par La Folie Coffee ; le
 * client ne le mute jamais en direct. Il peut en revanche **demander** une
 * évolution (bouton gestionnaire) : la demande apparaît « en attente » jusqu'à
 * validation commerciale.
 */
@Component({
  selector: 'app-facturation-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCardComponent, FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './facturation-section.html',
  styleUrl: './facturation-section.scss',
})
export class FacturationSection {
  private readonly panelHost = inject(FoldPanelHostService);

  readonly company = input.required<Company>();

  protected readonly termLabel = computed(() => paymentTermLabel(this.company().paymentTerm));
  protected readonly canManage = computed(() => this.company().role === 'company_admin');

  /** Une demande n'est « en attente » que si elle diffère réellement du convenu. */
  protected readonly pendingLabel = computed(() => {
    const company = this.company();
    const requested = company.requestedPaymentTerm;
    return requested !== null && requested !== company.paymentTerm
      ? paymentTermLabel(requested)
      : null;
  });

  /** Ouvre la demande de condition (gestionnaire) — onboarding comme après activation. */
  protected demander(): void {
    const company = this.company();
    this.panelHost.open(PaymentTermPanel, {
      data: { companyId: company.id, current: company.paymentTerm },
      side: 'right',
    });
  }
}
