import { Injectable } from "@nestjs/common";

import { OrderStatus, Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../domain/entities/order-revision.js";
import { OrderRevisionRepository } from "../domain/ports/order-revision.repository.js";
import { customerCancellationColumnsOf } from "./customer-cancellation.columns.js";
import { toFulfillmentJson } from "./order-json.js";
import { identifiedLinesOf, orderDiscountsWriteOf, writeCoverage } from "./order-discounts.data.js";
import { ttcTermsColumnsOf } from "./order-money-columns.js";
import { REVISABLE_ORDER_SELECT, toRevisableOrder } from "./revisable-order.row.js";
import { revisedCompositionOf } from "./revised-composition.js";

/**
 * Adaptateur Prisma de la révision d'une commande (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, §9). Rejoint
 * l'unité de travail ambiante : la révision, son historique, la note au
 * fournil, la ligne d'encaissement et les faits partent ensemble, ou rien.
 */
/** Les statuts qu'une révision écrit : avant l'arrêt, et inscrite (plan A2, § 7). */
const REVISABLE_STATUSES = [OrderStatus.placed, OrderStatus.confirmed];

@Injectable()
export class PrismaOrderRevisionRepository extends OrderRevisionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async lock(orderId: string): Promise<RevisableOrder | null> {
    // Le verrou d'abord, la lecture ensuite : sous `FOR UPDATE`, une seconde
    // modification attend la première, puis lit sa révision.
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ${orderId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: REVISABLE_ORDER_SELECT,
    });
    return toRevisableOrder(row);
  }

  /**
   * L'écriture conditionnée d'abord (révision ET `placed`, R7 — ou
   * `confirmed`, la commande inscrite dont l'équipe change les quantités,
   * plan A2, § 7 : la règle et les guichets l'ont déjà jugée) : si elle ne
   * franchit pas, rien d'autre n'est écrit. La composition remplacée est
   * relue telle qu'écrite AVANT d'être recouverte, puis les lignes sont
   * remplacées en bloc — l'historique seul fait foi du passé.
   */
  async save(revision: OrderRevisionToSave, author: RevisionActor, at: Date): Promise<boolean> {
    // UNE transaction (plan des promotions, § 18.2 et § 18.5, M3) : rejoint
    // l'unité de travail du handler, ou en ouvre une. `discount_cents` réécrit,
    // les remises actives archivées, le nouvel ensemble inséré — le
    // déclencheur différé juge Σ remises = `discount_cents` au COMMIT, et
    // refuserait chacune de ces écritures validée seule.
    return this.prisma.$transaction((tx) => this.write(tx, revision, author, at));
  }

  private async write(
    tx: Prisma.TransactionClient,
    revision: OrderRevisionToSave,
    author: RevisionActor,
    at: Date,
  ): Promise<boolean> {
    const replaced = await revisedCompositionOf(tx, revision.orderId);
    const { count } = await tx.order.updateMany({
      where: {
        id: revision.orderId,
        revision: revision.fromRevision,
        status: { in: REVISABLE_STATUSES },
      },
      data: revisedColumnsOf(revision, at),
    });
    if (count === 0) {
      return false;
    }
    // Lignes et remises AVANT l'historique : tout part dans la même
    // transaction, et un historique refusé (révision concurrente) défait aussi
    // l'archivage — l'e2e `order-discounts-control` le démontre.
    await this.replaceLinesAndDiscounts(tx, revision, at);
    await tx.orderRevisionEntry.create({ data: historyOf(revision, author, at, replaced) });
    return true;
  }

  /**
   * Les lignes remplacées en bloc, les remises ARCHIVÉES puis réinsérées —
   * jamais supprimées (§ 18.5) : un bon parti pointe une remise archivée. Les
   * couvertures des lignes supprimées partent avec elles (`CASCADE`) ; celles
   * du nouvel ensemble sont réécrites.
   */
  private async replaceLinesAndDiscounts(
    tx: Prisma.TransactionClient,
    revision: OrderRevisionToSave,
    at: Date,
  ): Promise<void> {
    const { state } = revision;
    const lines = identifiedLinesOf(state.lines, () => this.ids.next());
    const discounts = orderDiscountsWriteOf(state.basketDiscounts, lines.ids, () =>
      this.ids.next(),
    );
    await tx.orderDiscount.updateMany({
      where: { orderId: revision.orderId, archivedAt: null },
      data: { archivedAt: at },
    });
    await tx.order.update({
      where: { id: revision.orderId },
      data: {
        lines: { deleteMany: {}, create: lines.create },
        discounts: { create: discounts.create },
      },
    });
    await writeCoverage(tx, discounts.coverage);
  }
}

/** Les colonnes de `orders` que la révision réécrit. */
function revisedColumnsOf(revision: OrderRevisionToSave, at: Date) {
  const { state } = revision;
  return {
    revision: revision.toRevision,
    revisedAt: at,
    requestedDeliveryDate: state.requestedDeliveryDate,
    fulfillmentMethod: state.fulfillmentMethod,
    deliveryZoneId: state.deliveryZoneId,
    deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
    deliveryAddressId: state.deliveryAddressId,
    pickupAddress: state.pickupAddress ?? Prisma.DbNull,
    fulfillment: toFulfillmentJson(state.agreed),
    note: state.note,
    // La méthode est celle relue sur la commande (`Order.recompose`) : la
    // réécrire ne la change pas ; les TTC suivent la nouvelle composition.
    ...ttcTermsColumnsOf(state),
    subtotalCents: state.subtotalCents,
    discountCents: state.discountCents,
    discountAdjustment: state.discountAdjustment ?? Prisma.DbNull,
    // La promotion panier retenue (L9) ; `null` = aucune. Les commandes
    // d'avant L9 restent `NULL` = « inconnu » (§ 13.8).
    discountPromotionId: state.discountPromotionId,
    // La révision re-compose la remise : son libellé la suit (L8b).
    discountLabel:
      state.discountLabel === null
        ? Prisma.DbNull
        : {
            fr: state.discountLabel.fr,
            en: state.discountLabel.en,
            it: state.discountLabel.it,
          },
    deliveryFeeCents: state.deliveryFeeCents,
    deliveryFeeAdjustment: state.deliveryFeeAdjustment ?? Prisma.DbNull,
    lateFeeCents: state.lateFeeCents,
    lateFeeAdjustment: state.lateFeeAdjustment ?? Prisma.DbNull,
    deliveryVatMode: state.deliveryVatMode,
    voucherDiscountCents: state.voucherDiscountCents,
    vatCents: state.vatCents,
    vatShares: state.vatShares.map((share) => ({
      rate: share.rate,
      amountCents: share.amountCents,
    })),
    totalCents: state.totalCents,
    // Le délai d'origine reporté, l'instant recalculé sur le nouveau créneau.
    customerCancellableUntil: state.customerCancellableUntil,
    ...customerCancellationColumnsOf(state.customerCancellation),
  };
}

/** La ligne d'historique : la composition remplacée, telle qu'elle était écrite. */
function historyOf(
  revision: OrderRevisionToSave,
  author: RevisionActor,
  at: Date,
  replaced: Prisma.InputJsonObject,
) {
  return {
    orderId: revision.orderId,
    replacedRevision: revision.fromRevision,
    composition: replaced,
    changes: [...revision.changes],
    totalBeforeCents: revision.totalBeforeCents,
    totalAfterCents: revision.totalAfterCents,
    revisedByKind: author.kind,
    revisedByUserId: author.kind === "customer" ? author.userId : null,
    revisedByStaffId: author.kind === "staff" ? author.staffId : null,
    revisedAt: at,
  };
}
