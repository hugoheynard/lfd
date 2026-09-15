import type { SetMandateOptionsPayload } from "@lfd/contracts";

import { printsOptionalZones } from "../../../accounting/domain/services/mandate-printed-zones.js";
import type { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import type { PaymentMandate } from "../../domain/entities/payment-mandate.js";
import { MandateOptionsWithoutBankAccountError } from "../../domain/errors/bank-account-errors.js";
import type { MandateActorChannel } from "../../domain/events/payment-mandate-facts.js";
import { MandateOptionsChangedEvent } from "../../domain/events/payment-mandate.events.js";
import type { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";
import { writeVoidingDraft, type DraftVoidingDeps } from "../draft-mandate-voiding.js";
import { ringDraftVoided, type MandateBellDeps } from "../mandate-staff-bell.js";

/** Les ports de l'écriture des zones : le RIB qui les porte, et de quoi rendre caduc le brouillon. */
export interface RecordMandateOptionsDeps extends DraftVoidingDeps, MandateBellDeps {
  readonly accounts: CompanyBankAccountRepository;
}

/**
 * Une règle que l'appelant ajoute APRÈS « le RIB existe » et AVANT l'écriture —
 * côté client, le refus sous un mandat actif. Le staff n'en a pas.
 */
export type MandateOptionsPrecondition = (account: CompanyBankAccount) => Promise<void>;

const NO_PRECONDITION: MandateOptionsPrecondition = () => Promise.resolve();

/**
 * Réécrit les zones 14 et 19 — le coeur du geste, **sans mur** : l'appelant
 * (staff, ou client détenteur / facturation) a déjà décidé du droit d'agir.
 *
 * Extrait le 2026-09-14, quand le client a reçu le même geste que le staff
 * (plan `documentation/comptabilite/plan-mandat-client.md` §10) : la séquence ne s'écrit
 * qu'une fois, comme `recordCompanyBankAccount` pour le RIB.
 *
 * - **Refus 404 sans RIB** : les zones vivent sur sa ligne ; en créer une sans
 *   compte ferait exister un « côté client du mandat » sans le compte à débiter.
 * - **Toute réécriture est journalisée**, brouillon ou pas (décidé le
 *   2026-09-14, plan §10) : `payment_mandate.options_changed` porte `via` et les
 *   valeurs écrites, dans la transaction de l'écriture. Rien n'est écrit sur un
 *   refus — les deux refus précèdent l'unité de travail.
 * - **Le brouillon en cours devient caduc** : les zones sont imprimées. Il est
 *   révoqué dans la même unité de travail, et l'équipe prévenue ensuite, hors
 *   transaction (plan §9 #4).
 * - 🔴 **Sauf un brouillon interentreprises** (depuis le 2026-09-15, plan
 *   `documentation/comptabilite/plan-mandat-deux-schemas.md` §10, Q2) : son formulaire
 *   n'imprime pas ces zones, son papier ne change donc pas. Le schéma lu est
 *   celui **du brouillon**, figé à sa frappe — pas le réglage courant de
 *   l'entité. La réécriture reste journalisée.
 *
 * @throws {MandateOptionsWithoutBankAccountError} aucun RIB n'est déposé.
 */
export async function recordMandateOptions(
  companyId: string,
  payload: SetMandateOptionsPayload,
  via: MandateActorChannel,
  deps: RecordMandateOptionsDeps,
  precondition: MandateOptionsPrecondition = NO_PRECONDITION,
): Promise<void> {
  const account = await deps.accounts.findByCompany(companyId);
  if (account === null) {
    throw new MandateOptionsWithoutBankAccountError(companyId);
  }
  await precondition(account);

  const options = MandateOptions.create(payload);
  account.setOptions(options);
  const trigger = { cause: "mandate_options_changed", via, appliesTo: printsTheZones } as const;
  const voided = await writeVoidingDraft(deps, companyId, trigger, async () => {
    await deps.accounts.save(account);
    // Les valeurs NORMALISÉES : celles que la ligne porte, donc celles imprimées.
    await deps.events.publishTraced(
      new MandateOptionsChangedEvent(
        account.id,
        companyId,
        options.debtorReference,
        options.contractNumber,
        via,
      ),
    );
  });
  if (voided !== null) {
    await ringDraftVoided(deps, voided, "mandate_options_changed");
  }
}

/** Le papier de ce brouillon porte-t-il les zones 14 et 19 ? */
function printsTheZones(draft: PaymentMandate): boolean {
  return printsOptionalZones(draft.toSnapshot().scheme);
}
