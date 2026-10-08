import { z } from "zod";

/*
 * La RELECTURE des formes JSON de l'arrêté — le miroir de
 * `billing-statement-json.ts`, qui les écrit champ à champ.
 *
 * Une colonne `jsonb` revient en `JsonValue` : on la valide au lieu de la
 * caster. Une forme inconnue est refusée (`UnreadableStatementBodyError`)
 * plutôt qu'affichée à moitié — un montant prélevé ne se devine pas.
 */

/** Les `body_version` que cette lecture sait lire. */
export const READABLE_BODY_VERSION = 1;

export const statementSellerSchema = z.object({
  name: z.string(),
  legalForm: z.string(),
  siren: z.string(),
  vatNumber: z.string(),
  rcs: z.string(),
  shareCapitalCents: z.number().int(),
  addressLines: z.array(z.string()),
  ics: z.string(),
});

export const statementBuyerSchema = z.object({
  companyId: z.string(),
  name: z.string(),
  legalForm: z.string(),
  siret: z.string(),
  siren: z.string(),
  vatNumber: z.string(),
  billingAddressLines: z.array(z.string()),
});

const cents = z.number().int();
const part = z.object({ key: z.string(), amountCents: cents });

/** La ventilation par taux — le miroir de `vatBreakdownJson`, partagé avec la facture émise. */
export const vatBreakdownSchema = z.object({
  categories: z.array(
    z.object({
      rate: z.number(),
      goodsHtCents: cents,
      allowances: z.array(part),
      charges: z.array(part),
      taxableBaseCents: cents,
      vatCents: cents,
    }),
  ),
  goodsHtCents: cents,
  allowancesCents: cents,
  chargesCents: cents,
  taxableBaseCents: cents,
  vatCents: cents,
  totalCents: cents,
});

/** `body_version` 1 : la facture de `simulateInvoiceDossier`, telle que figée. */
export const statementBodyV1Schema = z.object({
  lines: z.array(
    z.object({
      sku: z.string(),
      label: z.string(),
      otherLabels: z.array(z.string()),
      // Absent des arrêtés figés : la v1 ne l'écrit pas (`lineJson`). Toutes
      // leurs lignes étaient des pièces — le catalogue ne vend rien d'autre
      // (Q5, 2026-10-08) —, d'où une relecture en `H87`, jamais une invention.
      unitCode: z.enum(["H87", "KGM"]).default("H87"),
      quantity: z.number(),
      unitPriceMillicents: z.number().int(),
      amountCents: cents,
      vatRate: z.number(),
      ordersLineTotalCents: cents,
      firstDeliveryDate: z.string().nullable(),
      lastDeliveryDate: z.string().nullable(),
    }),
  ),
  companyDiscountCents: cents,
  voucherDiscountCents: cents,
  lateFeeCents: cents,
  deliveries: z.array(
    z.object({ mode: z.enum(["standard", "follows_goods"]), amountCents: cents }),
  ),
  vat: vatBreakdownSchema,
  totalCents: cents,
});
