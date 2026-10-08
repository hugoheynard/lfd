import { z } from "zod";

import { INVOICE_UNIT_CODES } from "../domain/value-objects/invoice-unit.js";
import { statementBuyerSchema } from "./billing-statement-json.schema.js";

/*
 * La RELECTURE des colonnes JSON de la facture émise — le miroir de
 * `invoice-json.ts` (et de `sellerJson` / `buyerJson` / `vatBreakdownJson`).
 * Une forme inconnue est refusée (`UnreadableInvoiceError`) plutôt que
 * rendue à moitié.
 */

const cents = z.number().int();

/** Le vendeur ENTIER, tel que `sellerJson` l'écrit — la vue de l'arrêté en omet une part. */
export const invoiceSellerSchema = z.object({
  legalEntityId: z.string(),
  name: z.string(),
  legalForm: z.string(),
  siren: z.string(),
  vatNumber: z.string(),
  rcs: z.string(),
  shareCapitalCents: cents,
  addressLines: z.array(z.string()),
  ics: z.string(),
  creditorIban: z.string(),
  creditorBic: z.string().nullable(),
});

export const invoiceBuyerSchema = statementBuyerSchema;

export const invoiceMentionsSchema = z.object({
  latePenaltyRateBasisPoints: z.number().int(),
  recoveryIndemnityCents: cents,
  earlyPaymentDiscount: z.string(),
  operationCategory: z.literal("goods"),
  vatOnDebits: z.literal(false),
});

export const invoiceLinesSchema = z.array(
  z.object({
    sku: z.string(),
    label: z.string(),
    unitCode: z.enum(INVOICE_UNIT_CODES),
    quantityThousandths: z.number().int(),
    unitPriceMillicents: z.number().int(),
    vatRate: z.number(),
    amountCents: cents,
  }),
);

export const addressLinesSchema = z.array(z.string());

export const invoiceTypeSchema = z.enum(["380", "381"]);
