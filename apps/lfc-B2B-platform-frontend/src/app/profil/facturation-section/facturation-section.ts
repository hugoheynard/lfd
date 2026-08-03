import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';
import { CompanyBillingCard } from '@lfd/b2b-ui/company';

import { type Company, paymentTermLabel } from '../../account/account.model';
import { PaymentTermPanel } from '../../entreprises/payment-term-panel/payment-term-panel';

/**
 * Section **Facturation** côté **client** — _container_ de la carte
 * présentationnelle `@lfd/b2b-ui/company`. Le terme **convenu** (défaut « à la
 * commande ») est écrit par La Folie Coffee ; le client ne le mute jamais en
 * direct — il **demande** une évolution (bouton gestionnaire), qui apparaît « en
 * attente » jusqu'à validation commerciale. Le container fournit les libellés et
 * la formulation client ; l'action ouvre le panneau de demande.
 */
@Component({
  selector: 'app-facturation-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyBillingCard],
  templateUrl: './facturation-section.html',
})
export class FacturationSection {
  private readonly panelHost = inject(FoldPanelHostService);

  readonly company = input.required<Company>();

  protected readonly termLabel = computed(() => paymentTermLabel(this.company().paymentTerm));
  protected readonly canManage = computed(() => this.company().role === 'company_admin');

  /** Une demande n'est « en attente » que si elle diffère réellement du convenu. */
  protected readonly pendingLabel = computed<string | null>(() => {
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
