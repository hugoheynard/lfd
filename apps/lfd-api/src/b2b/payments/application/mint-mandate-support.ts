import { NoIssuerError } from "../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../accounting/domain/ports/creditor.reader.js";
import type { MandatePaymentType } from "../../accounting/domain/value-objects/mandate-defaults.js";
import type { SepaScheme } from "../../accounting/domain/value-objects/sepa-scheme.js";
import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { SecretGenerator } from "../../../platform/secret/secret-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import { mintMandate, type PaymentMandate } from "../domain/entities/payment-mandate.js";
import {
  CompanyNotFoundForMandateError,
  MandateDraftAlreadyExistsError,
  MandateWithoutBankAccountError,
} from "../domain/errors/mandate-errors.js";
import type { MandateActorChannel } from "../domain/events/payment-mandate-facts.js";
import { MandateMintedEvent } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import type { CompanyBankAccountRepository } from "../domain/ports/company-bank-account.repository.js";
import { Rum } from "../domain/value-objects/rum.js";

/** Les ports de la frappe — partagés par le staff et le client. */
export interface MintMandateDeps {
  readonly mandates: PaymentMandateRepository;
  readonly accounts: CompanyBankAccountRepository;
  readonly creditors: CreditorReader;
  readonly clock: Clock;
  readonly secrets: SecretGenerator;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/**
 * Ce que la frappe a produit : une RUM neuve, ou le brouillon qui l'occupait
 * déjà. Les deux appelants ne tranchent pas pareil — le staff refuse en 409 en
 * nommant la RUM, le client reçoit le brouillon (plan mandat client §2).
 */
/** Ce que la frappe retient de l'émetteur — dont ce que le mandat fige. */
interface MintIssuer {
  readonly customer: string;
  readonly creditorId: string;
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
}

export type MintOutcome =
  | { readonly minted: true; readonly mandateId: string }
  | { readonly minted: false; readonly draft: PaymentMandate };

/**
 * Frappe un brouillon — **sans mur** : l'appelant a déjà décidé du droit d'agir.
 *
 * ## L'ordre des refus
 *
 * Société → **RIB** → émetteur → brouillon (plan §6 #8), tous AVANT le tirage :
 * une RUM fabriquée puis jetée porterait l'horodatage d'une frappe qui n'a pas
 * eu lieu. Le RIB passe avant l'émetteur parce que c'est le seul des deux que
 * la personne devant l'écran peut corriger elle-même.
 *
 * ## La course
 *
 * Deux frappes simultanées passent toutes deux `findDraft`. L'index partiel
 * tranche, l'adaptateur le traduit, et la relecture a lieu ICI, une fois la
 * transaction avortée retombée : c'est le seul endroit où relire est possible.
 */
export async function mintDraftMandate(
  deps: MintMandateDeps,
  companyId: string,
  via: MandateActorChannel,
): Promise<MintOutcome> {
  const customerReference = await mintPreconditions(deps, companyId);
  const existing = await deps.mandates.findDraft(companyId);
  if (existing !== null) {
    return { minted: false, draft: existing };
  }
  try {
    return { minted: true, mandateId: await writeMinted(deps, companyId, customerReference, via) };
  } catch (error) {
    const raced = error instanceof MandateDraftAlreadyExistsError;
    const draft = raced ? await deps.mandates.findDraft(companyId) : null;
    if (draft === null) {
      throw error;
    }
    return { minted: false, draft };
  }
}

/**
 * Les trois gardes qui précèdent le brouillon. Rend la référence client et
 * l'émetteur utiles au tirage.
 */
async function mintPreconditions(deps: MintMandateDeps, companyId: string): Promise<MintIssuer> {
  const holder = await deps.mandates.findHolder(companyId);
  if (holder === null) {
    throw new CompanyNotFoundForMandateError(companyId);
  }
  if ((await deps.accounts.findByCompany(companyId)) === null) {
    throw new MandateWithoutBankAccountError(companyId);
  }
  const creditor = await deps.creditors.soleIssuer();
  if (creditor === null) {
    throw new NoIssuerError();
  }
  // 🔴 Le schéma et le type sont RECOPIÉS ici, une fois : le mandat les fige, et
  // un réglage changé demain ne touche plus ce papier.
  return {
    customer: holder.reference,
    creditorId: creditor.legalEntityId,
    scheme: creditor.mandateScheme,
    paymentType: creditor.mandatePaymentType,
  };
}

/** Tire la RUM, écrit le brouillon ET sa trace dans la même transaction. */
async function writeMinted(
  deps: MintMandateDeps,
  companyId: string,
  issuer: MintIssuer,
  via: MandateActorChannel,
): Promise<string> {
  const rum = Rum.mint({
    customerReference: issuer.customer,
    at: deps.clock.now(),
    secret: deps.secrets.next(),
  });
  return deps.uow.run(async () => {
    const mandateId = await deps.mandates.create(
      mintMandate({
        companyId,
        creditorId: issuer.creditorId,
        reference: rum.value,
        scheme: issuer.scheme,
        paymentType: issuer.paymentType,
      }),
    );
    await deps.events.publishTraced(new MandateMintedEvent(mandateId, companyId, rum.value, via));
    return mandateId;
  });
}
