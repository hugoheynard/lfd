import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { CANCELLED_BASKET, type Basket } from "../domain/entities/basket.js";
import { BasketRepository } from "../domain/ports/basket.repository.js";
import { BASKET_INCLUDE, basketFromRow } from "./basket-row.mapper.js";

/**
 * Adaptateur Prisma d'écriture des paniers : l'agrégat ↔ `recurring.basket`
 * et ses lignes. Rejoint l'unité de travail ambiante.
 */
@Injectable()
export class PrismaBasketRepository extends BasketRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async insert(basket: Basket, at: Date): Promise<void> {
    const { routing, salesTerms } = basket;
    await this.prisma.basket.create({
      data: {
        id: basket.id,
        buyerUserId: basket.buyerUserId,
        companyId: basket.companyId,
        fromOrderId: basket.fromOrderId,
        cadence: basket.cadence,
        status: basket.lifecycle,
        startDate: basket.startDate.toUtcDate(),
        endDate: basket.endDate === null ? null : basket.endDate.toUtcDate(),
        fulfillmentMethod: routing.method,
        deliveryAddress: routing.deliveryAddress ?? Prisma.DbNull,
        pickupAddressId: routing.pickupAddressId,
        requestedWindow: { start: routing.window.start, end: routing.window.end },
        note: basket.note,
        salesTermsKey: salesTerms.key,
        salesTermsRevision: salesTerms.revision,
        salesTermsFileId: salesTerms.fileId,
        plannedUntil: basket.plannedUntil === null ? null : basket.plannedUntil.toUtcDate(),
        createdAt: at,
        updatedAt: at,
        lines: {
          create: basket.lines.map((line, position) => ({
            id: this.ids.next(),
            position,
            sku: line.sku,
            quantity: line.quantity,
          })),
        },
      },
    });
  }

  async load(basketId: string, buyerUserId: string): Promise<Basket | null> {
    const row = await this.prisma.basket.findFirst({
      // Un panier arrêté répond comme un panier absent.
      where: { id: basketId, buyerUserId, status: { not: CANCELLED_BASKET } },
      include: BASKET_INCLUDE,
    });
    return row === null ? null : basketFromRow(row);
  }

  async liveUnderSalesTerms(salesTermsKey: string): Promise<readonly Basket[]> {
    const rows = await this.prisma.basket.findMany({
      where: { salesTermsKey, status: { not: CANCELLED_BASKET } },
      include: BASKET_INCLUDE,
      orderBy: { id: "asc" },
    });
    return rows.map(basketFromRow);
  }

  async save(basket: Basket, at: Date): Promise<void> {
    await this.prisma.basket.update({
      where: { id: basket.id },
      data: {
        status: basket.lifecycle,
        plannedUntil: basket.plannedUntil === null ? null : basket.plannedUntil.toUtcDate(),
        ...salesTermsColumns(basket),
        updatedAt: at,
      },
    });
  }
}

/**
 * Les CGV que le panier applique et celles qu'il annonce : une annonce
 * entrée en vigueur devient la version appliquée (`Basket.announceSalesTerms`).
 */
function salesTermsColumns(basket: Basket) {
  const next = basket.nextSalesTerms;
  return {
    salesTermsRevision: basket.salesTerms.revision,
    salesTermsFileId: basket.salesTerms.fileId,
    salesTermsNextRevision: next?.revision ?? null,
    salesTermsNextFileId: next?.fileId ?? null,
    salesTermsEffectiveOn: next === null ? null : next.effectiveOn.toUtcDate(),
  };
}
