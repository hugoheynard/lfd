import type { CreditorReader } from "../../accounting/domain/ports/creditor.reader.js";
import type { FirstMandateLedger } from "../../accounting/domain/ports/first-mandate-ledger.js";
import type { MandatePaymentType } from "../../accounting/domain/value-objects/mandate-defaults.js";
import type { SepaScheme } from "../../accounting/domain/value-objects/sepa-scheme.js";
import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { SecretGenerator } from "../../../platform/secret/secret-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import { mintMandate, type PaymentMandate } from "../domain/entities/payment-mandate.js";
import { MandateDraftAlreadyExistsError } from "../domain/errors/mandate-errors.js";
import { MandateMentionsMissingError } from "../domain/errors/mint-blocker-errors.js";
import type { MandateActorChannel } from "../domain/events/payment-mandate-facts.js";
import { MandateMintedEvent } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import type { CompanyBankAccountRepository } from "../domain/ports/company-bank-account.repository.js";
import { Rum } from "../domain/value-objects/rum.js";
import { readMintReadiness } from "./mint-readiness.js";
import { mandateCompanyOf } from "./mandate-journal-names.js";

/** Les ports de la frappe — partagés par le staff et le client. */
export interface MintMandateDeps {
  readonly mandates: PaymentMandateRepository;
  readonly accounts: CompanyBankAccountRepository;
  readonly creditors: CreditorReader;
  /** Le verrou du créancier imprimé, posé dans la transaction de la frappe. */
  readonly ledger: FirstMandateLedger;
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
 * Société (404) → **mentions** (409) → brouillon, tous AVANT le tirage : une
 * RUM fabriquée puis jetée porterait l'horodatage d'une frappe qui n'a pas eu
 * lieu.
 *
 * ⚠️ Depuis le 2026-09-15, le RIB et l'émetteur ne se refusent plus un par un
 * (`MandateWithoutBankAccountError`, puis `NoIssuerError`) : ils sont deux
 * mentions parmi celles de `mintBlockersOf`, toutes opposées ensemble par
 * `MandateMentionsMissingError`. Les dire une à une ferait recommencer autant de
 * fois qu'il en manque (plan `plan-mentions-obligatoires-du-mandat.md` §9).
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
 * Les gardes qui précèdent le brouillon — la société, puis toutes les mentions
 * obligatoires d'un coup, jugées comme les lectures les annoncent. Rend la
 * référence client et l'émetteur utiles au tirage.
 */
async function mintPreconditions(deps: MintMandateDeps, companyId: string): Promise<MintIssuer> {
  const { holder, issuer: creditor, blockers } = await readMintReadiness(deps, companyId);
  // `creditor === null` implique `issuer_missing` dans `blockers` : la seconde
  // condition ne sert qu'à le dire au compilateur.
  if (blockers.length > 0 || creditor === null) {
    throw new MandateMentionsMissingError(blockers);
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

/**
 * Tire la RUM, écrit le brouillon, **gèle le créancier imprimé** et trace — le
 * tout dans la même transaction.
 *
 * 🔴 Le verrou part avec le mandat, ou pas du tout (plan
 * `plan-restes-du-mandat.md` §3) : un brouillon écrit sans lui laisserait
 * corriger le nom du créancier sous un papier déjà imprimable. Le port est
 * idempotent, donc la seconde frappe ne déplace pas le moment du gel. Un seul
 * instant pour la RUM et le verrou : les deux disent la même frappe.
 */
async function writeMinted(
  deps: MintMandateDeps,
  companyId: string,
  issuer: MintIssuer,
  via: MandateActorChannel,
): Promise<string> {
  const mintedAt = deps.clock.now();
  const rum = Rum.mint({
    customerReference: issuer.customer,
    at: mintedAt,
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
    await deps.ledger.note(issuer.creditorId, mintedAt);
    await deps.events.publishTraced(
      new MandateMintedEvent(
        mandateId,
        await mandateCompanyOf(deps.mandates, companyId),
        rum.value,
        via,
      ),
    );
    return mandateId;
  });
}
