import type { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Les colonnes de `orders` qu'une révision réécrit — celles que l'historique garde. */
const REVISED_COLUMNS = {
  requestedDeliveryDate: true,
  fulfillmentMethod: true,
  deliveryZoneId: true,
  deliveryAddressSnapshot: true,
  deliveryAddressId: true,
  pickupAddress: true,
  fulfillment: true,
  note: true,
  subtotalCents: true,
  discountCents: true,
  discountAdjustment: true,
  deliveryFeeCents: true,
  deliveryFeeAdjustment: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  deliveryVatMode: true,
  voucherDiscountCents: true,
  vatCents: true,
  vatShares: true,
  totalCents: true,
  revisedAt: true,
  lines: {
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
      unitPriceTtcCents: true,
      lineTotalTtcCents: true,
      basePriceMillicents: true,
      pricingSteps: true,
      pricingFloor: true,
      pricingFloored: true,
      pricingClampedToZero: true,
      pricingCommitment: true,
      pricingRejected: true,
      allergens: true,
      pickupDiscountEligible: true,
      productId: true,
      categoryId: true,
    },
    orderBy: { sku: "asc" },
  },
} as const;

/**
 * **La composition qu'une révision remplace, telle qu'elle était ÉCRITE** —
 * colonnes de `orders` et lignes complètes, sous les noms de leurs colonnes.
 *
 * Relue de la base plutôt que recomposée depuis le domaine : l'historique doit
 * garder ce qui était en base, trace de prix et allergènes compris, même ce
 * qu'aucun mapper d'aujourd'hui ne sait relire. Les dates passent en ISO, le
 * taux de TVA (décimal) en nombre : un JSON ne porte ni l'un ni l'autre.
 */
export async function revisedCompositionOf(
  prisma: PrismaService,
  orderId: string,
): Promise<Prisma.InputJsonObject> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: REVISED_COLUMNS,
  });
  const { lines, requestedDeliveryDate, revisedAt, ...columns } = row;
  return {
    ...columns,
    requestedDeliveryDate:
      requestedDeliveryDate === null ? null : requestedDeliveryDate.toISOString().slice(0, 10),
    revisedAt: revisedAt === null ? null : revisedAt.toISOString(),
    lines: lines.map((line) => ({ ...line, vatRate: line.vatRate.toNumber() })),
  };
}
