import type { UpsertOccurrenceOverridePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { BasketFacts } from "../../../../basket/application/services/basket-facts.js";
import { BasketGestures } from "../../../../basket/application/services/basket-gestures.js";
import { day, openBasket } from "../../../../basket/domain/entities/__tests__/basket-fixtures.js";
import { Occurrence } from "../../../domain/entities/occurrence.js";
import {
  OccurrenceNotPlannedError,
  OccurrenceTransitionRefusedError,
} from "../../../domain/errors/occurrence-errors.js";
import {
  FixedArticles,
  FixedStanding,
  InMemoryBaskets,
  InMemoryOccurrences,
  RecordingDurable,
} from "../../__tests__/recurring-doubles.js";
import { OverrideOccurrenceCommand } from "../override-occurrence.command.js";
import { OverrideOccurrenceHandler } from "../override-occurrence.handler.js";

const NOW = new Date("2026-11-04T09:00:00.000Z");
const SKIP: UpsertOccurrenceOverridePayload = { skipped: true, lines: [], note: "" };
const SIX: UpsertOccurrenceOverridePayload = {
  skipped: false,
  lines: [{ sku: "PAN-001", quantity: 6 }],
  note: "",
};

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
  const handler = new OverrideOccurrenceHandler(
    occurrences,
    new BasketGestures(baskets, standing),
    new BasketFacts(standing, durable, new FixedIdGenerator("gesture")),
    new FixedArticles(),
    events,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { occurrence, occurrences, events, durable, handler };
}

const on = (date: string, payload: UpsertOccurrenceOverridePayload) =>
  new OverrideOccurrenceCommand("user_1", "basket_1", date, payload);

describe("OverrideOccurrenceHandler", () => {
  it("saute l'échéance et journalise la dérogation ; le rejeu n'écrit rien", async () => {
    const { occurrences, events, durable, handler } = build();

    await handler.execute(on("2026-11-16", SKIP));
    await handler.execute(on("2026-11-16", SKIP));

    expect(occurrences.stateOn("2026-11-16")).toBe("skipped");
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { date: "2026-11-16", before: null, after: { skipped: true, lines: [] } },
    ]);
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      "recurring.basket_occurrence_changed:basket_1:gesture_000001",
    ]);
  });

  it("saute une échéance refusée : le client renonce au jour que la passation refusait", async () => {
    const { occurrence, occurrences, handler } = build();
    occurrence.refuse("unavailable_sku", "Article indisponible.", false, NOW);
    occurrences.overwrite(occurrence.snapshot);

    await handler.execute(on("2026-11-16", SKIP));

    expect(occurrences.stateOn("2026-11-16")).toBe("skipped");
  });

  it("remplace les lignes, puis rétablit une échéance sautée", async () => {
    const { occurrences, handler } = build();

    await handler.execute(on("2026-11-16", SKIP));
    await handler.execute(on("2026-11-16", SIX));

    expect(occurrences.stateOn("2026-11-16")).toBe("planned");
    const row = [...occurrences.rows.values()][0];
    expect(row?.lines?.map((line) => [line.sku, line.quantity])).toEqual([["PAN-001", 6]]);
  });

  it("refuse un jour sans échéance prévue", async () => {
    const { handler } = build();

    await expect(handler.execute(on("2026-11-17", SKIP))).rejects.toBeInstanceOf(
      OccurrenceNotPlannedError,
    );
  });

  it("refuse de sauter une échéance déjà passée", async () => {
    const { occurrence, occurrences, events, handler } = build();
    occurrence.place("order_1", NOW);
    occurrences.overwrite(occurrence.snapshot);

    await expect(handler.execute(on("2026-11-16", SKIP))).rejects.toBeInstanceOf(
      OccurrenceTransitionRefusedError,
    );
    expect(events.traced).toHaveLength(0);
  });
});
