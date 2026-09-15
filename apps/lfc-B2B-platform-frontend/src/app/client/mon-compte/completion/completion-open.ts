import type { CompanyView } from '@lfd/contracts';
import type { FoldPanelHostService } from 'fold-ng';

import type { ClientAddresses } from '../../client-addresses.service';
import type { ClientBankAccount } from '../../client-bank-account.service';
import type { ClientMandate } from '../../client-mandate.service';
import { BillingAddressDialog } from '../addresses/billing-address-dialog/billing-address-dialog';
import { DeliveryAddressDialog } from '../addresses/delivery-address-dialog/delivery-address-dialog';
import { BankPanel } from '../bank/bank-panel/bank-panel';
import { IdentityPanel } from '../identity/identity-panel/identity-panel';
import { KbisPanel } from '../kbis/kbis-panel/kbis-panel';
import { ContactEditPanel } from '../users/contact-edit-panel/contact-edit-panel';
import type { CompletionTarget } from './completion-items';

/** Ce qu'il faut pour ouvrir un dialogue de Mon compte hors de sa carte. */
export interface CompletionOpeners {
  readonly panels: FoldPanelHostService;
  readonly company: CompanyView;
  readonly addresses: ClientAddresses;
  readonly accounts: ClientBankAccount;
  readonly mandates: ClientMandate;
}

/**
 * Ouvre le dialogue d'un élément à compléter — **le même** que la carte ouvre,
 * par la même méthode statique : la synthèse du haut et les encarts des cartes
 * passent tous ici, pour qu'un geste ne mène jamais ailleurs que la carte.
 *
 * Le numéro joignable ouvre la fiche du **détenteur** : c'est la personne que
 * le client a sous la main, et le dialogue la montre en lecture à qui ne gère
 * pas les contacts, comme la liste des utilisateurs.
 */
export function openCompletion(target: CompletionTarget, openers: CompletionOpeners): void {
  const { panels, company, addresses, accounts, mandates } = openers;
  switch (target) {
    case 'identity':
      void IdentityPanel.open(panels, company);
      return;
    case 'contacts':
      ContactEditPanel.open(panels, company, company.primaryContact);
      return;
    case 'kbis':
      KbisPanel.open(panels, company);
      return;
    case 'billing':
      BillingAddressDialog.open(panels, company, addresses.billing());
      return;
    case 'delivery':
      DeliveryAddressDialog.open(panels, company, null, addresses.deliveries().length === 0);
      return;
    case 'bank':
      void BankPanel.open(panels, accounts, mandates, company.id);
      return;
  }
}
