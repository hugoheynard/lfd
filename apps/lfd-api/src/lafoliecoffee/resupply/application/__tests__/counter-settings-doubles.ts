import { CounterImmediateWithoutStock } from "../../domain/counter-immediate-without-stock.js";
import { CounterSites, type CounterSite } from "../../domain/counter-sites.js";
import {
  STOCK_TRACKING_BY_DEFAULT,
  type CounterStockSetting,
} from "../../domain/counter-stock-setting.js";
import { CounterStockSettingsReader } from "../../domain/counter-stock-settings.reader.js";
import { CounterStockSettingsWriter } from "../../domain/counter-stock-settings.writer.js";
import { CounterStockTracking } from "../../domain/counter-stock-tracking.js";

/** Les réglages posés, en mémoire : une ligne par point, réécrite à chaque `put`. */
export class InMemoryCounterStockSettings extends CounterStockSettingsWriter {
  readonly rows = new Map<string, CounterStockSetting>();

  put(setting: CounterStockSetting): Promise<void> {
    this.rows.set(setting.siteId, setting);
    return Promise.resolve();
  }
}

/** Le lecteur des réglages sur le même stockage ; un point jamais réglé est absent. */
export class InMemoryCounterStockSettingsReader extends CounterStockSettingsReader {
  constructor(private readonly store: InMemoryCounterStockSettings) {
    super();
  }

  of(siteIds: readonly string[]): Promise<ReadonlyMap<string, CounterStockSetting>> {
    return Promise.resolve(
      new Map([...this.store.rows].filter(([siteId]) => siteIds.includes(siteId))),
    );
  }
}

/** Le suivi du stock lu sur le même stockage, ou le défaut. */
export class InMemoryCounterStockTracking extends CounterStockTracking {
  constructor(private readonly store: InMemoryCounterStockSettings) {
    super();
  }

  isTrackedAt(siteId: string): Promise<boolean> {
    return Promise.resolve(this.store.rows.get(siteId)?.stockTracking ?? STOCK_TRACKING_BY_DEFAULT);
  }
}

/** Le suivi du stock d'une liste fixe de points : les autres ne le suivent pas. */
export class TrackedSites extends CounterStockTracking {
  constructor(private readonly tracked: readonly string[]) {
    super();
  }

  isTrackedAt(siteId: string): Promise<boolean> {
    return Promise.resolve(this.tracked.includes(siteId));
  }
}

/** Les points non archivés, dans l'ordre donné. */
export class FixedCounterSites extends CounterSites {
  constructor(private readonly sites: readonly CounterSite[]) {
    super();
  }

  active(): Promise<readonly CounterSite[]> {
    return Promise.resolve(this.sites);
  }
}

/** Le retrait immédiat sans stock, permis sur une liste fixe de points ; aucun par défaut. */
export class FixedImmediateWithoutStock extends CounterImmediateWithoutStock {
  constructor(private readonly sites: readonly string[] = []) {
    super();
  }

  allowsAt(siteId: string): Promise<boolean> {
    return Promise.resolve(this.sites.includes(siteId));
  }
}
