import type { Prisma } from "../../../platform/database/client/client.js";
import {
  SEPA_DIRECT_DEBIT,
  type InvoiceLineInput,
  type InvoiceMentions,
  type InvoicePaymentMeans,
} from "../domain/entities/invoice.types.js";

/*
 * Les formes JSON propres à la facture émise (lot E2), **écrites champ à
 * champ** — même raison que `billing-statement-json.ts`, dont le vendeur,
 * l'acheteur et la ventilation sont repris tels quels : une propriété ajoutée
 * au domaine n'entre pas dans une pièce émise sans qu'on l'ait décidé, et
 * `body_version` doit alors bouger avec elle.
 */

/** La forme des colonnes JSON que ce fichier écrit. */
export const INVOICE_BODY_VERSION = 1;

export function mentionsJson(mentions: InvoiceMentions): Prisma.InputJsonValue {
  return {
    latePenaltyRateBasisPoints: mentions.latePenaltyRateBasisPoints,
    recoveryIndemnityCents: mentions.recoveryIndemnityCents,
    earlyPaymentDiscount: mentions.earlyPaymentDiscount,
    operationCategory: mentions.operationCategory,
    vatOnDebits: mentions.vatOnDebits,
  };
}

export function invoiceLinesJson(lines: readonly InvoiceLineInput[]): Prisma.InputJsonValue {
  return lines.map((line) => ({
    sku: line.sku,
    label: line.label,
    unitCode: line.unitCode,
    quantityThousandths: line.quantityThousandths,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    amountCents: line.amountCents,
  }));
}

export function addressLinesJson(lines: readonly string[]): Prisma.InputJsonValue {
  return [...lines];
}

/** BG-16 (E4) — colonne à part, nullable : son absence ne change pas `body_version`. */
export function paymentMeansJson(means: InvoicePaymentMeans): Prisma.InputJsonValue {
  return means.code === SEPA_DIRECT_DEBIT
    ? { code: means.code, mandateReference: means.mandateReference }
    : { code: means.code };
}
