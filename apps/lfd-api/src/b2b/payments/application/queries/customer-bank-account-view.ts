import type { CustomerBankAccountView } from "@lfd/contracts";

import type { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";

/**
 * Le RIB tel que le **client** le voit : coordonnées et `last4`, sans les zones
 * facultatives du mandat (14 et 19), qui sont des réglages du staff.
 *
 * Partagé par les deux lectures : la vue staff l'étend de ces deux zones. Écrire
 * le mapping une fois, c'est n'avoir qu'un endroit où l'IBAN pourrait fuir.
 *
 * 🔴 **L'IBAN ne franchit pas cette frontière** : quatre caractères, jamais
 * davantage. Une réponse d'API qui porterait un IBAN entier finit dans un
 * journal d'accès.
 */
export function customerBankAccountView(found: CompanyBankAccount): CustomerBankAccountView {
  const { holder, address, bic } = found.account;
  return {
    holder,
    addressLine1: address.line1,
    addressLine2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.countryCode,
    bic: bic.value,
    last4: found.account.last4(),
  };
}
