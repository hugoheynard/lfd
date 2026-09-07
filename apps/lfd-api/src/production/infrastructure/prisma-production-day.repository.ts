import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDay } from "../domain/entities/production-day.js";
import { ProductionDayRepository } from "../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * L'adaptateur Prisma de la journée de production.
 *
 * Il porte **les deux mappers**, et aucun type `Prisma.*` ne le franchit :
 * `toDomain` rehydrate l'agrégat — dont les value objects revalident au passage
 * —, `save` lit ses getters. C'est la frontière que le `CLAUDE.md` exige, et
 * elle n'est pas décorative : sans elle, la forme des tables remonterait
 * jusqu'aux écrans du fournil, ce que ce contexte existe précisément pour
 * empêcher.
 */
@Injectable()
export class PrismaProductionDayRepository extends ProductionDayRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Une journée **ouverte** quand rien n'est écrit, jamais `null`.
   *
   * Le port l'exige, et pour une raison : un `null` obligerait chaque appelant à
   * décider ce qu'il en fait, et l'un d'eux finirait par fabriquer une journée
   * d'une manière que l'agrégat n'a pas prévue.
   */
  async load(day: ServiceDay): Promise<ProductionDay> {
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay: day.value },
      select: {
        serviceDay: true,
        closedAt: true,
        orders: {
          select: {
            orderId: true,
            reference: true,
            customerLabel: true,
            fulfillmentMethod: true,
            destination: true,
            lines: { select: { sku: true, productName: true, quantity: true } },
          },
        },
        counts: { select: { sku: true, productName: true, quantity: true } },
      },
    });
    if (row === null) {
      return ProductionDay.open(day);
    }
    return ProductionDay.fromSnapshot({
      serviceDay: row.serviceDay,
      closedAt: row.closedAt,
      orders: row.orders.map((order) => ({
        orderId: order.orderId,
        reference: order.reference,
        customerLabel: order.customerLabel,
        // Le mode d'acheminement est un mot du domaine, pas une colonne : on le
        // ramène dans son union plutôt que de laisser une `string` circuler.
        fulfillmentMethod: order.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
        destination: order.destination,
        lines: order.lines.map((line) => ({
          sku: line.sku,
          productName: line.productName,
          quantity: line.quantity,
        })),
      })),
      counts: row.counts.map((count) => ({
        sku: count.sku,
        productName: count.productName,
        quantity: count.quantity,
      })),
    });
  }

  /**
   * Écrit la journée **en entier**, dans une seule transaction.
   *
   * ⚠️ Les enfants sont remplacés, pas fusionnés : l'agrégat est l'autorité, et
   * une fusion laisserait vivre une commande que la journée ne porte plus. Le
   * coût est nul — une journée n'est écrite qu'à sa clôture.
   *
   * Un compte à produire enregistré sans ses commandes décrirait une journée que
   * personne ne pourrait relire ; d'où la transaction, et non trois écritures.
   */
  async save(day: ProductionDay): Promise<void> {
    const snapshot = day.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      await tx.productionDay.upsert({
        where: { serviceDay: snapshot.serviceDay },
        create: { serviceDay: snapshot.serviceDay, closedAt: snapshot.closedAt },
        update: { closedAt: snapshot.closedAt },
      });
      await tx.productionOrder.deleteMany({ where: { serviceDay: snapshot.serviceDay } });
      await tx.productionCount.deleteMany({ where: { serviceDay: snapshot.serviceDay } });
      for (const order of snapshot.orders) {
        await tx.productionOrder.create({
          data: {
            serviceDay: snapshot.serviceDay,
            orderId: order.orderId,
            reference: order.reference,
            customerLabel: order.customerLabel,
            fulfillmentMethod: order.fulfillmentMethod,
            destination: order.destination,
            lines: { create: order.lines.map((line) => ({ ...line })) },
          },
        });
      }
      if (snapshot.counts.length > 0) {
        await tx.productionCount.createMany({
          data: snapshot.counts.map((count) => ({
            serviceDay: snapshot.serviceDay,
            sku: count.sku,
            productName: count.productName,
            quantity: count.quantity,
          })),
        });
      }
    });
  }
}
