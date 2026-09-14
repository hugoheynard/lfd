import type { SetMandateOptionsPayload } from "@lfd/contracts";

import { CompanyBankAccountNotFoundError } from "../../domain/errors/mandate-errors.js";
import type { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
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
 * (plan `documentation/b2b/plan-mandat-client.md` §10) : la séquence ne s'écrit
 * qu'une fois, comme `recordCompanyBankAccount` pour le RIB.
 *
 * - **Refus 404 sans RIB** : les zones vivent sur sa ligne ; en créer une sans
 *   compte ferait exister un « côté client du mandat » sans le compte à débiter.
 * - **Le brouillon en cours devient caduc** : les zones sont imprimées. Il est
 *   révoqué dans la même unité de travail, et l'équipe prévenue ensuite, hors
 *   transaction (plan §9 #4).
 *
 * @throws {CompanyBankAccountNotFoundError} aucun RIB n'est déposé.
 */
export async function recordMandateOptions(
  companyId: string,
  payload: SetMandateOptionsPayload,
  deps: RecordMandateOptionsDeps,
  precondition: MandateOptionsPrecondition = NO_PRECONDITION,
): Promise<void> {
  const account = await deps.accounts.findByCompany(companyId);
  if (account === null) {
    throw new CompanyBankAccountNotFoundError(companyId);
  }
  await precondition(account);

  account.setOptions(MandateOptions.create(payload));
  const voided = await writeVoidingDraft(deps, companyId, "mandate_options_changed", () =>
    deps.accounts.save(account),
  );
  if (voided !== null) {
    await ringDraftVoided(deps, voided, "mandate_options_changed");
  }
}
