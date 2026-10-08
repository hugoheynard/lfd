import { lateFeeAdjustmentSchema, vatSharesSchema } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import type {
  FrozenDeliveryVatMode,
  FrozenInvoiceOrder,
  FrozenOrderVatShare,
} from "../domain/services/invoice-dossier.types.js";

/** Le jour `AAAA-MM-JJ` d'une colonne `@db.Date`, lue à minuit UTC. */
const ISO_DAY_LENGTH = 10;

/**
 * Ce qu'un bon a figé pour sa facture — la sélection que lisent le dossier de
 * facturation ET la constitution d'un lot de prélèvement. Écrite une fois :
 * deux lectures du même bon qui divergeraient factureraient deux montants.
 */
export const FROZEN_INVOICE_ORDER_SELECT = {
  orderNumber: true,
  createdAt: true,
  requestedDeliveryDate: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  deliveryVatMode: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  vatShares: true,
  vatCents: true,
  totalCents: true,
  lines: {
    orderBy: { id: "asc" },
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
    },
  },
} satisfies Prisma.OrderSelect;

type FrozenInvoiceOrderRow = Prisma.OrderGetPayload<{
  select: typeof FROZEN_INVOICE_ORDER_SELECT;
}>;

/** La ligne Prisma d'un bon → les entrées du simulateur de facture. */
export function toFrozenInvoiceOrder(row: FrozenInvoiceOrderRow): FrozenInvoiceOrder {
  return {
    reference: row.orderNumber,
    createdAt: row.createdAt,
    requestedDeliveryDate:
      row.requestedDeliveryDate?.toISOString().slice(0, ISO_DAY_LENGTH) ?? null,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      productNameSnapshot: line.productNameSnapshot,
      unitPriceMillicents: line.unitPriceMillicents,
      // Lu tel quel (« 5.50 ») : le domaine normalise, jamais l'adaptateur.
      vatRate: line.vatRate.toString(),
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
    discountCents: row.discountCents,
    voucherDiscountCents: row.voucherDiscountCents,
    deliveryFeeCents: row.deliveryFeeCents,
    deliveryVatMode: parseDeliveryVatMode(row.deliveryVatMode),
    lateFeeCents: row.lateFeeCents,
    lateFeeVatRate: parseLateFeeVatRate(row.lateFeeAdjustment),
    vatShares: parseVatShares(row.vatShares),
    vatCents: row.vatCents,
    totalCents: row.totalCents,
  };
}

/**
 * Tenu par un CHECK en base ; une autre valeur se lit comme `null` — taux
 * normal, ce que facturait tout bon d'avant le réglage.
 */
function parseDeliveryVatMode(value: string | null): FrozenDeliveryVatMode | null {
  return value === "standard" || value === "follows_goods" ? value : null;
}

/** Absent ou illisible : `null`, et le domaine arrête le dossier si le bon porte une surtaxe. */
function parseLateFeeVatRate(value: Prisma.JsonValue | null): number | null {
  const parsed = lateFeeAdjustmentSchema.safeParse(value);
  return parsed.success ? parsed.data.vatRatePercent : null;
}

/** Comme au relevé : validé, pas casté ; `null` envoie la TVA du bon en « non ventilée ». */
function parseVatShares(value: Prisma.JsonValue | null): readonly FrozenOrderVatShare[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
