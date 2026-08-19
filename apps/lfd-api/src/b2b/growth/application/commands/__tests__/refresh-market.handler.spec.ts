import type { MarketConfigView, MarketZoneCount } from "@lfd/contracts";

import { Clock } from "../../../../../platform/time/clock.js";
import { MarketConfigStore } from "../../../domain/ports/market-config.store.js";
import { MarketDirectory } from "../../../domain/ports/market-directory.js";
import { RefreshMarketCommand } from "../refresh-market.command.js";
import { RefreshMarketHandler } from "../refresh-market.handler.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

/** Annuaire factice : compte = 10×(index NAF+1), pour vérifier la somme par zone. */
class FakeDirectory extends MarketDirectory {
  readonly calls: { naf: string; cp: string }[] = [];
  countEstablishments(nafCode: string, codePostal: string): Promise<number> {
    this.calls.push({ naf: nafCode, cp: codePostal });
    const base = nafCode === "56.10A" ? 100 : 20;
    return Promise.resolve(base);
  }
}

/** Store en mémoire : deux zones, deux NAF ; capture les comptages sauvegardés. */
class FakeStore extends MarketConfigStore {
  readonly saved: { cp: string; perNaf: readonly MarketZoneCount[]; addressable: number }[] = [];
  load(): Promise<MarketConfigView> {
    return Promise.resolve({
      zones: [
        { codePostal: "75011", addressable: 0, perNaf: [], fetchedAt: null },
        { codePostal: "69001", addressable: 0, perNaf: [], fetchedAt: null },
      ],
      nafCodes: [
        { code: "56.10A", label: "Restauration traditionnelle" },
        { code: "56.30Z", label: "Débits de boissons" },
      ],
      lastRefreshedAt: null,
    });
  }
  addZone(): Promise<void> {
    return Promise.resolve();
  }
  removeZone(): Promise<void> {
    return Promise.resolve();
  }
  addNaf(): Promise<void> {
    return Promise.resolve();
  }
  removeNaf(): Promise<void> {
    return Promise.resolve();
  }
  saveZoneCounts(
    codePostal: string,
    perNaf: readonly MarketZoneCount[],
    addressable: number,
  ): Promise<void> {
    this.saved.push({ cp: codePostal, perNaf, addressable });
    return Promise.resolve();
  }
}

class FixedClock extends Clock {
  now(): Date {
    return NOW;
  }
}

describe("RefreshMarketHandler", () => {
  it("interroge chaque NAF × zone, somme en addressable et fige le comptage", async () => {
    const store = new FakeStore();
    const directory = new FakeDirectory();
    const handler = new RefreshMarketHandler(store, directory, new FixedClock());

    await handler.execute(new RefreshMarketCommand());

    // 2 zones × 2 NAF = 4 appels.
    expect(directory.calls).toHaveLength(4);
    // Chaque zone : 100 (56.10A) + 20 (56.30Z) = 120.
    expect(store.saved).toHaveLength(2);
    for (const row of store.saved) {
      expect(row.addressable).toBe(120);
      expect(row.perNaf).toEqual([
        { code: "56.10A", count: 100 },
        { code: "56.30Z", count: 20 },
      ]);
    }
  });
});
