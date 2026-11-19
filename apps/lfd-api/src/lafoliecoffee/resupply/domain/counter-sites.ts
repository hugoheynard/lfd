/** Un point de retrait non archivé et son nom. */
export interface CounterSite {
  readonly id: string;
  readonly label: string;
}

/** Port de **lecture** des points qui ont un comptoir à régler. */
export abstract class CounterSites {
  /** Les points non archivés, par nom. */
  abstract active(): Promise<readonly CounterSite[]>;
}
