import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import { Bic } from "../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import {
  bankAccountTraceOf,
  CompanyBankAccountChangedEvent,
} from "../../domain/events/company-bank-account.events.js";
import type { MandateActorChannel } from "../../domain/events/payment-mandate-facts.js";
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
 * transaction (plan `documentation/comptabilite/plan-mandat-client.md` §9 #4).
 *
 * ## Le changement lui-même est au journal (depuis le 2026-09-19)
 *
 * `company.bank_account_changed` part à **chaque** écriture, dans la même unité
 * de travail que le RIB, brouillon ou pas : un journal en panne n'écrit pas le
 * RIB. Un seul fait par geste — celui du brouillon révoqué est un autre fait,
 * sur le mandat. Le compte y entre par ses quatre derniers caractères et son
 * titulaire, jamais par l'IBAN (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1).
 *
 * ## La forme juridique du titulaire se fusionne (depuis le 2026-09-15)
 *
 * Le RIB se réécrit en entier, sauf ce champ : **absent de la charge =
 * inchangé**. Un écran encore ouvert sur un bundle qui l'ignore l'effacerait
 * sinon à chaque enregistrement (plan `plan-mentions-obligatoires-du-mandat.md`
 * §8 #7). Une chaîne vide envoyée, elle, efface : c'est une saisie.
 *
 * ## 🔴 Ce que le booléen de `replaceWith` ne fait pas encore
 *
 * Il dit si le **compte bancaire** a réellement changé, par opposition à une
 * correction de titulaire ou d'adresse. Le brouillon n'en a pas besoin — tout
 * ce qui change est imprimé. Il reste calculé et **ignoré** pour le seul cas
 * qu'il servira : un mandat ACTIF dont le compte change.
 *
 * Ce cas n'atteint pas cette fonction : les deux appelants refusent sous un
 * mandat actif (`BankAccountBoundToActiveMandateError`, le staff depuis le
 * 2026-09-15). L'amendement est différé jusqu'à la réponse de la banque (plan
 * `documentation/comptabilite/plan-restes-du-mandat.md` §8).
 */
export async function recordCompanyBankAccount(
  companyId: string,
  payload: SetCompanyBankAccountPayload,
  via: MandateActorChannel,
  deps: RecordBankAccountDeps,
): Promise<void> {
  // Les value objects valident AVANT toute lecture : un IBAN mal recopié se
  // refuse sans avoir touché la base.
  const submitted = debtorAccountFrom(payload);
  const existing = await deps.accounts.findByCompany(companyId);
  // Lue AVANT la mutation : `replaceWith` écrase le compte en place.
  const before = existing === null ? null : bankAccountTraceOf(existing.account);
  const account =
    payload.holderLegalForm === undefined
      ? submitted.withHolderLegalForm(existing?.account.holderLegalForm ?? "")
      : submitted;
  const written = replaceOrDeclare(existing, account, companyId, deps.ids);

  const trigger = { cause: "bank_account_changed", via } as const;
  const changed = new CompanyBankAccountChangedEvent(
    written.id,
    companyId,
    before,
    bankAccountTraceOf(account),
    via,
  );
  const voided = await writeVoidingDraft(deps, companyId, trigger, async () => {
    await deps.accounts.save(written);
    await deps.events.publishTraced(changed);
  });
  if (voided !== null) {
    await ringDraftVoided(deps, voided, "bank_account_changed");
  }
}

/**
 * 🔴 Les zones facultatives d'un RIB remplacé ne sont PAS touchées : changer de
 * banque ne change ni le contrat ni sa description. Vides à la création : elles
 * ont leur propre route.
 */
function replaceOrDeclare(
  existing: CompanyBankAccount | null,
  account: DebtorAccount,
  companyId: string,
  ids: IdGenerator,
): CompanyBankAccount {
  if (existing !== null) {
    existing.replaceWith(account);
    return existing;
  }
  return CompanyBankAccount.declare({
    id: ids.next(),
    companyId,
    account,
    options: MandateOptions.empty(),
  });
}

function debtorAccountFrom(payload: SetCompanyBankAccountPayload): DebtorAccount {
  return DebtorAccount.create({
    holder: payload.holder,
    holderLegalForm: payload.holderLegalForm ?? "",
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
