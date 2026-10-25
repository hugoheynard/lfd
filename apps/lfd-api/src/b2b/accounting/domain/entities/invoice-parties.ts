import { InvoiceAssemblyError, InvoiceIssuanceBlockedError } from "../errors/invoice-errors.js";
import {
  invoiceIssuanceBlockers,
  orderDeliveryBlockers,
  orderShortfallBlockers,
  type InvoiceSellerFacts,
} from "../services/invoice-issuance-blockers.js";
import type { InvoiceNumber } from "../value-objects/invoice-number.js";
import type {
  InvoiceBuyer,
  InvoiceMentions,
  InvoiceOrderReference,
  InvoiceSeller,
} from "./invoice.types.js";

/** Les parties d'une facture qu'on a le droit d'émettre. */
export interface IssuableParties {
  readonly seller: InvoiceSeller;
  readonly buyer: InvoiceBuyer;
  readonly mentions: InvoiceMentions;
}

/**
 * Juge les parties par `invoiceIssuanceBlockers` (E0) et les bons par
 * `orderDeliveryBlockers` (M5, lot ZA), et refuse en citant TOUS les manques
 * — l'écran du dossier et l'émission disent la même chose. Rien n'est
 * comblé : un SIREN vide, un taux absent ou une date de livraison inconnue
 * arrêtent l'émission.
 *
 * @throws {InvoiceIssuanceBlockedError} au moins un manque.
 * @throws {InvoiceAssemblyError} le vendeur figé n'est pas l'entité jugée, ou
 *         le numéro ne porte pas le préfixe de l'entité.
 */
export function issuableParties(
  number: InvoiceNumber,
  sellerFacts: InvoiceSellerFacts | null,
  seller: InvoiceSeller,
  buyer: InvoiceBuyer | null,
  orders: readonly InvoiceOrderReference[],
): IssuableParties {
  const legalEntityId = seller.legalEntityId;
  const blockers = [
    ...invoiceIssuanceBlockers(sellerFacts, buyer),
    ...orderDeliveryBlockers(orders),
    ...orderShortfallBlockers(orders),
  ];
  if (blockers.length > 0 || sellerFacts === null || buyer === null) {
    throw new InvoiceIssuanceBlockedError(blockers);
  }
  if (sellerFacts.legalEntityId !== legalEntityId) {
    throw new InvoiceAssemblyError(number.value, "le vendeur figé n'est pas l'entité émettrice");
  }
  if (sellerFacts.invoicePrefix !== number.prefix) {
    throw new InvoiceAssemblyError(
      number.value,
      `numéro pris sous un autre préfixe que celui de l'entité (${String(sellerFacts.invoicePrefix)})`,
    );
  }
  return { seller, buyer, mentions: mentionsOf(number.value, sellerFacts) };
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
