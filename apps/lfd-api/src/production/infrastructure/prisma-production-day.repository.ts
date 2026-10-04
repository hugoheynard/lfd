import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDay, type PackedLineMark } from "../domain/entities/production-day.js";
import { ProductionDayRepository } from "../domain/ports/production-day.repository.js";
import {
  type ContainerStep,
  MAX_CONTAINERS_PER_ORDER,
} from "../domain/value-objects/container-step.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";
import { BATCH_COLUMNS, batchOf } from "./prisma-production-batch.repository.js";

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
        packingOwner: true,
        orders: {
          select: {
            orderId: true,
            reference: true,
            customerLabel: true,
            fulfillmentMethod: true,
            destination: true,
            dueAt: true,
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
        // Annulées comprises : « aucune fournée » (qui décide d'une fournée
        // implicite, §5.2 des fournées) se lit annulées comprises.
        batches: { select: BATCH_COLUMNS, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
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
      // Le CHECK de la base n'admet que ces deux valeurs.
      packingOwner: row.packingOwner === "packing" ? "packing" : "legacy",
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
        dueAt: order.dueAt,
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
      batches: row.batches.map(batchOf),
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
   * Met une ligne au bac, ou l'en ressort — **une écriture ciblée**.
   *
   * ⚠️ Une écriture nue, comme {@link markPacked}, et la justification monte
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
   * Les invariants restent dans l'agrégat (`lineToPack`, `lineToFill`), bac
   * fermé compris : ce qui passe ici a déjà été refusé ou accepté par lui, SOUS
   * le verrou de la journée que l'appelant a pris (D4 des fournées).
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
   * Un container de plus ou de moins, **atomique en SQL**.
   *
   * 🔴 `increment` / `decrement` compilent en `SET container_count =
   * container_count ± 1` : c'est la base qui lit et écrit d'un seul geste, et
   * c'est la seule forme qui compose deux « + » simultanés. Un `load` → calcul →
   * `recordContainerCount` perdrait l'un des deux, exactement comme le total
   * envoyé par l'écran le faisait avant le 2026-09-14.
   *
   * Le `WHERE` porte les deux bornes et `packed_at IS NULL` : la condition et
   * l'écriture sont la même instruction, donc aucun poste ne peut passer entre
   * les deux. Même partage que {@link markPacked} — l'agrégat a déjà dit si le
   * geste a un sens, la base ne tranche que la course.
   */
  async stepContainerCount(
    day: ServiceDay,
    reference: string,
    step: ContainerStep,
  ): Promise<boolean> {
    const { count } = await this.prisma.productionOrder.updateMany({
      where:
        step === "add"
          ? {
              serviceDay: day.value,
              reference,
              packedAt: null,
              containerCount: { lt: MAX_CONTAINERS_PER_ORDER },
            }
          : { serviceDay: day.value, reference, packedAt: null, containerCount: { gt: 0 } },
      data: { containerCount: step === "add" ? { increment: 1 } : { decrement: 1 } },
    });
    return count === 1;
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
   *
   * 🔴 Elle prend d'abord le verrou de la journée (D4 des fournées) — la même
   * requête que `PrismaProductionDayLock`, écrite ici parce qu'elle doit viser
   * `tx`. L'appelant a chargé l'agrégat sous ce verrou : le colisage réécrit
   * ci-dessous est donc celui d'après le dernier geste de bac, pas d'avant.
   *
   * Les fournées ne sont ni lues ni écrites ici : elles ne dépendent pas du
   * compte, et un retirage les laisse intactes. `done_*` n'est plus écrit (§5 :
   * le nouveau binaire n'y écrit jamais) — le compte recréé naît sans coche.
   */
  async save(day: ProductionDay): Promise<void> {
    const snapshot = day.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "service_day" FROM "production"."production_day"
         WHERE "service_day" = ${snapshot.serviceDay}
           FOR UPDATE`;
      await tx.productionDay.upsert({
        where: { serviceDay: snapshot.serviceDay },
        create: {
          serviceDay: snapshot.serviceDay,
          closedAt: snapshot.closedAt,
          retakenAt: snapshot.retaken?.at ?? null,
          retakenBy: snapshot.retaken?.by ?? null,
          packingOwner: snapshot.packingOwner,
        },
        update: {
          closedAt: snapshot.closedAt,
          retakenAt: snapshot.retaken?.at ?? null,
          retakenBy: snapshot.retaken?.by ?? null,
          packingOwner: snapshot.packingOwner,
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
            dueAt: order.dueAt,
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
                // 🔴 Le remplissage du bac est RÉÉCRIT, pas perdu. Les
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
          })),
        });
      }
    });
  }
}
