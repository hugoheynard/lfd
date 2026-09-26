import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InvalidLoyaltyReasonError,
  LoyaltyBalanceBelowZeroError,
} from "../../../domain/errors/loyalty-errors.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import { AdjustLoyaltyPointsCommand } from "../adjust-loyalty-points.command.js";
import { AdjustLoyaltyPointsHandler } from "../adjust-loyalty-points.handler.js";
import { FixedHolders, InMemoryLedger } from "./loyalty-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");
const PERSON = LoyaltyHolder.of("user", "u1");

function setup(label: string | null = "Léa Martin") {
  const ledger = new InMemoryLedger();
  const events = new RecordingPublisher();
  const handler = new AdjustLoyaltyPointsHandler(
    ledger,
    new FixedHolders({ "user:u1": label }),
    new FixedIdGenerator("adj"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { ledger, events, handler };
}

describe("AdjustLoyaltyPointsHandler — un geste motivé", () => {
  it("écrit la ligne sous verrou, signée et motivée, et la trace", async () => {
    const { ledger, events, handler } = setup();
    await handler.execute(new AdjustLoyaltyPointsCommand("user", "u1", 500, " geste ", "staff_1"));

    expect(ledger.calls).toEqual(["lock:user:u1", "ledger.save"]);
    expect(ledger.entries[0]).toMatchObject({
      kind: "adjusted",
      points: 500,
      reason: "geste",
      staffUserId: "staff_1",
      occurredAt: NOW,
    });
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "loyalty.points_adjusted",
      payload: { subjectLabel: "Léa Martin", points: 500, reason: "geste", voucher: null },
    });
  });

  it("omet le nom d'une personne qui n'en a pas, plutôt que d'en inventer un", async () => {
    const { events, handler } = setup(null);
    await handler.execute(new AdjustLoyaltyPointsCommand("user", "u1", 5, "geste", "staff_1"));
    expect(events.traced[0]?.journalFact().payload).not.toHaveProperty("subjectLabel");
  });

  it("refuse un retrait au-delà du solde, et ne trace rien", async () => {
    const { ledger, events, handler } = setup();
    ledger.seedEarned(PERSON, 100);
    await expect(
      handler.execute(new AdjustLoyaltyPointsCommand("user", "u1", -101, "erreur", "staff_1")),
    ).rejects.toThrow(LoyaltyBalanceBelowZeroError);
    expect(ledger.balanceOf(PERSON)).toBe(100);
    expect(events.traced).toEqual([]);
  });

  it("refuse un motif vide avant de prendre le verrou", async () => {
    const { ledger, handler } = setup();
    await expect(
      handler.execute(new AdjustLoyaltyPointsCommand("user", "u1", 10, "  ", "staff_1")),
    ).rejects.toThrow(InvalidLoyaltyReasonError);
    expect(ledger.calls).toEqual([]);
  });
});
