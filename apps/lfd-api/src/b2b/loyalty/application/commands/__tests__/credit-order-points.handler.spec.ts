import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompletedOrder } from "../../../../orders/domain/ports/completed-order.reader.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import { OrderPointsCrediting } from "../../services/order-points-crediting.js";
import { CreditOrderPointsCommand } from "../credit-order-points.command.js";
import { CreditOrderPointsHandler } from "../credit-order-points.handler.js";
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
  const events = new RecordingPublisher();
  const crediting = new OrderPointsCrediting(
    ledger,
    new LedgerEarnedOrders(ledger),
    new FixedHolders({ "user:u1": "Léa Martin" }),
    new FixedIdGenerator("earn"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  const handler = new CreditOrderPointsHandler(
    new FixedCompletedOrders(orders),
    new FixedLoyaltySettings(settings),
    crediting,
  );
  return { ledger, events, handler };
}

describe("CreditOrderPointsHandler — le gain d'une commande définitive", () => {
  it("crédite l'assiette sous le verrou du titulaire, et la trace", async () => {
    const { ledger, events, handler } = setup([completedOrder()]);

    expect(await handler.execute(new CreditOrderPointsCommand("o1"))).toBe(true);

    expect(ledger.calls).toEqual(["lock:user:u1", "ledger.save"]);
    expect(ledger.entries).toMatchObject([
      { kind: "earned", points: 2_340, orderId: "o1", occurredAt: NOW },
    ]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "loyalty.points_earned",
      subjectType: "user",
      subjectId: "u1",
      payload: { subjectLabel: "Léa Martin", points: 2_340, order: { id: "o1", name: "CMD-1" } },
    });
  });

  it("🔴 ne crédite jamais deux fois la même commande", async () => {
    const { ledger, events, handler } = setup([completedOrder()]);
    await handler.execute(new CreditOrderPointsCommand("o1"));

    expect(await handler.execute(new CreditOrderPointsCommand("o1"))).toBe(false);

    expect(ledger.entries).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("ne fait rien sur une commande qui n'est pas définitive (pas remise, ou pas `paid`)", async () => {
    const { ledger, handler } = setup([]);
    expect(await handler.execute(new CreditOrderPointsCommand("o1"))).toBe(false);
    expect(ledger.calls).toEqual([]);
  });

  it.each([
    ["le programme est fermé", completedOrder(), null],
    ["l'acheteur est un invité", completedOrder({ buyerHasAccount: false }), OPEN_TO_PUBLIC],
    [
      "un pro n'a plus de société",
      completedOrder({ clientele: "pro", companyId: null }),
      { ...OPEN_TO_PUBLIC, openToPro: true },
    ],
    [
      "la clientèle pro est fermée",
      completedOrder({ clientele: "pro", companyId: "c1" }),
      OPEN_TO_PUBLIC,
    ],
  ] as const)("ne prend aucun verrou et n'écrit rien quand %s", async (_case, order, settings) => {
    const { ledger, events, handler } = setup([order], settings);
    expect(await handler.execute(new CreditOrderPointsCommand("o1"))).toBe(false);
    expect(ledger.calls).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("n'accorde rien sur le port ni sur la surtaxe", async () => {
    const { ledger, handler } = setup([
      completedOrder({ totalCents: 3_340, deliveryFeeCents: 700, lateFeeCents: 300 }),
    ]);
    await handler.execute(new CreditOrderPointsCommand("o1"));
    expect(ledger.entries[0]?.points).toBe(2_340);
  });
});
