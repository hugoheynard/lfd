import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompletedOrder } from "../../../../orders/domain/ports/completed-order.reader.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import { OrderPointsCrediting } from "../../services/order-points-crediting.js";
import {
  CREDIT_BATCH,
  CreditPendingOrderPointsHandler,
} from "../credit-pending-order-points.handler.js";
import {
  completedOrder,
  FixedCompletedOrders,
  FixedHolders,
  FixedLoyaltySettings,
  InMemoryLedger,
  LedgerEarnedOrders,
  OPEN_TO_PUBLIC,
} from "./loyalty-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");

function setup(
  orders: readonly CompletedOrder[],
  settings: LoyaltySettingsInput | null = OPEN_TO_PUBLIC,
) {
  const ledger = new InMemoryLedger();
  const earned = new LedgerEarnedOrders(ledger);
  const reader = new FixedCompletedOrders(orders);
  const crediting = new OrderPointsCrediting(
    ledger,
    earned,
    new FixedHolders({}),
    new FixedIdGenerator("earn"),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
  const handler = new CreditPendingOrderPointsHandler(
    reader,
    earned,
    new FixedLoyaltySettings(settings),
    crediting,
  );
  return { ledger, reader, handler };
}

/** `n` commandes définitives d'un même compte, aux identifiants triables. */
function many(n: number): CompletedOrder[] {
  return Array.from({ length: n }, (_, index) => {
    const id = `o${String(index).padStart(4, "0")}`;
    return completedOrder({ orderId: id, orderNumber: `CMD-${id}` });
  });
}

describe("CreditPendingOrderPointsHandler — le rattrapage", () => {
  it("crédite ce que l'abonné a manqué, et saute ce qui est déjà écrit", async () => {
    const { ledger, handler } = setup([
      completedOrder({ orderId: "o1" }),
      completedOrder({ orderId: "o2", orderNumber: "CMD-2", totalCents: 1_000 }),
    ]);
    ledger.entries.push({
      id: "déjà",
      holder: LoyaltyHolder.of("user", "u1"),
      kind: "earned",
      points: 2_340,
      orderId: "o1",
      voucherId: null,
      occurredAt: NOW,
      actorUserId: null,
      staffUserId: null,
      reason: null,
    });

    expect(await handler.execute()).toEqual({ scanned: 2, credited: 1 });
    expect(ledger.entries.map((entry) => entry.orderId)).toEqual(["o1", "o2"]);
  });

  it("parcourt tout par lots bornés, et un second passage n'écrit rien", async () => {
    const { ledger, reader, handler } = setup(many(CREDIT_BATCH + 3));

    expect(await handler.execute()).toEqual({
      scanned: CREDIT_BATCH + 3,
      credited: CREDIT_BATCH + 3,
    });
    expect(reader.pages).toHaveLength(2);
    expect(await handler.execute()).toEqual({ scanned: CREDIT_BATCH + 3, credited: 0 });
    expect(ledger.entries).toHaveLength(CREDIT_BATCH + 3);
  });

  it("programme fermé : ne parcourt rien", async () => {
    const { reader, handler } = setup(many(2), null);
    expect(await handler.execute()).toEqual({ scanned: 0, credited: 0 });
    expect(reader.pages).toEqual([]);
  });

  it("compte sans créditer les commandes qui ne rapportent rien (invité)", async () => {
    const { ledger, handler } = setup([completedOrder({ buyerHasAccount: false })]);
    expect(await handler.execute()).toEqual({ scanned: 1, credited: 0 });
    expect(ledger.entries).toEqual([]);
  });
});
