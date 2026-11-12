import { localToInstant } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { AudienceIncrement } from "../../../domain/audience-event-batch.js";
import {
  AudienceBatchTooLargeError,
  AudienceSourceMismatchError,
  UnknownAudienceSkuError,
} from "../../../domain/errors/recommendation-errors.js";
import { AudienceCounterWriter } from "../../../domain/ports/audience-counter.writer.js";
import { AudienceSkuReader } from "../../../domain/ports/audience-sku.reader.js";
import { RecordProductAudienceCommand } from "../record-product-audience.command.js";
import { RecordProductAudienceHandler } from "../record-product-audience.handler.js";
import { InMemoryAudienceBatchLedger } from "../../../infrastructure/in-memory-audience-batch.ledger.js";

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

function ledgerAt(day: string): InMemoryAudienceBatchLedger {
  return new InMemoryAudienceBatchLedger(clockAt(day, "10:00"));
}

class FailingCounters extends AudienceCounterWriter {
  add(): Promise<void> {
    return Promise.reject(new RangeError("base indisponible"));
  }
}

describe("RecordProductAudienceHandler", () => {
  it("compte le lot totalisé sur le jour MÉTIER de Paris, pas le jour UTC", async () => {
    const counters = new RecordingCounters();
    // 00:30 à Paris est encore la veille en UTC.
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "00:30"),
      ledgerAt(TODAY),
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
        increments: [
          { sku: "CRO", event: "product_viewed", placement: "none", source: "none", count: 2 },
        ],
      },
    ]);
  });

  it("refuse le lot entier quand un SKU n'est servi à personne, sans rien écrire", async () => {
    const counters = new RecordingCounters();
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "10:00"),
      ledgerAt(TODAY),
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
      ledgerAt(TODAY),
    );
    const events = Array.from({ length: 51 }, () => ({ sku: "CRO", event: "product_viewed" }));

    await expect(handler.execute(new RecordProductAudienceCommand(events))).rejects.toThrow(
      AudienceBatchTooLargeError,
    );
    expect(counters.writes).toEqual([]);
  });

  it("refuse une suggestion qui ne dit pas sa source, sans rien écrire", async () => {
    const counters = new RecordingCounters();
    const handler = new RecordProductAudienceHandler(
      new KnownSkus(["CRO"]),
      counters,
      clockAt(TODAY, "10:00"),
      ledgerAt(TODAY),
    );

    await expect(
      handler.execute(
        new RecordProductAudienceCommand([
          { sku: "CRO", event: "suggestion_clicked", placement: "cart" },
        ]),
      ),
    ).rejects.toThrow(AudienceSourceMismatchError);
    expect(counters.writes).toEqual([]);
  });

  describe("un lot rejoué ne compte qu'une fois", () => {
    const VIEW = [{ sku: "CRO", event: "product_viewed" }];

    function handlerWith(counters: AudienceCounterWriter) {
      return new RecordProductAudienceHandler(
        new KnownSkus(["CRO"]),
        counters,
        clockAt(TODAY, "10:00"),
        ledgerAt(TODAY),
      );
    }

    // Régression : un même lot reçu deux fois (réseau qui rejoue) comptait chaque vue deux fois.
    it("le même identifiant de lot, reçu deux fois → une seule écriture", async () => {
      const counters = new RecordingCounters();
      const handler = handlerWith(counters);

      await handler.execute(new RecordProductAudienceCommand(VIEW, "batch_a"));
      await handler.execute(new RecordProductAudienceCommand(VIEW, "batch_a"));

      expect(counters.writes).toHaveLength(1);
    });

    it("deux lots distincts aux vues identiques → deux écritures : rien n'est sous-compté", async () => {
      const counters = new RecordingCounters();
      const handler = handlerWith(counters);

      await handler.execute(new RecordProductAudienceCommand(VIEW, "batch_a"));
      await handler.execute(new RecordProductAudienceCommand(VIEW, "batch_b"));

      expect(counters.writes).toHaveLength(2);
    });

    it("sans identifiant (écran d'avant), chaque lot compte comme avant", async () => {
      const counters = new RecordingCounters();
      const handler = handlerWith(counters);

      await handler.execute(new RecordProductAudienceCommand(VIEW));
      await handler.execute(new RecordProductAudienceCommand(VIEW));

      expect(counters.writes).toHaveLength(2);
    });

    it("un comptage en échec rend le lot : son rejeu compte", async () => {
      const counters = new RecordingCounters();
      const ledger = ledgerAt(TODAY);
      const failing = new RecordProductAudienceHandler(
        new KnownSkus(["CRO"]),
        new FailingCounters(),
        clockAt(TODAY, "10:00"),
        ledger,
      );
      const working = new RecordProductAudienceHandler(
        new KnownSkus(["CRO"]),
        counters,
        clockAt(TODAY, "10:00"),
        ledger,
      );

      await expect(
        failing.execute(new RecordProductAudienceCommand(VIEW, "batch_a")),
      ).rejects.toThrow(RangeError);
      await working.execute(new RecordProductAudienceCommand(VIEW, "batch_a"));

      expect(counters.writes).toHaveLength(1);
    });
  });
});
