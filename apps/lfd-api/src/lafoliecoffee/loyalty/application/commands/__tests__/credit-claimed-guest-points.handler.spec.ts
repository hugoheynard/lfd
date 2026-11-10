import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompletedOrder } from "../../../../orders/domain/ports/completed-order.reader.js";
import type {
  LoyaltySettingsInput,
  LoyaltySettingsMilestones,
} from "../../../domain/value-objects/loyalty-settings.js";
import { OrderPointsCrediting } from "../../services/order-points-crediting.js";
import { CreditClaimedGuestPointsHandler } from "../credit-claimed-guest-points.handler.js";
import { CreditClaimedGuestPointsCommand } from "../credit-claimed-guest-points.command.js";
import { CREDIT_BATCH } from "../credit-pending-order-points.handler.js";
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
const HOUR_MS = 60 * 60 * 1000;

function setup(
  orders: readonly CompletedOrder[],
  settings: LoyaltySettingsInput | null = OPEN_TO_PUBLIC,
  milestones?: LoyaltySettingsMilestones,
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
  const handler = new CreditClaimedGuestPointsHandler(
    reader,
    new FixedLoyaltySettings(settings, milestones),
    crediting,
  );
  return { ledger, reader, handler };
}

/** Le rattaché, au moment du crédit : son `sub` est posé, il a un compte. */
const CLAIMED = "u_claimed";

describe("CreditClaimedGuestPointsHandler — le crédit immédiat d'un invité rattaché", () => {
  it("crédite SES commandes définitives, et seulement les siennes", async () => {
    const { ledger, handler } = setup([
      completedOrder({ orderId: "o1", placedByUserId: CLAIMED }),
      completedOrder({ orderId: "o2", placedByUserId: "u_autre" }),
    ]);

    expect(await handler.execute(new CreditClaimedGuestPointsCommand(CLAIMED))).toBe(1);
    expect(ledger.entries.map((entry) => entry.orderId)).toEqual(["o1"]);
  });

  it("un second passage n'écrit rien, et parcourt par lots bornés", async () => {
    const orders = Array.from({ length: CREDIT_BATCH + 1 }, (_, index) =>
      completedOrder({ orderId: `o${String(index).padStart(4, "0")}`, placedByUserId: CLAIMED }),
    );
    const { reader, handler } = setup(orders);

    expect(await handler.execute(new CreditClaimedGuestPointsCommand(CLAIMED))).toBe(
      CREDIT_BATCH + 1,
    );
    expect(reader.pages).toHaveLength(2);
    expect(await handler.execute(new CreditClaimedGuestPointsCommand(CLAIMED))).toBe(0);
  });

  it("programme fermé : ne lit rien", async () => {
    const { reader, handler } = setup([completedOrder({ placedByUserId: CLAIMED })], null);

    expect(await handler.execute(new CreditClaimedGuestPointsCommand(CLAIMED))).toBe(0);
    expect(reader.pages).toEqual([]);
  });

  /** R4 : une commande passée avant l'ouverture au public ne rapporte rien, rattachée ou non. */
  it("ne crédite pas une commande passée avant l'ouverture au public (R4)", async () => {
    const opened = new Date(NOW.getTime() - HOUR_MS);
    const { ledger, handler } = setup(
      [
        completedOrder({
          orderId: "o_avant",
          placedByUserId: CLAIMED,
          placedAt: new Date(opened.getTime() - HOUR_MS),
        }),
        completedOrder({ orderId: "o_apres", placedByUserId: CLAIMED, placedAt: NOW }),
      ],
      OPEN_TO_PUBLIC,
      { publicOpenedAt: opened, welcomeBonusSince: null },
    );

    expect(await handler.execute(new CreditClaimedGuestPointsCommand(CLAIMED))).toBe(1);
    expect(ledger.entries.map((entry) => entry.orderId)).toEqual(["o_apres"]);
  });
});
