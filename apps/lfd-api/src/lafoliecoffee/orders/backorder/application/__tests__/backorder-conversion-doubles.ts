import type { CartAdjustment } from "@lfd/contracts";
import { lineTotalCents, pieces } from "@lfd/money";

import type { RevisableDiscount } from "../../../domain/services/basket-discount-replay.js";
import type { OrderLineSnapshot } from "../../../domain/value-objects/order-line.js";
import { Backorder, type BackorderSnapshot } from "../../domain/entities/backorder.js";
import {
  BackorderReplayReader,
  type BackorderOriginReplay,
} from "../../domain/ports/backorder-replay.reader.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";

/** Le dépôt du reliquat, en mémoire : il note chaque verrou et chaque écriture dans la trace. */
export class InMemoryBackorders extends BackorderRepository {
  private readonly rows = new Map<string, BackorderSnapshot>();
  readonly saved: BackorderSnapshot[] = [];

  constructor(
    seeded: readonly Backorder[],
    readonly trace: string[] = [],
  ) {
    super();
    for (const backorder of seeded) {
      this.rows.set(backorder.id, backorder.toSnapshot());
    }
  }

  load(id: string): Promise<Backorder | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : Backorder.restore(row));
  }

  loadLocked(id: string): Promise<Backorder | null> {
    this.trace.push("lock-backorder");
    return this.load(id);
  }

  save(backorder: Backorder): Promise<void> {
    this.trace.push("save-backorder");
    const snapshot = backorder.toSnapshot();
    this.rows.set(snapshot.id, snapshot);
    this.saved.push(snapshot);
    return Promise.resolve();
  }

  /** L'état écrit, tel que la prochaine lecture le rendra. */
  stateOf(id: string): BackorderSnapshot | undefined {
    return this.rows.get(id);
  }
}

/** Le prix d'origine, fixé par le test. */
export class FixedBackorderReplays extends BackorderReplayReader {
  readonly asked: string[] = [];

  constructor(private readonly origin: BackorderOriginReplay | null) {
    super();
  }

  replayOf(originOrderId: string): Promise<BackorderOriginReplay | null> {
    this.asked.push(originOrderId);
    return Promise.resolve(this.origin);
  }
}

export const ORIGIN_ORDER = "order_origin";
export const ORIGIN_NUMBER = "ORD-12";
export const BACKORDER = "bo_1";

/** Une ligne de l'origine, au prix figé d'alors (3,00 € HT la pièce par défaut). */
export function originLine(over: Partial<OrderLineSnapshot> = {}): OrderLineSnapshot {
  const quantity = over.quantity ?? 10;
  const unitPriceMillicents = over.unitPriceMillicents ?? 300_000;
  return {
    sku: "PAI-001",
    productName: "Pain",
    unitPriceMillicents,
    vatRate: 5.5,
    quantity,
    saleUnit: "piece",
    lineTotalCents: lineTotalCents(unitPriceMillicents, pieces(quantity)),
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: true,
    productId: "p_pain",
    categoryId: "c_pains",
    madeToOrder: true,
    ...over,
  };
}

/** Une remise active de l'origine, telle que la révision la rejoue. */
export function activeDiscount(
  adjustment: CartAdjustment | null,
  over: Partial<RevisableDiscount> = {},
): RevisableDiscount {
  return {
    orderDiscountId: `od_${adjustment?.mode ?? "frozen"}`,
    promotionId: `promo_${adjustment?.mode ?? "frozen"}`,
    adjustment,
    label: "Remise",
    servedLabel: { fr: "Remise", en: "Discount", it: "Sconto" },
    coveredSkus: null,
    amountCents: 300,
    amountTtcCents: null,
    terms: null,
    ...over,
  };
}

/** L'origine : ses lignes et ses remises actives ; aucune remise par défaut. */
export function originReplay(
  over: {
    readonly lines?: readonly OrderLineSnapshot[];
    readonly discounts?: readonly RevisableDiscount[];
  } = {},
): BackorderOriginReplay {
  return {
    originOrderNumber: ORIGIN_NUMBER,
    lines: over.lines ?? [originLine()],
    replayable: {
      activeDiscounts: over.discounts ?? [],
      discountPromotionId: null,
      discountAdjustment: null,
      discountLabel: null,
      discountCents: 0,
      discountTtcCents: null,
    },
  };
}

/** Un reliquat ouvert de quatre pains, d'une société. */
export function openBackorder(
  over: { readonly companyId?: string | null; readonly quantity?: number } = {},
): Backorder {
  return Backorder.open({
    id: BACKORDER,
    originOrderId: ORIGIN_ORDER,
    companyId: over.companyId === undefined ? "co_bistrot" : over.companyId,
    buyerUserId: "usr_chef",
    lines: [BackorderLine.of({ sku: "PAI-001", quantity: over.quantity ?? 4, saleUnit: "piece" })],
    openedAt: new Date("2026-08-10T10:00:00.000Z"),
  });
}
