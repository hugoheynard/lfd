import { Injectable } from "@nestjs/common";

import { PaymentStatus, Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  OrderRepository,
  type OrderToPlace,
  type PlacedOrder,
} from "../domain/ports/order.repository.js";

/**
 * Numéro humain d'une commande — `ORD-<horodatage base36>-<aléa>`. Suffisamment
 * unique ; la colonne `order_number` est `@unique`, un doublon échouerait plutôt
 * que de passer en silence. (Le vrai identifiant reste le `cuid`.)
 */
function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `ORD-${stamp}-${suffix}`;
}

/** Adaptateur Prisma des commandes. */
@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async place(order: OrderToPlace): Promise<PlacedOrder> {
    // Coursier et retrait figent déjà leurs adresses en snapshot (zone re-résolue
    // serveur, adresse libre côté client) : plus d'adresse d'entreprise à valider.
    return this.prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        companyId: order.companyId,
        placedByUserId: order.placedByUserId,
        requestedDeliveryDate: order.requestedDeliveryDate,
        fulfillmentMethod: order.fulfillmentMethod,
        deliveryZoneId: order.deliveryZoneId,
        deliveryAddressSnapshot: order.deliveryAddress ?? Prisma.DbNull,
        pickupAddress: order.pickupAddress ?? Prisma.DbNull,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        deliveryFeeCents: order.deliveryFeeCents,
        vatCents: order.vatCents,
        totalCents: order.totalCents,
        paymentStatus: order.paymentStatus,
        stripePaymentIntentId: order.stripePaymentIntentId,
        note: order.note,
        lines: {
          create: order.lines.map((line) => ({
            sku: line.sku,
            productNameSnapshot: line.productName,
            unitPriceCents: line.unitPriceCents,
            vatRate: line.vatRate,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
          })),
        },
      },
      select: { id: true, orderNumber: true },
    });
  }

  async markPaid(paymentIntentId: string): Promise<void> {
    // `updateMany` + filtre `pending` = idempotence : un webhook rejoué (déjà
    // `paid`) ou un intent inconnu ne matche aucune ligne, l'appel est un no-op.
    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, paymentStatus: PaymentStatus.pending },
      data: { paymentStatus: PaymentStatus.paid, paidAt: new Date() },
    });
  }

  async markPaymentFailed(paymentIntentId: string): Promise<void> {
    // Même idempotence : on ne rétrograde que ce qui était encore `pending` (un
    // paiement déjà `paid` n'est jamais repassé à `failed`).
    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, paymentStatus: PaymentStatus.pending },
      data: { paymentStatus: PaymentStatus.failed },
    });
  }
}
