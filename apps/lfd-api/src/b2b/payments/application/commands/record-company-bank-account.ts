import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { Bic } from "../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import type { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { DebtorAccount } from "../../domain/value-objects/debtor-account.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";
import { writeVoidingDraft, type DraftVoidingDeps } from "../draft-mandate-voiding.js";
import { ringDraftVoided, type MandateBellDeps } from "../mandate-staff-bell.js";

/** Les ports du dépôt de RIB : le compte, et ce qu'il faut pour rendre caduc le brouillon. */
export interface RecordBankAccountDeps extends DraftVoidingDeps, MandateBellDeps {
  readonly accounts: CompanyBankAccountRepository;
  readonly ids: IdGenerator;
}

/**
 * Recopie un RIB — le coeur du dépôt, **sans mur** : l'appelant (staff, ou
 * client détenteur / facturation) a déjà décidé du droit d'agir.
 *
 * Extrait pour être partagé par les deux chemins : la construction du
 * `DebtorAccount` et le cycle charger → muter → sauver ne s'écrivent qu'une
 * fois. Même geste que `ingestKbis` côté `account`.
 *
 * ## Le brouillon de mandat devient caduc (depuis le 2026-09-14)
 *
 * Tant qu'un brouillon existe, **toute** écriture du RIB le révoque, dans la
 * même unité de travail, fait au journal ; l'équipe est prévenue ensuite, hors
 * transaction (plan `documentation/b2b/plan-mandat-client.md` §9 #4).
 *
 * ## 🔴 Ce que le booléen de `replaceWith` ne fait pas encore
 *
 * Il dit si le **compte bancaire** a réellement changé, par opposition à une
 * correction de titulaire ou d'adresse. Le brouillon n'en a pas besoin — tout
 * ce qui change est imprimé. Il reste calculé et **ignoré** pour le seul cas
 * qu'il servira : un mandat ACTIF dont le compte change, geste en attente de la
 * banque (amendement ou nouveau mandat).
 */
export async function recordCompanyBankAccount(
  companyId: string,
  payload: SetCompanyBankAccountPayload,
  deps: RecordBankAccountDeps,
): Promise<void> {
  // Les value objects valident AVANT toute lecture : un IBAN mal recopié se
  // refuse sans avoir touché la base.
  const account = debtorAccountFrom(payload);
  const existing = await deps.accounts.findByCompany(companyId);
  // 🔴 Les zones facultatives d'un RIB remplacé ne sont PAS touchées : changer
  // de banque ne change ni le contrat ni sa description. Vides à la création :
  // elles ont leur propre route.
  existing?.replaceWith(account);
  const written =
    existing ??
    CompanyBankAccount.declare({
      id: deps.ids.next(),
      companyId,
      account,
      options: MandateOptions.empty(),
    });

  const voided = await writeVoidingDraft(deps, companyId, "bank_account_changed", () =>
    deps.accounts.save(written),
  );
  if (voided !== null) {
    await ringDraftVoided(deps, voided, "bank_account_changed");
  }
}

function debtorAccountFrom(payload: SetCompanyBankAccountPayload): DebtorAccount {
  return DebtorAccount.create({
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
}
