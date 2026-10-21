import { addDays, localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffNotice } from "../order-cutoff-notice.service.js";

// Dates comparées entre elles seulement : l'horloge est celle de la fixture.
const TODAY = "2026-03-10";
const TOMORROW = addDays(TODAY, 1);

function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new RangeError(`${time} n'existe pas le ${day} à Paris`);
  }
  return instant;
}

class Rules extends OrderCutoffReader {
  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }
  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rules);
  }
}

function general(time: string, graceMinutes = 0): OrderCutoffView {
  return {
    id: "cutoff-1",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore: 1,
    time,
    graceMinutes,
  };
}

function item(sku: string, limit: UnsealedCatalogItem["orderTimeLimit"]): UnsealedCatalogItem {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit: limit,
  };
}

const CATALOG = new InMemoryProductCatalog([
  item("PLAIN", null),
  item("EARLY", { daysBefore: 1, time: "09:00", graceMinutes: 0 }),
  item("LATE", { daysBefore: 0, time: "12:00", graceMinutes: 0 }),
]);

function notice(rules: readonly OrderCutoffView[], now: Date): OrderCutoffNotice {
  return new OrderCutoffNotice(new Rules(rules), CATALOG, new FixedClock(now));
}

describe("OrderCutoffNotice — le signal d'heure limite du devis", () => {
  it("annonce la limite générale quand elle est encore devant", async () => {
    const view = await notice([general("18:00")], at(TODAY, "10:00")).forDay(["PLAIN"], TOMORROW);
    expect(view).toEqual({ status: "open", until: at(TODAY, "18:00").toISOString() });
  });

  it("annonce la limite de l'article quand elle tombe avant la règle générale", async () => {
    const view = await notice([general("18:00")], at(TODAY, "08:00")).forDay(
      ["PLAIN", "EARLY"],
      TOMORROW,
    );
    expect(view).toEqual({ status: "open", until: at(TODAY, "09:00").toISOString() });
  });

  it("signale le rattrapage de la règle générale, avec sa fin", async () => {
    const view = await notice([general("09:30", 60)], at(TODAY, "10:00")).forDay(
      ["PLAIN"],
      TOMORROW,
    );
    expect(view).toEqual({ status: "grace", until: at(TODAY, "10:30").toISOString() });
  });

  /** Même règle que la passation : la plus stricte gagne, la limite d'article ne relâche rien. */
  it("signale « fermé » quand la règle générale est passée, même si l'article ferme plus tard", async () => {
    const view = await notice([general("09:00")], at(TODAY, "10:00")).forDay(["LATE"], TOMORROW);
    expect(view).toEqual({ status: "closed", until: null });
  });

  it("dit ouvert, sans heure, quand rien n'est réglé", async () => {
    const view = await notice([], at(TODAY, "10:00")).forDay(["PLAIN"], TOMORROW);
    expect(view).toEqual({ status: "open", until: null });
  });
});
