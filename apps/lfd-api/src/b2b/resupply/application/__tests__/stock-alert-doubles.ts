import { StockAlert, type StockAlertSnapshot } from "../../domain/stock-alert.js";
import { StockAlertReader } from "../../domain/stock-alert.reader.js";
import { StockAlertRepository } from "../../domain/stock-alert.repository.js";

function snapshotOf(alert: StockAlert, version: number): StockAlertSnapshot {
  return {
    id: alert.id,
    siteId: alert.siteId,
    sku: alert.sku,
    label: alert.label,
    level: alert.level,
    version,
    declared: alert.declared,
    lifted: alert.lifted,
  };
}

/**
 * Les alertes en mémoire, lecture ET écriture : `save` garde le dernier état
 * (dans l'ordre d'insertion), les lectures réhydratent sous le point demandé,
 * comme le `where` de la base.
 */
export class InMemoryStockAlerts extends StockAlertRepository {
  private readonly rows = new Map<string, StockAlertSnapshot>();
  saves = 0;

  load(siteId: string, alertId: string): Promise<StockAlert | null> {
    const row = this.rows.get(alertId);
    return Promise.resolve(
      row === undefined || row.siteId !== siteId ? null : StockAlert.restore(row),
    );
  }

  liveFor(siteId: string, sku: string): Promise<StockAlert | null> {
    const row = this.all().find(
      (alert) => alert.siteId === siteId && alert.sku === sku && alert.lifted === null,
    );
    return Promise.resolve(row === undefined ? null : StockAlert.restore(row));
  }

  save(alert: StockAlert): Promise<void> {
    this.saves += 1;
    this.rows.set(alert.id, snapshotOf(alert, alert.version + 1));
    return Promise.resolve();
  }

  all(): readonly StockAlertSnapshot[] {
    return [...this.rows.values()];
  }
}

/** Le lecteur sur le même stockage, les plus récemment déclarées d'abord. */
export class InMemoryStockAlertReader extends StockAlertReader {
  constructor(private readonly store: InMemoryStockAlerts) {
    super();
  }

  liveForSite(siteId: string): Promise<readonly StockAlertSnapshot[]> {
    return Promise.resolve(this.live().filter((alert) => alert.siteId === siteId));
  }

  liveEverywhere(): Promise<readonly StockAlertSnapshot[]> {
    return Promise.resolve(this.live());
  }

  private live(): StockAlertSnapshot[] {
    return this.store
      .all()
      .filter((alert) => alert.lifted === null)
      .sort((a, b) => b.declared.at.getTime() - a.declared.at.getTime());
  }
}
