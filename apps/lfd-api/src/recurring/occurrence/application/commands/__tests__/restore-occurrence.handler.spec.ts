import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { BasketFacts } from "../../../../basket/application/services/basket-facts.js";
import { BasketGestures } from "../../../../basket/application/services/basket-gestures.js";
import { day, openBasket } from "../../../../basket/domain/entities/__tests__/basket-fixtures.js";
import { BasketLine } from "../../../../basket/domain/value-objects/basket-line.js";
import { Occurrence } from "../../../domain/entities/occurrence.js";
import {
  OccurrenceNotPlannedError,
  OccurrenceTransitionRefusedError,
} from "../../../domain/errors/occurrence-errors.js";
import {
  FixedStanding,
  InMemoryBaskets,
  InMemoryOccurrences,
  RecordingDurable,
} from "../../__tests__/recurring-doubles.js";
import { RestoreOccurrenceCommand } from "../restore-occurrence.command.js";
import { RestoreOccurrenceHandler } from "../restore-occurrence.handler.js";

const NOW = new Date("2026-11-04T09:00:00.000Z");
const TEMPLATE = [
  { sku: "PAN-001", quantity: 4 },
  { sku: "CRO-002", quantity: 6 },
];

function build() {
  const baskets = new InMemoryBaskets();
  const occurrences = new InMemoryOccurrences();
  const events = new RecordingPublisher();
  const basket = openBasket();
  void baskets.insert(basket);
  const occurrence = Occurrence.plan({
    id: "occ_1",
    basketId: basket.id,
    serviceDay: day("2026-11-16"),
    at: NOW,
  });
  void occurrences.insertMany([occurrence]);
  const standing = new FixedStanding();
  const durable = new RecordingDurable();
  const handler = new RestoreOccurrenceHandler(
    occurrences,
    new BasketGestures(baskets, standing),
    new BasketFacts(standing, durable, new FixedIdGenerator("gesture")),
    events,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { occurrence, occurrences, events, durable, handler };
}

const restore = (date = "2026-11-16") => new RestoreOccurrenceCommand("user_1", "basket_1", date);

describe("RestoreOccurrenceHandler", () => {
  it("rétablit une échéance sautée : de nouveau à passer, journalisée vers le gabarit", async () => {
    const { occurrence, occurrences, events, durable, handler } = build();
    occurrence.skip("En vacances", NOW);
    occurrences.overwrite(occurrence.snapshot);

    await handler.execute(restore());

    expect(occurrences.stateOn("2026-11-16")).toBe("planned");
    expect([...occurrences.rows.values()][0]).toMatchObject({ lines: null, note: "" });
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      {
        date: "2026-11-16",
        before: { skipped: true, lines: [] },
        after: { skipped: false, lines: TEMPLATE },
      },
    ]);
    expect(durable.types).toEqual(["recurring.basket_occurrence_changed"]);
  });

  it("rétablit une échéance modifiée : ses lignes propres s'effacent", async () => {
    const { occurrence, occurrences, events, handler } = build();
    occurrence.override([BasketLine.create("PAN-001", 9)], "", NOW);
    occurrences.overwrite(occurrence.snapshot);

    await handler.execute(restore());

    expect([...occurrences.rows.values()][0]?.lines).toBeNull();
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { skipped: false, lines: [{ sku: "PAN-001", quantity: 9 }] },
    });
  });

  it("une échéance déjà au gabarit : ni écriture, ni fait — le rejeu ne journalise rien", async () => {
    const { events, durable, handler } = build();

    await handler.execute(restore());

    expect(events.traced).toHaveLength(0);
    expect(durable.facts).toHaveLength(0);
  });

  it("refuse un jour sans échéance prévue", async () => {
    const { handler } = build();

    await expect(handler.execute(restore("2026-11-17"))).rejects.toBeInstanceOf(
      OccurrenceNotPlannedError,
    );
  });

  it("refuse de rétablir une échéance déjà passée", async () => {
    const { occurrence, occurrences, events, handler } = build();
    occurrence.place("order_1", NOW);
    occurrences.overwrite(occurrence.snapshot);

    await expect(handler.execute(restore())).rejects.toBeInstanceOf(
      OccurrenceTransitionRefusedError,
    );
    expect(events.traced).toHaveLength(0);
  });
});
