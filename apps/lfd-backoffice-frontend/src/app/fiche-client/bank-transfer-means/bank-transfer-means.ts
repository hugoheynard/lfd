import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldElementTitleComponent } from 'fold-ng';

import { TransferInvoicesCard } from '../transfer-invoices-card/transfer-invoices-card';

/**
 * **Ce que le virement demande** (`le-paiement-par-virement.md`,
 * § « L'écran », V5, V6) : rien à signer. Nos coordonnées — celles que chaque
 * facture porte —, l'échéance du cycle, et les factures à régler.
 *
 * L'IBAN n'est rendu que par ses quatre derniers caractères : la vue de
 * l'entité ne sert jamais l'IBAN entier, et l'écran du staff n'en a besoin que
 * pour reconnaître le compte. L'IBAN complet est imprimé sur la facture, et
 * nulle part ailleurs — jamais dans un e-mail.
 */
@Component({
  selector: 'app-bank-transfer-means',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldElementTitleComponent, TransferInvoicesCard],
  templateUrl: './bank-transfer-means.html',
  styleUrl: './bank-transfer-means.scss',
})
export class BankTransferMeans {
  readonly entity = input.required<LegalEntityView>();
  readonly companyId = input.required<string>();

  protected readonly hasAccount = computed(() => this.entity().creditorAccountLast4 !== '');

  /** Le compte en attente de confirmation ne vaut pas encore : les factures portent le confirmé. */
  protected readonly pending = computed(() => this.entity().pendingCreditorAccount !== null);

  /**
   * Le délai de l'échéance après la clôture : le réglage de l'entité, sinon le
   * délai de pré-notification — la même échéance qu'un prélèvement (V6).
   */
  protected readonly dueDays = computed(() => {
    const entity = this.entity();
    return entity.collectionDaysAfterClosure ?? entity.preNotificationDays;
  });
}
