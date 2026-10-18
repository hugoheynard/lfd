import { localToInstant } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { AudienceIncrement } from "../../../domain/audience-event-batch.js";
import {
  AudienceBatchTooLargeError,
  UnknownAudienceSkuError,
} from "../../../domain/errors/recommendation-errors.js";
import { AudienceCounterWriter } from "../../../domain/ports/audience-counter.writer.js";
import { AudienceSkuReader } from "../../../domain/ports/audience-sku.reader.js";
import { RecordProductAudienceCommand } from "../record-product-audience.command.js";
import { RecordProductAudienceHandler } from "../record-product-audience.handler.js";

const TODAY = "2026-03-10";

class KnownSkus extends AudienceSkuReader {
  constructor(private readonly known: readonly string[]) {
    super();
  }
  servedAmong(skus: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(skus.filter((sku) => this.known.includes(sku))));
  }
}

class RecordingCounters extends AudienceCounterWriter {
  readonly writes: { day: string; increments: readonly AudienceIncrement[] }[] = [];
  add(day: string, increments: readonly AudienceIncrement[]): Promise<void> {
    this.writes.push({ day, increments });
    return Promise.resolve();
  }
}

function clockAt(day: string, time: string): FixedClock {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new RangeError(`${time} n'existe pas le ${day} à Paris`);
  }
  return new FixedClock(instant);
}

describe("RecordProductAudienceHandler", () => {
  it("compte le lot totalisé sur le jour MÉTIER de Paris, pas le jour UTC", async () => {
    const counters = new RecordingCounters();
    // 00:30 à Paris est encore la veille en UTC.
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "00:30"),
    );

    await handler.execute(
      new RecordProductAudienceCommand([
        { sku: "CRO", event: "product_viewed" },
        { sku: "CRO", event: "product_viewed" },
      ]),
    );

    expect(counters.writes).toEqual([
      {
        day: TODAY,
        increments: [{ sku: "CRO", event: "product_viewed", placement: "none", count: 2 }],
      },
    ]);
  });

  it("refuse le lot entier quand un SKU n'est servi à personne, sans rien écrire", async () => {
    const counters = new RecordingCounters();
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "10:00"),
    );

    await expect(
      handler.execute(
        new RecordProductAudienceCommand([
          { sku: "CRO", event: "product_viewed" },
          { sku: "GHOST", event: "added_to_cart" },
        ]),
      ),
    ).rejects.toThrow(UnknownAudienceSkuError);
    expect(counters.writes).toEqual([]);
  });

  it("refuse un lot trop gros avant même de lire le catalogue", async () => {
    const counters = new RecordingCounters();
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "10:00"),
    );
    const events = Array.from({ length: 51 }, () => ({ sku: "CRO", event: "product_viewed" }));

    await expect(handler.execute(new RecordProductAudienceCommand(events))).rejects.toThrow(
      AudienceBatchTooLargeError,
    );
    expect(counters.writes).toEqual([]);
  });
});
