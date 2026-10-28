import { z } from "zod";

/*
 * La RELECTURE des formes JSON de l'arrêté — le miroir de
 * `billing-statement-json.ts`, qui les écrit champ à champ.
 *
 * Une colonne `jsonb` revient en `JsonValue` : on la valide au lieu de la
 * caster. Une forme inconnue est refusée (`UnreadableStatementBodyError`)
 * plutôt qu'affichée à moitié — un montant prélevé ne se devine pas.
 */

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

const statementLineFields = {
  sku: z.string(),
  label: z.string(),
  otherLabels: z.array(z.string()),
  unitPriceMillicents: z.number().int(),
  amountCents: cents,
  vatRate: z.number(),
  ordersLineTotalCents: cents,
  firstDeliveryDate: z.string().nullable(),
  lastDeliveryDate: z.string().nullable(),
};

const THOUSANDTHS_PER_PIECE = 1_000;

/**
 * Une ligne v1 : `quantity` en pièces, aucune unité. Toutes les lignes d'un
 * arrêté v1 étaient des pièces — rien ne se vendait au poids avant P7
 * (plan `plan-vente-au-poids.md`, § 3 bis) —, d'où leur relecture en `H87`,
 * pièces × 1 000. **Le seul repli d'unité de la chaîne de facturation** : les
 * colonnes `sale_unit` des bons et des BL ont un défaut en base, aucun
 * lecteur ne replie sur la pièce.
 */
const statementLineV1Schema = z
  .object({ ...statementLineFields, quantity: z.number().int() })
  .transform(({ quantity, ...line }) => ({
    ...line,
    unitCode: "H87" as const,
    quantityThousandths: quantity * THOUSANDTHS_PER_PIECE,
  }));

/** Une ligne v2 : l'unité et la quantité en millièmes, écrites telles quelles. */
const statementLineV2Schema = z.object({
  ...statementLineFields,
  unitCode: z.enum(["H87", "KGM"]),
  quantityThousandths: z.number().int(),
});

function statementBodySchema<Line extends z.ZodType>(line: Line) {
  return z.object({
    lines: z.array(line),
    companyDiscountCents: cents,
    voucherDiscountCents: cents,
    lateFeeCents: cents,
    deliveries: z.array(
      z.object({ mode: z.enum(["standard", "follows_goods"]), amountCents: cents }),
    ),
    vat: vatBreakdownSchema,
    totalCents: cents,
  });
}

/** `body_version` → sa relecture. Une version absente d'ici est illisible. */
export const STATEMENT_BODY_SCHEMAS = {
  1: statementBodySchema(statementLineV1Schema),
  2: statementBodySchema(statementLineV2Schema),
} as const;

/** La relecture du `body` d'une version, ou `null` si la version est inconnue. */
export function statementBodySchemaOf(
  bodyVersion: number,
): (typeof STATEMENT_BODY_SCHEMAS)[keyof typeof STATEMENT_BODY_SCHEMAS] | null {
  return bodyVersion === 1 || bodyVersion === 2 ? STATEMENT_BODY_SCHEMAS[bodyVersion] : null;
}
