import { InvoiceAssemblyError, InvoiceIssuanceBlockedError } from "../errors/invoice-errors.js";
import {
  invoiceIssuanceBlockers,
  type InvoiceSellerFacts,
} from "../services/invoice-issuance-blockers.js";
import type { InvoiceBuyer, InvoiceMentions, InvoiceSeller } from "./invoice.types.js";

/** Les parties d'une facture qu'on a le droit d'émettre. */
export interface IssuableParties {
  readonly seller: InvoiceSeller;
  readonly buyer: InvoiceBuyer;
  readonly mentions: InvoiceMentions;
}

/**
 * Juge les parties par `invoiceIssuanceBlockers` (E0) et refuse en citant
 * TOUS les manques — l'écran du dossier et l'émission disent la même chose.
 * Rien n'est comblé : un SIREN vide ou un taux absent arrêtent l'émission.
 *
 * @throws {InvoiceIssuanceBlockedError} au moins un manque.
 * @throws {InvoiceAssemblyError} le vendeur figé n'est pas l'entité jugée.
 */
export function issuableParties(
  number: string,
  legalEntityId: string,
  sellerFacts: InvoiceSellerFacts | null,
  seller: InvoiceSeller,
  buyer: InvoiceBuyer | null,
): IssuableParties {
  const blockers = invoiceIssuanceBlockers(sellerFacts, buyer);
  if (blockers.length > 0 || sellerFacts === null || buyer === null) {
    throw new InvoiceIssuanceBlockedError(blockers);
  }
  if (sellerFacts.legalEntityId !== legalEntityId || seller.legalEntityId !== legalEntityId) {
    throw new InvoiceAssemblyError(number, "le vendeur figé n'est pas l'entité émettrice");
  }
  return { seller, buyer, mentions: mentionsOf(number, sellerFacts) };
}

function mentionsOf(number: string, facts: InvoiceSellerFacts): InvoiceMentions {
  const terms = facts.paymentTerms;
  const { latePenaltyRateBasisPoints, recoveryIndemnityCents, earlyPaymentDiscount } = terms;
  // Inatteignable : `invoiceIssuanceBlockers` a refusé toute mention absente.
  if (
    latePenaltyRateBasisPoints === null ||
    recoveryIndemnityCents === null ||
    earlyPaymentDiscount === null
  ) {
    throw new InvoiceAssemblyError(number, "mentions de paiement absentes après contrôle");
  }
  return {
    latePenaltyRateBasisPoints,
    recoveryIndemnityCents,
    earlyPaymentDiscount,
    operationCategory: "goods",
    vatOnDebits: false,
  };
}

/**
 * L'adresse de livraison n'apparaît que si elle DIFFÈRE de celle de
 * facturation (plan, § 5) ; identique ou absente, elle vaut `null`.
 */
export function distinctDeliveryAddress(
  buyer: InvoiceBuyer,
  delivery: readonly string[] | null,
): readonly string[] | null {
  if (delivery === null || delivery.length === 0) {
    return null;
  }
  const same =
    delivery.length === buyer.billingAddressLines.length &&
    delivery.every((line, i) => line.trim() === buyer.billingAddressLines[i]?.trim());
  return same ? null : [...delivery];
}
