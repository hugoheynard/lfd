import { Injectable } from "@nestjs/common";

import { AddressKind, Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { DeliveryAddressInvalidError } from "../domain/errors/order-errors.js";
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
    return this.prisma.$transaction(async (tx) => {
      // En **livraison**, l'adresse doit relever de CETTE entreprise (livraison,
      // non archivée) — filtre sur (id ET companyId), jamais l'id seul. En
      // **retrait**, aucune adresse à valider : le snapshot est déjà figé.
      if (order.fulfillmentMethod === "delivery") {
        const address = await tx.address.findFirst({
          where: {
            id: order.deliveryAddressId ?? "",
            companyId: order.companyId,
            kind: AddressKind.livraison,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (address === null) {
          throw new DeliveryAddressInvalidError(order.deliveryAddressId ?? "");
        }
      }

      return tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          companyId: order.companyId,
          placedByUserId: order.placedByUserId,
          requestedDeliveryDate: order.requestedDeliveryDate,
          fulfillmentMethod: order.fulfillmentMethod,
          deliveryAddressId: order.deliveryAddressId,
          pickupAddress: order.pickupAddress ?? Prisma.DbNull,
          subtotalCents: order.subtotalCents,
          totalCents: order.totalCents,
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
    });
  }
}
