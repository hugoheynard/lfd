import type { CustomerBankAccountView } from '@lfd/contracts';

import { fill } from '../../copy/client-copy.service';
import type { AccountCopy } from '../../copy/screens/account.copy';

/** « RIB enregistré · •••• 1906 », ou l'absence — ce que les deux cartes montrent. */
export function bankLine(account: CustomerBankAccountView | null, copy: AccountCopy): string {
  return account === null
    ? copy.bankNone
    : `${copy.bankRegistered} · ${fill(copy.bankLast4, { last4: account.last4 })}`;
}

/** Enregistrer sans RIB, Remplacer avec : le bouton dit ce que le panneau fera. */
export function bankActionLabel(
  account: CustomerBankAccountView | null,
  copy: AccountCopy,
): string {
  return account === null ? copy.bankSave : copy.bankReplace;
}
