/**
 * Port de **lecture** : le point suit-il son stock au comptoir ? Lu par les
 * gestes qui posent OK · Faible · Rupture et par la vue du comptoir.
 */
export abstract class CounterStockTracking {
  /** Le réglage du point, ou `STOCK_TRACKING_BY_DEFAULT` s'il n'a jamais été réglé. */
  abstract isTrackedAt(siteId: string): Promise<boolean>;
}
