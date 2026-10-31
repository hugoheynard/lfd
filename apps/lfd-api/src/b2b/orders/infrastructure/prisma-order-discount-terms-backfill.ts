import { z } from "zod";

import type { Prisma, PrismaClient } from "../../../platform/database/client/client.js";
import type { FrozenDiscountTerms } from "../domain/services/frozen-discount-terms.js";
import { frozenTermsData, frozenTermsOf } from "./order-discount-terms.columns.js";

/**
 * **La reprise des termes figés des remises** —
 * `documentation/promotions/plan-remises-acquises.md`, § 10.3. Conduite par
 * `prisma/backfill-order-discounts.ts`, après la reprise des remises (M2).
 *
 * Une remise active posée avant `20261031210000_les_remises_acquises` n'a pas
 * de termes : la révision ne connaît ni son seuil ni sa cible d'acheminement.
 * La reprise les DÉDUIT de sa promotion telle qu'elle est en base — archivée
 * comprise — et les marque `backfilled` : c'est le figé déduit, pas le figé
 * réel, et la colonne le dit. Une promotion révisée depuis la commande donne
 * ses termes d'aujourd'hui : c'est la limite de la reprise, écrite ici.
 *
 * Rejouable : une remise qui a déjà des termes est sautée, et l'écriture est
 * conditionnée sur `frozen_terms_origin IS NULL`.
 */

/** Le sort d'une remise dans la passe. */
export type TermsBackfillOutcome =
  | { readonly kind: "backfilled" }
  /** Une autre passe l'a reprise entre la liste et l'écriture. */
  | { readonly kind: "already" }
  | { readonly kind: "undecided"; readonly reason: string };

export interface TermsBackfillLine {
  readonly orderNumber: string;
  readonly orderDiscountId: string;
  readonly outcome: TermsBackfillOutcome;
}

const conditionsSchema = z.array(z.object({ kind: z.string(), value: z.number() }));

export class PrismaOrderDiscountTermsBackfill {
  constructor(
    /** Un client nu : le script ne démarre pas l'`AppModule` (cf. la reprise M2). */
    private readonly prisma: PrismaClient,
  ) {}

  /** Les remises ACTIVES sans termes, rattachées à une promotion, dans l'ordre de pose. */
  async pendingDiscountIds(): Promise<readonly string[]> {
    const rows = await this.prisma.orderDiscount.findMany({
      where: { archivedAt: null, frozenTermsOrigin: null, promotionId: { not: null } },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => row.id);
  }

  /** Déduit les termes d'une remise ; si `write`, les écrit dans la transaction de la relecture. */
  async fill(orderDiscountId: string, write: boolean): Promise<TermsBackfillLine> {
    return this.prisma.$transaction(async (tx) => {
      const discount = await tx.orderDiscount.findUniqueOrThrow({
        where: { id: orderDiscountId },
        select: {
          promotionId: true,
          frozenTermsOrigin: true,
          order: { select: { orderNumber: true } },
        },
      });
      const line = (outcome: TermsBackfillOutcome): TermsBackfillLine => ({
        orderNumber: discount.order.orderNumber,
        orderDiscountId,
        outcome,
      });
      if (discount.frozenTermsOrigin !== null || discount.promotionId === null) {
        return line({ kind: "already" });
      }
      const terms = await deducedTerms(tx, orderDiscountId, discount.promotionId);
      if (typeof terms === "string") {
        return line({ kind: "undecided", reason: terms });
      }
      if (write) {
        const written = await tx.orderDiscount.updateMany({
          where: { id: orderDiscountId, frozenTermsOrigin: null },
          data: frozenTermsData(terms),
        });
        if (written.count === 0) {
          return line({ kind: "already" });
        }
      }
      return line({ kind: "backfilled" });
    });
  }
}

/**
 * Les termes de la promotion, tels qu'elle est en base ; une phrase quand ils
 * ne se déduisent pas — la remise reste alors sans termes, listée.
 */
async function deducedTerms(
  tx: Prisma.TransactionClient,
  orderDiscountId: string,
  promotionId: string,
): Promise<FrozenDiscountTerms | string> {
  const promotion = await tx.promotion.findUnique({
    where: { id: promotionId },
    select: {
      cumulative: true,
      conditions: true,
      fulfillmentPickup: true,
      fulfillmentDelivery: true,
      pickupPoints: { select: { pickupId: true }, orderBy: { pickupId: "asc" } },
      deliveryZones: { select: { zoneId: true }, orderBy: { zoneId: "asc" } },
    },
  });
  if (promotion === null) {
    return `promotion ${promotionId} introuvable`;
  }
  if (promotion.fulfillmentPickup === null || promotion.fulfillmentDelivery === null) {
    return "promotion « dans le prix affiché »";
  }
  const conditions = conditionsSchema.safeParse(promotion.conditions);
  if (!conditions.success) {
    return "conditions de la promotion illisibles";
  }
  // Relu par le domaine : une forme que les CHECK auraient dû refuser lève ici.
  return (
    frozenTermsOf(orderDiscountId, {
      cumulative: promotion.cumulative,
      minQuantity: conditions.data.find((entry) => entry.kind === "min_quantity")?.value ?? null,
      fulfillmentPickup: promotion.fulfillmentPickup,
      fulfillmentDelivery: promotion.fulfillmentDelivery,
      fulfillmentPickupPoints: promotion.pickupPoints.map((point) => point.pickupId),
      fulfillmentDeliveryZones: promotion.deliveryZones.map((zone) => zone.zoneId),
      frozenTermsOrigin: "backfilled",
    }) ?? "termes illisibles"
  );
}

/** Le rapport de la passe, à la manière de celui des remises. */
export function termsBackfillReport(
  lines: readonly TermsBackfillLine[],
  write: boolean,
): readonly string[] {
  const done = lines.filter((line) => line.outcome.kind === "backfilled").length;
  const undecided = lines.flatMap((line) =>
    line.outcome.kind === "undecided"
      ? [`  · ${line.orderNumber} (${line.orderDiscountId}) : ${line.outcome.reason}`]
      : [],
  );
  return [
    `Termes figés des remises ${write ? "écrits" : "À BLANC (rien d'écrit)"} : ` +
      `${String(done)} repris en « backfilled », ${String(undecided.length)} à trancher.`,
    ...undecided,
  ];
}
