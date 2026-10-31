import type { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { AppliedBasketDiscount } from "../domain/entities/order-basket-discounts.js";
import type { OrderLineSnapshot } from "../domain/value-objects/order-line.js";
import { sharesJson } from "./order-discount-backfill.rows.js";
import { orderLineDataOf } from "./order-line.data.js";

/**
 * **Les remises de panier d'une commande, telles qu'elles s'écrivent** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.2 et § 18.5, lot M3. Partagé par la passation et la révision : deux
 * écritures de la même remise finiraient par figer deux choses.
 *
 * Les remises partent dans le `create` imbriqué de la commande (passation) ou
 * de ses lignes (révision) ; leurs couvertures, juste après, dans la MÊME
 * transaction — une couverture pointe une ligne, qui doit exister avant elle,
 * et Prisma ne garantit pas l'ordre de deux relations imbriquées sœurs. Les
 * lignes reçoivent donc leur identifiant ici plutôt que de la base.
 *
 * Le déclencheur différé `order_discounts_match_order` juge l'ensemble au
 * COMMIT : Σ des remises actives = `orders.discount_cents`.
 */

/** Une couverture pointe une ligne que la commande n'a pas — l'agrégat a rendu un indice faux. */
class DiscountCoverageOutOfRangeError extends TechnicalError {
  constructor(index: number) {
    super(
      "orders.discounts.coverage_out_of_range",
      `Une remise de panier couvre la ligne n° ${index + 1}, que la commande n'a pas : ` +
        "la commande n'est pas enregistrée. Prévenir l'équipe technique.",
    );
  }
}

/** Les lignes, avec l'identifiant que leurs couvertures citeront. */
export interface IdentifiedLines {
  readonly ids: readonly string[];
  readonly create: Prisma.OrderLineCreateWithoutOrderInput[];
}

export function identifiedLinesOf(
  lines: readonly OrderLineSnapshot[],
  nextId: () => string,
): IdentifiedLines {
  const create = lines.map((line) => ({ ...orderLineDataOf(line), id: nextId() }));
  return { ids: create.map((line) => line.id), create };
}

/** Les remises à imbriquer sous la commande, et leurs couvertures à écrire ensuite. */
export interface OrderDiscountsWrite {
  readonly create: Prisma.OrderDiscountCreateWithoutOrderInput[];
  readonly coverage: Prisma.OrderLineDiscountCreateManyInput[];
}

/** @throws {DiscountCoverageOutOfRangeError} une couverture hors des lignes. */
export function orderDiscountsWriteOf(
  discounts: readonly AppliedBasketDiscount[],
  lineIds: readonly string[],
  nextId: () => string,
): OrderDiscountsWrite {
  const create: Prisma.OrderDiscountCreateWithoutOrderInput[] = [];
  const coverage: Prisma.OrderLineDiscountCreateManyInput[] = [];
  for (const discount of discounts) {
    const id = nextId();
    create.push({
      id,
      origin: "computed",
      rank: discount.rank,
      promotionId: discount.promotionId,
      adjustment: discount.adjustment,
      // Absent = `NULL` : pas de libellé figé.
      ...(discount.label === null
        ? {}
        : { label: { fr: discount.label.fr, en: discount.label.en, it: discount.label.it } }),
      baseCents: discount.baseCents,
      amountCents: discount.amountCents,
      amountTtcCents: discount.amountTtcCents,
      vatShares: sharesJson(discount.vatShares),
    });
    for (const index of discount.coveredLines) {
      const orderLineId = lineIds[index];
      if (orderLineId === undefined) {
        throw new DiscountCoverageOutOfRangeError(index);
      }
      coverage.push({ orderLineId, orderDiscountId: id });
    }
  }
  return { create, coverage };
}

/** Les couvertures, après la commande et ses lignes — dans la transaction de l'appelant. */
export async function writeCoverage(
  client: Prisma.TransactionClient,
  coverage: readonly Prisma.OrderLineDiscountCreateManyInput[],
): Promise<void> {
  if (coverage.length > 0) {
    await client.orderLineDiscount.createMany({ data: [...coverage] });
  }
}
