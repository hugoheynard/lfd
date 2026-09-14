import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  ProductionDay,
  type DoneMark,
  type PackedLineMark,
} from "../domain/entities/production-day.js";
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
        retakenAt: true,
        retakenBy: true,
        orders: {
          select: {
            orderId: true,
            reference: true,
            customerLabel: true,
            fulfillmentMethod: true,
            destination: true,
            packedAt: true,
            packedBy: true,
            containerCount: true,
            lines: {
              select: {
                sku: true,
                productName: true,
                quantity: true,
                packedAt: true,
                packedBy: true,
                packedInitials: true,
              },
            },
          },
        },
        counts: {
          select: {
            sku: true,
            productName: true,
            quantity: true,
            doneAt: true,
            doneBy: true,
            doneInitials: true,
          },
        },
      },
    });
    if (row === null) {
      return ProductionDay.open(day);
    }
    return ProductionDay.fromSnapshot({
      serviceDay: row.serviceDay,
      closedAt: row.closedAt,
      // Même recollage que le colisage juste en dessous, et même raison :
      // l'agrégat ne connaît pas l'état où l'instant existe sans son auteur.
      retaken:
        row.retakenAt === null || row.retakenBy === null
          ? null
          : { at: row.retakenAt, by: row.retakenBy },
      orders: row.orders.map((order) => ({
        // Les deux colonnes restent nullables en base — c'est la même ligne
        // avant et après le colisage. Le mapper les recolle en un couple, ou en
        // `null` : l'agrégat n'a pas à connaître l'état où l'une existe sans
        // l'autre, parce que rien ne le produit.
        packed:
          order.packedAt === null || order.packedBy === null
            ? null
            : { at: order.packedAt, by: order.packedBy },
        containers: order.containerCount,
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
          // Même recollage que le colisage de la commande : `packed_at` seul
          // décide, les initiales ont un défaut vide. Une ligne mise au bac
          // sans signature reste une ligne au bac.
          packed:
            line.packedAt === null || line.packedBy === null
              ? null
              : { at: line.packedAt, by: line.packedBy, initials: line.packedInitials },
        })),
      })),
      counts: row.counts.map((count) => ({
        sku: count.sku,
        productName: count.productName,
        quantity: count.quantity,
        // `doneAt` seul décide : c'est la colonne nullable, et les initiales ont
        // un défaut vide. Une ligne faite sans signature reste une ligne faite.
        done:
          count.doneAt === null || count.doneBy === null
            ? null
            : { at: count.doneAt, by: count.doneBy, initials: count.doneInitials },
      })),
    });
  }

  /**
   * Grave le colisage, **conditionné en base**.
   *
   * `packedAt: null` dans le `where` : c'est la base qui arbitre, donc deux
   * postes qui scannent la même feuille au même moment produisent exactement un
   * colisage. Une `save` de l'agrégat ne le pourrait pas — elle réécrit la
   * journée entière, et le second écrasement effacerait le premier.
   */
  async markPacked(day: ServiceDay, reference: string, at: Date, by: string): Promise<boolean> {
    const { count } = await this.prisma.productionOrder.updateMany({
      where: { serviceDay: day.value, reference, packedAt: null },
      data: { packedAt: at, packedBy: by },
    });
    return count === 1;
  }

  /**
   * Coche ou décoche une ligne du compte — **une écriture ciblée**.
   *
   * ⚠️ Une écriture nue, comme {@link markPacked}, et la justification est la
   * même : `save` réécrit la journée entière (elle efface commandes et compte
   * avant de les recréer). Deux postes qui cochent DEUX LIGNES DIFFÉRENTES au
   * même moment — le cas normal au fournil, où six personnes travaillent sur
   * six fiches — verraient le second écrasement effacer le premier. Ici chacune
   * ne touche que sa ligne.
   *
   * Aucun `where` conditionnel sur `done_at`, contrairement au colisage : là-bas
   * le premier scan est le seul vrai, ici le DERNIER geste est le vrai,
   * puisqu'une case se décoche et se recoche. Il n'y a donc pas de course à
   * arbitrer — seulement un ordre à respecter, et c'est celui des requêtes.
   *
   * Les invariants restent dans l'agrégat (`itemToMark`) : ce qui passe ici a
   * déjà été refusé ou accepté par lui.
   */
  async markProduced(day: ServiceDay, sku: string, mark: DoneMark | null): Promise<void> {
    await this.prisma.productionCount.updateMany({
      where: { serviceDay: day.value, sku },
      data: {
        doneAt: mark?.at ?? null,
        doneBy: mark?.by ?? null,
        doneInitials: mark?.initials ?? "",
      },
    });
  }

  /**
   * Met une ligne au bac, ou l'en ressort — **une écriture ciblée**.
   *
   * ⚠️ Une écriture nue, comme {@link markProduced}, et la justification monte
   * d'un cran : `save` réécrit la journée entière (elle efface commandes ET
   * lignes avant de les recréer), et deux postes colisent deux bacs différents
   * au même moment — c'est le cas NORMAL du poste, où chacun tient un bon. Le
   * second écrasement effacerait tout le remplissage du premier. Ici chacun ne
   * touche que sa ligne.
   *
   * Le `where` remonte jusqu'à la journée par la relation : `production_order`
   * n'est unique que sur `(service_day, order_id)`, donc une référence seule ne
   * désigne pas une ligne — deux journées peuvent porter la même commande si le
   * commerce la déplace.
   *
   * Les invariants restent dans l'agrégat (`lineToPack`), bac fermé compris :
   * ce qui passe ici a déjà été refusé ou accepté par lui.
   */
  async markPackedLine(
    day: ServiceDay,
    reference: string,
    sku: string,
    mark: PackedLineMark | null,
  ): Promise<void> {
    await this.prisma.productionOrderLine.updateMany({
      where: { sku, order: { serviceDay: day.value, reference } },
      data: {
        packedAt: mark?.at ?? null,
        packedBy: mark?.by ?? null,
        packedInitials: mark?.initials ?? "",
      },
    });
  }

  /**
   * Grave le nombre de containers d'une commande — **une écriture ciblée**.
   *
   * ⚠️ Une écriture nue, comme {@link markPackedLine}, et la justification est
   * la même : `save` réécrit la journée entière, et deux postes tiennent deux
   * bons au même moment. Le second écrasement effacerait le remplissage et le
   * compte du premier ; ici chacun ne touche que sa commande.
   *
   * Le `where` porte la journée ET la référence : `production_order` n'est
   * unique que sur `(service_day, order_id)`, donc une référence seule ne
   * désigne pas une ligne.
   *
   * Les invariants restent dans l'agrégat (`declareContainers`), bac fermé
   * compris : ce qui passe ici a déjà été refusé ou accepté par lui.
   */
  async recordContainerCount(
    day: ServiceDay,
    reference: string,
    containers: number,
  ): Promise<void> {
    await this.prisma.productionOrder.updateMany({
      where: { serviceDay: day.value, reference },
      data: { containerCount: containers },
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
        create: {
          serviceDay: snapshot.serviceDay,
          closedAt: snapshot.closedAt,
          retakenAt: snapshot.retaken?.at ?? null,
          retakenBy: snapshot.retaken?.by ?? null,
        },
        update: {
          closedAt: snapshot.closedAt,
          retakenAt: snapshot.retaken?.at ?? null,
          retakenBy: snapshot.retaken?.by ?? null,
        },
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
            packedAt: order.packed === null ? null : order.packed.at,
            packedBy: order.packed === null ? null : order.packed.by,
            // 🔴 Réécrit, pas perdu — même raison que le remplissage des lignes
            // plus bas : les commandes sont effacées puis recréées ici, et un
            // retirage ferait sinon recompter tous les bacs déjà comptés.
            containerCount: order.containers,
            lines: {
              create: order.lines.map((line) => ({
                sku: line.sku,
                productName: line.productName,
                quantity: line.quantity,
                // 🔴 Le remplissage du bac est RÉÉCRIT, pas perdu — même raison
                // que les coches du compte à produire juste en dessous. Les
                // lignes sont effacées puis recréées ici ; sans ces trois
                // champs, un retirage viderait tous les bacs en cours et le
                // fournil recommencerait un colisage déjà fait.
                packedAt: line.packed?.at ?? null,
                packedBy: line.packed?.by ?? null,
                packedInitials: line.packed?.initials ?? "",
              })),
            },
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
            // 🔴 Les coches sont RÉÉCRITES, pas perdues. Le compte est effacé
            // puis recréé juste au-dessus ; sans ces trois lignes, un retirage
            // décocherait tout ce que le fournil a sorti depuis 4 h, et la
            // fiche lui redemanderait de refaire ce qui est fait.
            doneAt: count.done?.at ?? null,
            doneBy: count.done?.by ?? null,
            doneInitials: count.done?.initials ?? "",
          })),
        });
      }
    });
  }
}
