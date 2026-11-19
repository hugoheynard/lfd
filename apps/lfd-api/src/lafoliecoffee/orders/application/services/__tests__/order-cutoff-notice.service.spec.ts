import { addDays, localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { OrderCutoffsInForce } from "../../../../order-cutoffs/domain/order-cutoffs-in-force.js";
import { OrderCutoffNotice } from "../order-cutoff-notice.service.js";
import { deadlineOf } from "./order-deadline-of.js";
import type {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../../../order-cutoffs/domain/deadline/ports/deadline-sources.js";

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

class Rules extends OrderCutoffsInForce {
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

/** L'avis ne lit ni dérogation ni surtaxe : ces doubles refusent d'être lus. */
const NO_WAIVERS: OpenWaiverReader = {
  openFor: () => Promise.reject(new Error("l'avis ne lit pas les dérogations")),
};
const NO_FEE: LateFeeSettingReader = {
  current: () => Promise.reject(new Error("l'avis ne lit pas la surtaxe")),
};

const CATALOG = new InMemoryProductCatalog([
  item("PLAIN", null),
  item("EARLY", { daysBefore: 1, time: "09:00", graceMinutes: 0, staffMayExceed: false }),
  item("LATE", { daysBefore: 0, time: "12:00", graceMinutes: 0, staffMayExceed: false }),
  item("PASSABLE", { daysBefore: 2, time: "09:00", graceMinutes: 0, staffMayExceed: true }),
]);

/** Aucune limite de produit passée ni fermée. */
const NO_ITEM_LIMIT = { exceeded: [], closedByItemLimit: [] };

function notice(rules: readonly OrderCutoffView[], now: Date): OrderCutoffNotice {
  return new OrderCutoffNotice(
    deadlineOf({
      cutoffs: new Rules(rules),
      catalog: CATALOG,
      waivers: NO_WAIVERS,
      lateFees: NO_FEE,
    }),
    new FixedClock(now),
  );
}

describe("OrderCutoffNotice — le signal d'heure limite du devis", () => {
  it("annonce la limite générale quand elle est encore devant", async () => {
    const view = await notice([general("18:00")], at(TODAY, "10:00")).forDay(
      ["PLAIN"],
      TOMORROW,
      "planned",
      false,
    );
    expect(view).toEqual({
      status: "open",
      until: at(TODAY, "18:00").toISOString(),
      ...NO_ITEM_LIMIT,
    });
  });

  it("annonce la limite de l'article quand elle tombe avant la règle générale", async () => {
    const view = await notice([general("18:00")], at(TODAY, "08:00")).forDay(
      ["PLAIN", "EARLY"],
      TOMORROW,
      "planned",
      false,
    );
    expect(view).toEqual({
      status: "open",
      until: at(TODAY, "09:00").toISOString(),
      ...NO_ITEM_LIMIT,
    });
  });

  it("signale le rattrapage de la règle générale, avec sa fin", async () => {
    const view = await notice([general("09:30", 60)], at(TODAY, "10:00")).forDay(
      ["PLAIN"],
      TOMORROW,
      "planned",
      false,
    );
    expect(view).toEqual({
      status: "grace",
      until: at(TODAY, "10:30").toISOString(),
      ...NO_ITEM_LIMIT,
    });
  });

  /** Même règle que la passation : la plus stricte gagne, la limite d'article ne relâche rien. */
  it("signale « fermé » quand la règle générale est passée, même si l'article ferme plus tard", async () => {
    const view = await notice([general("09:00")], at(TODAY, "10:00")).forDay(
      ["LATE"],
      TOMORROW,
      "planned",
      false,
    );
    expect(view).toEqual({ status: "closed", until: null, ...NO_ITEM_LIMIT });
  });

  it("dit ouvert, sans heure, quand rien n'est réglé", async () => {
    const view = await notice([], at(TODAY, "10:00")).forDay(["PLAIN"], TOMORROW, "planned", false);
    expect(view).toEqual({ status: "open", until: null, ...NO_ITEM_LIMIT });
  });

  /**
   * Lot L4 du circuit du jour J : une commande sur stock n'a pas d'heure
   * limite — l'annoncer « fermée » promettrait un refus qui n'arrive pas.
   */
  it("dit ouvert, sans heure, pour une commande sur stock même la limite passée", async () => {
    const view = await notice([general("09:00")], at(TODAY, "10:00")).forDay(
      ["PLAIN"],
      TODAY,
      "shelf",
      false,
    );
    expect(view).toEqual({ status: "open", until: null, ...NO_ITEM_LIMIT });
  });

  describe("les limites de produit, pour l'équipe", () => {
    // Le 10 à 10 h pour le 11 : « 2 jours avant, 9 h » est tombé le 9 ; la
    // règle générale (la veille à 18 h) ne l'est pas.
    const ask = (exceedItemLimits: boolean) =>
      notice([general("18:00")], at(TODAY, "10:00")).forDay(
        ["PLAIN", "PASSABLE", "EARLY"],
        TOMORROW,
        "planned",
        exceedItemLimits,
      );

    it("annonce la limite passée et la dit dépassable, avec le droit", async () => {
      const view = await ask(true);
      expect(view.exceeded).toEqual([
        {
          sku: "PASSABLE",
          daysBefore: 2,
          time: "09:00",
          limitAt: at(addDays(TODAY, -1), "09:00").toISOString(),
        },
      ]);
      expect(view.closedByItemLimit).toEqual([
        { sku: "PASSABLE", exceedable: true },
        { sku: "EARLY", exceedable: false },
      ]);
      // EARLY (la veille à 9 h) ferme encore le panier : seul PASSABLE passe.
      expect(view.status).toBe("closed");
    });

    it("ne dit rien de dépassable sans le droit", async () => {
      const view = await ask(false);
      expect(view.exceeded).toEqual([]);
      expect(view.closedByItemLimit).toEqual([
        { sku: "PASSABLE", exceedable: false },
        { sku: "EARLY", exceedable: false },
      ]);
    });
  });
});
