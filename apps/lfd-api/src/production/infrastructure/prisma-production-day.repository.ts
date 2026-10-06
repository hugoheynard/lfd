import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDay } from "../domain/entities/production-day.js";
import { ProductionDayRepository } from "../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";
import { BATCH_COLUMNS, batchOf, returnsByBatch } from "./prisma-production-batch.repository.js";
import { signerColumns, signerOf } from "./production-day-signer.columns.js";
import {
  SHEET_COLUMNS,
  clienteleOf,
  sheetDetailsOf,
  sheetRowOf,
} from "./production-order-sheet.columns.js";

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
        closedBy: true,
        closedByName: true,
        retakenByName: true,
        packingOwner: true,
        orders: {
          select: {
            orderId: true,
            reference: true,
            customerLabel: true,
            fulfillmentMethod: true,
            destination: true,
            dueAt: true,
            clientele: true,
            ...SHEET_COLUMNS,
            lines: { select: { sku: true, productName: true, quantity: true } },
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
        // Les retours demandés au colisage (K2) : ce qu'il a rendu, ce qui attend.
        returns: { select: { batchId: true, quantity: true, returned: true } },
      },
    });
    if (row === null) {
      return ProductionDay.open(day);
    }
    const returns = returnsByBatch(row.returns);
    return ProductionDay.fromSnapshot({
      serviceDay: row.serviceDay,
      closedAt: row.closedAt,
      closedBy: signerOf(row.closedBy, row.closedByName),
      retakenByName: row.retakenByName,
      // Les deux colonnes sont nullables : le mapper les recolle en un couple,
      // ou en `null` — l'agrégat ne connaît pas l'état où l'instant existe
      // sans son auteur.
      retaken:
        row.retakenAt === null || row.retakenBy === null
          ? null
          : { at: row.retakenAt, by: row.retakenBy },
      // Le CHECK de la base n'admet que ces deux valeurs.
      packingOwner: row.packingOwner === "packing" ? "packing" : "legacy",
      orders: row.orders.map((order) => ({
        // Le colisage n'est plus lu ici depuis K3c (§17.3) : c'est le colisage
        // qui le tient, et `SealedDayReading` le pose en lecture.
        packed: null,
        orderId: order.orderId,
        reference: order.reference,
        customerLabel: order.customerLabel,
        // Le mode d'acheminement est un mot du domaine, pas une colonne : on le
        // ramène dans son union plutôt que de laisser une `string` circuler.
        fulfillmentMethod: order.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
        destination: order.destination,
        dueAt: order.dueAt,
        clientele: clienteleOf(order.clientele),
        lines: order.lines.map((line) => ({
          sku: line.sku,
          productName: line.productName,
          quantity: line.quantity,
        })),
        sheetDetails: sheetDetailsOf(order),
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
      batches: row.batches.map((batch) => batchOf(batch, returns.get(batch.id))),
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
   *
   * 🔴 Elle prend d'abord le verrou de la journée (D4 des fournées) — la même
   * requête que `PrismaProductionDayLock`, écrite ici parce qu'elle doit viser
   * `tx`. Ce verrou-ci ne protège QUE l'écriture : il ne rend pas juste un
   * agrégat chargé avant lui. Les appelants qui décident sur la journée
   * (clôture, retirage) prennent `ProductionDayLock` dans leur unité de
   * travail PUIS la rechargent (vérifié le 2026-10-06 ; la clôture ne le
   * faisait pas avant le lot A0).
   *
   * 🔴 **Le colisage de l'ancien poste est RECOPIÉ, jamais interprété.** Les
   * colonnes `packed_*` et `container_count` ne sont plus ni lues par le
   * domaine ni écrites par un geste (K3c, §17.3), mais les journées colisées
   * avant la bascule les portent : effacer puis recréer les commandes d'un
   * retirage les remettrait à vide, et un historique réel disparaîtrait
   * (CLAUDE.md §0). Elles passent donc de l'ancienne ligne à la nouvelle, telles
   * quelles, par `carriedPacking`.
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
          ...signerColumns(snapshot.closedBy),
          retakenByName: snapshot.retakenByName,
          packingOwner: snapshot.packingOwner,
        },
        update: {
          closedAt: snapshot.closedAt,
          retakenAt: snapshot.retaken?.at ?? null,
          retakenBy: snapshot.retaken?.by ?? null,
          ...signerColumns(snapshot.closedBy),
          retakenByName: snapshot.retakenByName,
          packingOwner: snapshot.packingOwner,
        },
      });
      const carried = await carriedPacking(tx, snapshot.serviceDay);
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
            clientele: order.clientele,
            ...sheetRowOf(order.sheetDetails),
            ...carried.orders.get(order.orderId),
            lines: {
              create: order.lines.map((line) => ({
                sku: line.sku,
                productName: line.productName,
                quantity: line.quantity,
                ...carried.lines.get(`${order.orderId}/${line.sku}`),
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

/** Le colisage de l'ancien poste d'une commande, tel que la base le porte. */
interface CarriedOrderPacking {
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly containerCount: number;
}

/** Le colisage de l'ancien poste d'une ligne, tel que la base le porte. */
interface CarriedLinePacking {
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly packedInitials: string;
}

/** Ce que `carriedPacking` relit d'une journée — la seule lecture restante des colonnes mortes. */
interface CarriedPacking {
  readonly orders: ReadonlyMap<string, CarriedOrderPacking>;
  /** Par `<orderId>/<sku>`. */
  readonly lines: ReadonlyMap<string, CarriedLinePacking>;
}

/** Le client transactionnel, réduit à la seule lecture dont la recopie a besoin. */
interface PackingCarrierClient {
  readonly productionOrder: {
    findMany(args: {
      where: { serviceDay: string };
      select: {
        orderId: true;
        packedAt: true;
        packedBy: true;
        containerCount: true;
        lines: { select: { sku: true; packedAt: true; packedBy: true; packedInitials: true } };
      };
    }): Promise<
      readonly (CarriedOrderPacking & {
        readonly orderId: string;
        readonly lines: readonly (CarriedLinePacking & { readonly sku: string })[];
      })[]
    >;
  };
}

/**
 * **Relit le colisage de l'ancien poste**, pour le recopier tel quel (cf.
 * `save`). Rien ne l'interprète : il passe d'une ligne effacée à la ligne
 * recréée, et une commande ou une ligne nouvelle naît avec les défauts de la
 * base.
 */
async function carriedPacking(
  tx: PackingCarrierClient,
  serviceDay: string,
): Promise<CarriedPacking> {
  const rows = await tx.productionOrder.findMany({
    where: { serviceDay },
    select: {
      orderId: true,
      packedAt: true,
      packedBy: true,
      containerCount: true,
      lines: { select: { sku: true, packedAt: true, packedBy: true, packedInitials: true } },
    },
  });
  return {
    orders: new Map(
      rows.map((row) => [
        row.orderId,
        { packedAt: row.packedAt, packedBy: row.packedBy, containerCount: row.containerCount },
      ]),
    ),
    lines: new Map(
      rows.flatMap((row) =>
        row.lines.map((line) => [
          `${row.orderId}/${line.sku}`,
          { packedAt: line.packedAt, packedBy: line.packedBy, packedInitials: line.packedInitials },
        ]),
      ),
    ),
  };
}
