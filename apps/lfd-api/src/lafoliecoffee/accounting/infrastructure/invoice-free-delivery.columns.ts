import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import type { InvoiceFreeDelivery } from "../domain/entities/invoice.types.js";

/**
 * **La livraison offerte d'un bon, relue pour sa facture** (plan
 * `frais-et-livraison-offerte.md`). La comptabilité a sa propre lecture
 * des colonnes figées de la commande (`orders.free_delivery_*`) — elle
 * n'importe pas l'infrastructure des commandes — et sa propre colonne figée
 * sur la pièce (`invoice_order.free_delivery`).
 *
 * Seuls le barème offert et le libellé de la promotion comptent ici : les
 * seuils restent à la commande, que la révision rejuge.
 */
export const INVOICE_ORDER_FREE_DELIVERY_SELECT = {
  freeDeliveryWaivedCents: true,
  freeDeliveryWaivedTtcCents: true,
  freeDeliveryLabel: true,
} as const satisfies Prisma.OrderSelect;

/** Ce que Prisma rend pour {@link INVOICE_ORDER_FREE_DELIVERY_SELECT}. */
export interface InvoiceOrderFreeDeliveryRow {
  readonly freeDeliveryWaivedCents: number | null;
  readonly freeDeliveryWaivedTtcCents: number | null;
  readonly freeDeliveryLabel: Prisma.JsonValue | null;
}

const labelSchema = z.object({ fr: z.string(), en: z.string(), it: z.string() });

/**
 * La livraison offerte de la commande, à figer sur la pièce ; `null` sans
 * elle. Les CHECK `orders_free_delivery_*` tiennent la forme ; un libellé
 * illisible se tait — la facture ne s'arrête pas sur une mention qu'elle
 * sait dire sans lui (« Livraison offerte »).
 */
export function invoiceFreeDeliveryOfOrder(
  row: InvoiceOrderFreeDeliveryRow,
): InvoiceFreeDelivery | null {
  if (row.freeDeliveryWaivedCents === null) {
    return null;
  }
  const label = labelSchema.safeParse(row.freeDeliveryLabel);
  return {
    waivedCents: row.freeDeliveryWaivedCents,
    waivedTtcCents: row.freeDeliveryWaivedTtcCents,
    ...(label.success ? { label: label.data } : {}),
  };
}

/** La forme de `invoice_order.free_delivery`. */
export const invoiceFreeDeliveryColumnSchema = z.object({
  waivedCents: z.number().int(),
  waivedTtcCents: z.number().int().nullable(),
  label: labelSchema.optional(),
});

/** Bon → colonne : `NULL` sans livraison offerte. */
export function invoiceFreeDeliveryColumn(
  freeDelivery: InvoiceFreeDelivery | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (freeDelivery === undefined) {
    return Prisma.DbNull;
  }
  const { waivedCents, waivedTtcCents, label } = freeDelivery;
  return {
    waivedCents,
    waivedTtcCents,
    ...(label === undefined ? {} : { label: { fr: label.fr, en: label.en, it: label.it } }),
  };
}

/** La colonne relue (déjà validée) → la mention du bon. */
export function invoiceFreeDeliveryOfColumn(
  column: z.infer<typeof invoiceFreeDeliveryColumnSchema>,
): InvoiceFreeDelivery {
  const { waivedCents, waivedTtcCents, label } = column;
  return { waivedCents, waivedTtcCents, ...(label === undefined ? {} : { label }) };
}

/** Le champ optionnel d'un candidat à la facture : absent sans livraison offerte. */
export function freeDeliveryFieldOf(row: InvoiceOrderFreeDeliveryRow): {
  readonly freeDelivery?: InvoiceFreeDelivery;
} {
  const freeDelivery = invoiceFreeDeliveryOfOrder(row);
  return freeDelivery === null ? {} : { freeDelivery };
}
