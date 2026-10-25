/**
 * **Un bon servi à une date passée, passé par le vrai chemin** (plan T,
 * `documentation/commandes/plan-t-commandes-de-test-par-le-vrai-chemin.md`).
 *
 * Les suites de facturation et de prélèvement ont besoin d'un bon au compte
 * servi avant une clôture. Il se passe par `placeOrder` trois jours avant son
 * jour de service — l'heure limite se juge à cet instant —, et quand la suite
 * a posé une horloge FIXE, elle est ramenée à l'instant de passation le temps
 * de passer, puis rendue : sans quoi la passation se jugerait après la
 * clôture et refuserait un jour passé.
 *
 * Le retrait reste à la suite (`markDelivered` ou `handOver` des factories) :
 * aucune route ne remet une commande dans le passé (plan T, 2026-10-25).
 */
import { instantToLocal } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  pickupSite,
  placeOrder,
  type OrderLineSeed,
  type PlacedTestOrder,
} from "./order-factory.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Trois jours avant le jour de service : l'heure limite est loin. */
const LEAD_DAYS = 3;
/** Cinquante croissants au tarif du catalogue. */
const DEFAULT_LINES: readonly OrderLineSeed[] = [{ sku: "VIE-001", quantity: 50 }];

export interface ServedOrderSeed {
  readonly buyerUserId: string;
  readonly companyId: string;
  /** L'instant de service ; son jour de Paris est le jour demandé. */
  readonly servedAt: Date;
  readonly lines?: readonly OrderLineSeed[];
}

/** Ce que la passation a écrit, relu — jamais recopié. */
export interface ServedOrder extends PlacedTestOrder {
  readonly totalCents: number;
}

/** Passe le bon au compte, trois jours avant `servedAt`, et relit son total. */
export async function placeServedOrder(
  ctx: E2eContext,
  seed: ServedOrderSeed,
): Promise<ServedOrder> {
  const placedAt = new Date(seed.servedAt.getTime() - LEAD_DAYS * DAY_MS);
  const clock = ctx.app.get(Clock);
  const fixed = clock instanceof FixedClock ? clock : null;
  const now = clock.now();
  fixed?.set(placedAt);
  try {
    const order = await placeOrder(ctx, {
      buyerUserId: seed.buyerUserId,
      companyId: seed.companyId,
      settlement: "account",
      placedAt,
      forDay: instantToLocal(seed.servedAt).day,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: seed.lines ?? DEFAULT_LINES,
    });
    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true },
    });
    return { ...order, totalCents };
  } finally {
    fixed?.set(now);
  }
}
