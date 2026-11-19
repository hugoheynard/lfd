import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { InMemoryProductCatalog } from "../../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { deadlineOf } from "../../../../application/services/__tests__/order-deadline-of.js";
import { ConsignedOverrides } from "../../../../domain/ports/__tests__/item-limit-override-doubles.js";
import type { ItemLimitOverride } from "../../../../domain/services/item-limit-overrides.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import {
  CATALOG,
  content,
  DAY,
  NOW,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";
import { RevisionCutoffs } from "../revision-cutoffs.js";

/**
 * **La borne de paiement d'une hausse** (plan
 * `documentation/limites-de-commande/plan-passer-outre-la-limite-produit.md`,
 * § 3.6) : une limite d'article passée outre et consignée n'y compte pas,
 * sans quoi la hausse naîtrait échue. Instants de la scène, horloge FIXE.
 *
 * La scène : la règle générale ferme la veille à 18 h, soit
 * `2026-11-09T17:00Z` ; le pain se commande trois jours avant — passé.
 */
const GENERAL_LIMIT = new Date("2026-11-09T17:00:00.000Z");

const GENERAL_RULE = {
  list: () =>
    Promise.resolve([
      {
        id: "general",
        pickupAddressId: null,
        pickupLabel: null,
        weekday: null,
        daysBefore: 1,
        time: "18:00",
        graceMinutes: 0,
      },
    ]),
};

const ITEMS = CATALOG.map((item) =>
  item.sku === "PAI-001"
    ? {
        ...item,
        orderTimeLimit: { daysBefore: 3, time: "12:00", graceMinutes: 0, staffMayExceed: true },
      }
    : { ...item, orderTimeLimit: null },
);

const BREAD_OVERRIDE: ItemLimitOverride = {
  id: "ovr_1",
  orderId: "ord_1",
  sku: "PAI-001",
  staffUserId: "stf_1",
  reason: "Salon",
  serviceDay: DAY,
  daysBefore: 3,
  time: "12:00",
  limitAt: NOW,
  origin: "placement",
  createdAt: NOW,
};

const CROISSANTS = { sku: "VIE-001", quantity: 10 } as const;
const ONE_BREAD = { sku: "PAI-001", quantity: 1 } as const;

function cutoffs(consigned: readonly ItemLimitOverride[]): RevisionCutoffs {
  return new RevisionCutoffs(
    deadlineOf({ cutoffs: GENERAL_RULE, catalog: new InMemoryProductCatalog(ITEMS) }),
    new ConsignedOverrides(consigned),
  );
}

async function withBread(): Promise<RevisableOrder> {
  const base = await placedOrder();
  const { revision } = await revisingAt(new FixedClock(NOW)).compose(
    base,
    content({ lines: [CROISSANTS, ONE_BREAD] }),
    { kind: "staff", staffId: "stf_1" },
    { requireChange: false, decidedAt: NOW },
  );
  return { ...base, lines: revision.state.lines };
}

describe("RevisionCutoffs.paymentCutoff — la borne d'une hausse", () => {
  const MORE_CROISSANTS = content({ lines: [{ sku: "VIE-001", quantity: 20 }, ONE_BREAD] });

  it("écarte la limite consignée : la borne est l'heure limite générale", async () => {
    const order = await withBread();

    const cutoff = await cutoffs([BREAD_OVERRIDE]).paymentCutoff(order, MORE_CROISSANTS, NOW);

    expect(cutoff).toEqual(GENERAL_LIMIT);
  });

  it("sans trace consignée, la limite passée du pain borne la hausse avant maintenant", async () => {
    const order = await withBread();

    const cutoff = await cutoffs([]).paymentCutoff(order, MORE_CROISSANTS, NOW);

    expect(cutoff?.getTime()).toBeLessThan(NOW.getTime());
  });
});
