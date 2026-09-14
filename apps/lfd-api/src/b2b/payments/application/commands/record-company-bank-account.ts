import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { Bic } from "../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import type { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { DebtorAccount } from "../../domain/value-objects/debtor-account.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";

/**
 * Recopie un RIB — le coeur du dépôt, **sans mur** : l'appelant (staff, ou
 * client détenteur / facturation) a déjà décidé du droit d'agir.
 *
 * Extrait pour être partagé par les deux chemins : la construction du
 * `DebtorAccount` et le cycle charger → muter → sauver ne s'écrivent qu'une
 * fois. Même geste que `ingestKbis` côté `account`.
 *
 * ## 🔴 Ce que le booléen de `replaceWith` ne fait pas encore
 *
 * Il dit si le **compte bancaire** a réellement changé, par opposition à une
 * correction de titulaire ou d'adresse. C'est le signal qui déclenchera le geste
 * sur le mandat — nouveau mandat, ou amendement sous la même RUM — le jour où la
 * banque aura répondu. Il est calculé et **délibérément ignoré** aujourd'hui :
 * l'ignorer est un état qu'on assume, l'oublier serait une régression.
 */
export async function recordCompanyBankAccount(
  companyId: string,
  payload: SetCompanyBankAccountPayload,
  accounts: CompanyBankAccountRepository,
  ids: IdGenerator,
): Promise<void> {
  // Les value objects valident AVANT toute lecture : un IBAN mal recopié se
  // refuse sans avoir touché la base.
  const account = DebtorAccount.create({
    holder: payload.holder,
    address: LegalAddress.create({
      line1: payload.line1,
      line2: payload.line2,
      postalCode: payload.postalCode,
      city: payload.city,
      countryCode: payload.countryCode,
    }),
    iban: Iban.create(payload.iban),
    bic: Bic.create(payload.bic),
  });

  const existing = await accounts.findByCompany(companyId);
  if (existing === null) {
    await accounts.save(
      CompanyBankAccount.declare({
        id: ids.next(),
        companyId,
        account,
        // Vides à la création : les zones facultatives ont leur propre route,
        // et un RIB tout juste saisi n'en porte aucune.
        options: MandateOptions.empty(),
      }),
    );
    return;
  }

  // 🔴 Les zones facultatives ne sont PAS touchées. Changer de banque ne
  // change ni le contrat ni sa description : les remettre à zéro ici ferait
  // perdre une saisie que personne n'a demandé à effacer.
  existing.replaceWith(account);
  await accounts.save(existing);
}
